// Register isolated test hooks through the asynchronous API available before Node 22.0.
// Keep null CommonJS sources untouched so native dependencies retain Node's normal loader.
export function moduleHooks(source) {
  const loader = `${source}
    export async function resolve(specifier, context, nextResolve) {
      return hooks.resolve ? hooks.resolve(specifier, context, nextResolve) : nextResolve(specifier, context);
    }
    export async function load(url, context, nextLoad) {
      return hooks.load ? hooks.load(url, context, nextLoad) : nextLoad(url, context);
    }`;
  const preload = `import { register } from 'node:module';
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)});`;
  return `data:text/javascript,${encodeURIComponent(preload)}`;
}
