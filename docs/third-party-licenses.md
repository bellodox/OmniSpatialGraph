# Third-party licensing evidence

Inspected **2026-10-16**, for the private checkout on branch vector, Git HEAD **a8665685ba6a49ad8b081a9e3cbd62983bb0efb4** plus the current uncommitted dependency changes. This is factual evidence and an actionable review checklist, **not legal advice, redistribution clearance or Q/gate approval**. The Apache checkout [LICENSE](../LICENSE) is unchanged; the [2026-10-16 binding human decision](decisions.md#2026-10-16--binding-human-first-party-licensing-decision) resolves the frozen MIT discrepancy for first-party licensing only: repository-authored code (not borrowed) is Apache-2.0, copyright Vlad Bellomorski; third-party components retain their own licences. See [limitations](limitations.md#human-decisions) and [NOTICE](../NOTICE).

## Grammar payloads and source linkage

The installed Microsoft bundle 0.3.1 contains its Microsoft MIT license, WASM files and a component manifest, **not separate license texts for each grammar**. Its [release tag](https://github.com/microsoft/vscode-tree-sitter-wasm/tree/78c97c860ddd965b9617f0e30962ad1da08c4c91), [build references](https://github.com/microsoft/vscode-tree-sitter-wasm/blob/v0.3.1/build/main.ts) and [lockfile](https://github.com/microsoft/vscode-tree-sitter-wasm/blob/v0.3.1/package-lock.json) identify the following source inputs. These establish declared build provenance, not a reproduced binary-to-source match; the npm version metadata supplies no gitHead. Preserve each grammar's own copyright and permission text, not just Microsoft's bundle license.

| Used grammar | Declared source input | Inspected primary license / attribution |
| --- | --- | --- |
| TypeScript / TSX | 0.23.2 | [MIT, 2017 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-typescript/blob/v0.23.2/LICENSE) |
| JavaScript / JSX | 0.25.0 | [MIT, 2014 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-javascript/blob/v0.25.0/LICENSE) |
| Python | 0.25.0 | [MIT, 2016 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-python/blob/v0.25.0/LICENSE) |
| Go | 0.25.0 | [MIT, 2014 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-go/blob/v0.25.0/LICENSE) |
| Rust | 261b20226c04ef601adbdf185a800512a5f66291 | [MIT, 2017 Maxim Sokolov](https://github.com/tree-sitter/tree-sitter-rust/blob/261b20226c04ef601adbdf185a800512a5f66291/LICENSE) |
| Java | 0.23.5 | [MIT, 2017 Ayman Nadeem](https://github.com/tree-sitter/tree-sitter-java/blob/v0.23.5/LICENSE) |
| C# | 485f0bae0274ac9114797fc10db6f7034e4086e3 | [MIT, 2014–2023 Max Brunsfeld, Damien Guard, Amaan Qureshi and contributors](https://github.com/tree-sitter/tree-sitter-c-sharp/blob/485f0bae0274ac9114797fc10db6f7034e4086e3/LICENSE) |
| C++ | 12bd6f7e96080d2e70ec51d4068f2f66120dde35 | [MIT, 2014 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-cpp/blob/12bd6f7e96080d2e70ec51d4068f2f66120dde35/LICENSE) |
| Ruby | 0.23.1 | [MIT, 2016 Rob Rix](https://github.com/tree-sitter/tree-sitter-ruby/blob/v0.23.1/LICENSE) |
| PHP | 0.24.2 | [MIT, 2017 Josh Vera/GitHub; 2019 Max Brunsfeld, Amaan Qureshi, Christian Frøystad, Caleb White](https://github.com/tree-sitter/tree-sitter-php/blob/v0.24.2/LICENSE) |

The TypeScript source lock also includes JavaScript 0.23.1 as a nested build dependency; reconcile inherited grammar material when assembling notices. The installed component manifest names Tree-sitter **0.25.1 / fc15f621334a262039ffaded5937e2844f88da61**, whereas the tagged build selects **v0.25.10**. Both inspected [manifest-referenced source](https://github.com/tree-sitter/tree-sitter/blob/fc15f621334a262039ffaded5937e2844f88da61/LICENSE) and [build-referenced source](https://github.com/tree-sitter/tree-sitter/blob/v0.25.10/LICENSE) carry MIT, 2018–2024 Max Brunsfeld. **Actual runtime artifact linkage is not proved**; do not silently choose one version as established binary provenance.

The installed tree-sitter-wasms **0.1.13** ships an Unlicense for the packaging project. That does **not** relicense upstream grammars. Its [published metadata](https://registry.npmjs.org/tree-sitter-wasms/0.1.13) records gitHead **3e88dc9e36b4e8bf752ce53bea61e4b67282a2bb**; the [build lock at that commit](https://github.com/Gregoor/tree-sitter-wasms/blob/3e88dc9e36b4e8bf752ce53bea61e4b67282a2bb/pnpm-lock.yaml) resolves the ranges in the installed manifest as follows:

| Used grammar | Installed manifest → source lock | Inspected primary license / attribution |
| --- | --- | --- |
| C | ^0.20.7 → 0.20.8 | [MIT, 2014 Max Brunsfeld](https://github.com/tree-sitter/tree-sitter-c/blob/v0.20.8/LICENSE) |
| Kotlin | ^0.3.1 → 0.3.8 | [MIT, 2019 fwcd](https://github.com/fwcd/tree-sitter-kotlin/blob/0.3.8/LICENSE) |
| Swift | ^0.4.0 → 0.4.3 | [MIT, 2021 alex-pinkus](https://github.com/alex-pinkus/tree-sitter-swift/blob/0.4.3/LICENSE) |
| Solidity | b239a95f94cfcc6e7b3e961bc73a28d55e214f02 | [MIT text, 2020 Joran Honig](https://github.com/JoranHonig/tree-sitter-solidity/blob/b239a95f94cfcc6e7b3e961bc73a28d55e214f02/LICENSE) |

The inspected current Swift and Solidity default-branch licenses are also MIT, but current upstream is **not** evidence of which source built a released WASM. The table uses versioned historical evidence instead. Neither bundle has been reproducibly rebuilt here: **artifact linkage is not proved**, including for exact declared source commits. Additional unused grammars are present in the packages; any future whole-package redistribution needs their inventory too, not just the provider's used subset.

## Model and inference runtime

| Item | Exact evidence and limit |
| --- | --- |
| Model | Xenova/all-MiniLM-L6-v2, revision **751bff37182d3f1213fa05d7196b954e230abad9**. The publisher's [pinned README](https://huggingface.co/Xenova/all-MiniLM-L6-v2/raw/751bff37182d3f1213fa05d7196b954e230abad9/README.md) declares Apache-2.0 and identifies sentence-transformers/all-MiniLM-L6-v2 as base model. The [revision file list](https://huggingface.co/api/models/Xenova/all-MiniLM-L6-v2/revision/751bff37182d3f1213fa05d7196b954e230abad9) contains **no standalone LICENSE**. This is publisher metadata, not an independent rights-chain determination for weights/tokenizer/training material. |
| Tested weights | q8 ONNX SHA-256 **afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1**, supplied by the parent proof. Model/fixtures were removed afterward; no model is redistributed. The opt-in [proof harness](../tools/real-model-proof.mjs) pins acquisition; the ordinary [adapter](../packages/cli/src/embedder.ts:22) selects the model name/q8, not that immutable revision. Do not generalize the proof pin to all future downloads. |
| Transformers.js | Exact optional 4.3.1, [upstream Apache-2.0](https://github.com/huggingface/transformers.js/blob/4.3.1/LICENSE). Its supported Sharp range ^0.35.4 includes retained root 0.35.5. Checkout overrides do not propagate to consumers; LanceDB's separate embedding wrapper remains unsupported. |
| ONNX Runtime | Installed onnxruntime-node **1.30.0**; inspected package tree has no standalone license/third-party notice file. Versioned [Microsoft MIT license](https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE) and [ThirdPartyNotices](https://github.com/microsoft/onnxruntime/blob/v1.30.0/ThirdPartyNotices.txt) provide primary texts (the latter includes Intel MKL terms and many other components). Preserve applicable notices and map actual native build/providers to their source/build configuration before shipping; the aggregate notice is not proof every listed component is linked. The separate installed web package records commit **8d85527a010e294a26b274749f74294b2a32cec5**; that does not prove the node binary's commit. |

## Installed native notices and component inventory

**LanceDB 0.40.0:** inspected [upstream Apache-2.0](https://github.com/lancedb/lancedb/blob/v0.40.0/LICENSE). The installed JavaScript package contains [Node third-party inventory](../node_modules/@lancedb/lancedb/NODEJS_THIRD_PARTY_LICENSES.md), [Rust third-party license texts](../node_modules/@lancedb/lancedb/RUST_THIRD_PARTY_LICENSES.html) and [license header](../node_modules/@lancedb/lancedb/license_header.txt). The selected Windows x64 MSVC 0.40.0 native package contains binary and metadata, not a separate notice collection. Retain the parent package's applicable notices with any native distribution; map Rust component versions and source/release build to the selected binary. These installed evidence links require checkout dependencies; they are not promised packaged files or proof of an exhaustive binary bill of materials. LanceDB remains a required dependency even though it was removed from root bundle metadata for npm validity; Arrow remains 18.1.0.

**Sharp Windows x64 0.35.5:** inspected installed [component notice table](../node_modules/@img/sharp-win32-x64/README.md), [Apache license](../node_modules/@img/sharp-win32-x64/LICENSE) and [exact component versions](../node_modules/@img/sharp-win32-x64/versions.json). The package includes two separate libvips DLLs and a Sharp addon; separate DLLs alone do not prove LGPL compliance/relinkability. The supplier table selects LGPLv3 using earlier-version “or later” clauses; libvips 8.18.7's own [primary license file](https://github.com/libvips/libvips/blob/v8.18.7/LICENSE) is LGPL 2.1 text. Preserve this distinction instead of treating Sharp's Apache license as covering every component.

| Supplier notice terms | Exact installed component versions |
| --- | --- |
| LGPLv3 selection | exif 0.6.26; fribidi 1.0.17; glib 2.90.0; heif 1.23.5; pango 1.58.2; proxy-libintl 0.5; rsvg 2.63.2; vips 8.18.7 |
| MPL 1.1 | cairo 1.18.6 |
| MIT | cgif 0.5.4; expat 2.8.5; ffi 3.8.0; harfbuzz 14.5.0; lcms 2.19.1; pixman 0.46.4; uhdr 2.0.2; xml2 2.15.4 |
| BSD / related / patent terms | aom 3.15.1 (BSD-2 + AOM patent license); archive 3.8.9 (BSD-2); fontconfig 2.18.3 (fontconfig license); freetype 2.14.3 (FTL); highway 1.4.0 (BSD-3); imagequant 2.4.1 (supplier's BSD-2 fork); png 1.6.58 (libpng license); tiff 4.7.2 (libtiff license); webp 1.6.0 (New BSD) |
| Multiple / zlib terms | mozjpeg 0826579 (zlib, IJG, BSD-3); zlib-ng 2.3.3 (zlib) |

This is the **supplier's selected-build notice inventory**, not independent inspection of every component's primary source or binary composition. The supplier README also lists libnsgif without a matching version entry; resolve applicability/version rather than inventing one. WASM32 and other platform payloads need their own build-specific review. [Sharp/libvips supplier source and issue channel](https://github.com/lovell/sharp-libvips) is the starting point for exact source/patch/build correspondence, missing notices and replacement-library instructions.

## Human-owned distribution checklist

- First-party Apache-versus-MIT reconciliation is resolved by the [human decision](decisions.md#2026-10-16--binding-human-first-party-licensing-decision); third-party licences are unchanged. Resolve Q9 asset permissions and intended distribution scope; private remains true. This evidence does not authorize publishing.
- For the exact prospective archive/platform, inventory **all included** grammars, native libraries, inference providers and optional dependencies; map hashes to source commits/releases, patches and build flags. Resolve the runtime-manifest discrepancy and unproved WASM/native linkage. Root overrides are checkout-only; no consumer install parity is established.
- Assemble complete applicable copyright, MIT permission, Apache license/NOTICE, BSD/patent, MPL and LGPL texts with the actual artifact. A source URL or this table is **not a substitute for required included notices**. The current package file allowlist does not include this inventory; a future release must explicitly verify notice delivery, not assume the document ships.
- For LGPL components, have the owner determine the applicable license option and distribution obligations: corresponding source including modifications/build scripts, required source provision/offer, combined-work notices and GPL/LGPL texts, reverse-engineering rights for debugging modifications, and a practical compatible-library replacement/relinking route (including object/application material where applicable). Test that route for each binary arrangement. Address MPL source-file obligations separately. No blanket “closed” claim follows from dynamic DLLs or an audit pass.
- Map ONNX provider/native dependencies and Lance Rust notices to the actual build, preserve applicable terms, and obtain missing supplier material. Reassess model/tokenizer/weights rights and attribution if ever redistributed; currently none are included.

Primary license/notice/metadata and declared build references were inspected from publisher hosts; no upstream implementation or binary copies were added to the repository. No install, application test, model execution, OSG write, legal decision or gate operation was performed for this documentation work.
