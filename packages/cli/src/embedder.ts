import { OsgError } from '../../contracts/src/index.js';
import type { Embedder } from '../../core/src/embedding.js';

/** Sentence-embedding model run locally through the optional @huggingface/transformers package (quantized ONNX, 384 dimensions). */
export const modelName = 'Xenova/all-MiniLM-L6-v2';
const dimension = 384;

interface Tensor { data: Float32Array; dims: number[]; }
interface Extractor { (texts: string[], options: { pooling: 'mean'; normalize: true }): Promise<Tensor>; dispose?(): Promise<void>; }
interface Library {
  env: { cacheDir: string; localModelPath: string; allowLocalModels: boolean; allowRemoteModels: boolean };
  pipeline(task: 'feature-extraction', model: string, options: { dtype: 'q8' }): Promise<Extractor>;
}

/**
 * Loads the model. Only `download: true` (the embed command) may reach the network; every other command passes false,
 * so reading never writes and never fetches. Files are cached under `modelDirectory`.
 */
export async function loadEmbedder(modelDirectory: string, download: boolean): Promise<Embedder & { close(): Promise<void> }> {
  const specifier = '@huggingface/transformers';
  let library: Library;
  try { library = await import(specifier) as Library; }
  catch { throw new OsgError('UNSUPPORTED_OPERATION', 'Embeddings need the optional package @huggingface/transformers; see the README section on optional embeddings'); }
  // Downloaded files are stored as <cacheDir>/<model>/..., the same layout the local-model reader expects, so one directory serves both.
  library.env.cacheDir = modelDirectory;
  library.env.localModelPath = `${modelDirectory}/`;
  library.env.allowLocalModels = true;
  library.env.allowRemoteModels = download;
  let extractor: Extractor;
  try { extractor = await library.pipeline('feature-extraction', modelName, { dtype: 'q8' }); }
  catch { throw new OsgError('UNSUPPORTED_OPERATION', 'Embedding model is not available; run osg embed to download it'); }
  return {
    id: `${modelName}@q8`,
    dimension,
    async embed(texts) {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      if (output.dims.length !== 2 || output.dims[0] !== texts.length || output.dims[1] !== dimension) throw new OsgError('INTERNAL', 'Unexpected embedding shape');
      return texts.map((_, i) => output.data.slice(i * dimension, (i + 1) * dimension));
    },
    async close() { await extractor.dispose?.(); }
  };
}
