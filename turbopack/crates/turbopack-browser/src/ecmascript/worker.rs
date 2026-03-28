use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::minify::minify;

/// A pre-compiled worker entrypoint that bootstraps workers by reading config from URL params.
///
/// The worker receives a JSON array via URL params of the following structure:
/// `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...forwarded_global_values]`
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Browser Worker Entrypoint")]
pub struct EcmascriptBrowserWorkerEntrypoint {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    /// Global variable names to forward from main thread to worker.
    /// These are assigned to `self` in the worker scope before loading chunks.
    /// Values are passed via URL params at indices 2+.
    forwarded_globals: ResolvedVc<Vec<RcStr>>,
    /// When true, generate an ES module bootstrap (using import() instead of importScripts).
    is_esm: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserWorkerEntrypoint {
    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        forwarded_globals: Vc<Vec<RcStr>>,
        is_esm: bool,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptBrowserWorkerEntrypoint {
            chunking_context,
            forwarded_globals: forwarded_globals.to_resolved().await?,
            is_esm,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        let forwarded_globals = this.forwarded_globals.await?;
        let mut code = generate_worker_bootstrap_code(&forwarded_globals, this.is_esm)?;

        if let MinifyType::Minify { mangle } = *this.chunking_context.minify_type().await? {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let chunk_root_path = self.chunking_context.chunk_root_path().owned().await?;
        let forwarded_globals = self.forwarded_globals.await?;
        let globals_hash = hash_xxh3_hash64(&*forwarded_globals);
        let modifier = if self.is_esm {
            rcstr!("turbopack module worker entrypoint")
        } else {
            rcstr!("turbopack worker entrypoint")
        };
        let ident = AssetIdent::from_path(chunk_root_path)
            .with_modifier(modifier)
            .with_modifier(format!("{globals_hash:08x}").into());
        Ok(ident)
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            *this.chunking_context,
            self.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBrowserWorkerEntrypoint {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(vec![
            ResolvedVc::upcast(self.source_map().to_resolved().await?),
        ])))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserWorkerEntrypoint {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = self.ident_for_path();
        let extension_tag = if this.is_esm {
            rcstr!("turbopack-module-worker")
        } else {
            rcstr!("turbopack-worker")
        };
        Ok(this.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            ident,
            Some(extension_tag),
            rcstr!(".js"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBrowserWorkerEntrypoint {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
                    .await?,
            ))
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserWorkerEntrypoint {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

/// Generates the worker bootstrap code as inline JavaScript.
///
/// The worker receives a JSON array via URL params of the following structure:
/// `[TURBOPACK_NEXT_CHUNK_URLS, ASSET_SUFFIX, ...forwarded_global_values]`
fn generate_worker_bootstrap_code(forwarded_globals: &[RcStr], is_esm: bool) -> Result<Code> {
    if is_esm {
        generate_module_worker_bootstrap_code(forwarded_globals)
    } else {
        generate_classic_worker_bootstrap_code(forwarded_globals)
    }
}

/// Generates bootstrap code for a classic (non-module) web worker.
/// Uses `importScripts` to load chunks synchronously.
fn generate_classic_worker_bootstrap_code(forwarded_globals: &[RcStr]) -> Result<Code> {
    let mut code: CodeBuilder = CodeBuilder::default();

    // Generate the Object.assign properties for forwarded globals
    // params[0] = chunk URLs, params[1] = ASSET_SUFFIX, params[2+] = forwarded globals
    let mut global_assignments = vec![
        "TURBOPACK_NEXT_CHUNK_URLS: chunkUrls".to_string(),
        "TURBOPACK_ASSET_SUFFIX: param(1)".to_string(),
    ];
    for (i, name) in forwarded_globals.iter().enumerate() {
        // Forwarded globals start at params[2]
        global_assignments.push(format!("{name}: param({n})", n = i + 2));
    }
    let globals_js = global_assignments.join(",\n    ");

    // This code is slightly paranoid to avoid being useful as an XSS gadget.
    //
    // First, it verifies that it is running in a worker environment, which
    // guarantees that the requestor shares the same origin as the script
    // itself.
    //
    // Additionally, the code only allows loading scripts from the same origin,
    // mitigating the risk that the worker could be exploited to fetch or run
    // scripts from cross-origin sources.
    //
    // The snippet also validates types for all parameters to prevent unexpected
    // usage.

    writedoc!(
        code,
        r##"
        (function() {{
        function abort(message) {{
            console.error(message);
            throw new Error(message);
        }}
        if (
            typeof self["WorkerGlobalScope"] === "undefined" ||
            !(self instanceof self["WorkerGlobalScope"])
        ) {{
            abort("Worker entrypoint must be loaded in a worker context");
        }}

        // Try querystring first (SharedWorker), then hash (regular Worker)
        var url = new URL(location.href);
        var paramsString = url.searchParams.get("params");
        if (!paramsString && url.hash.startsWith("#params=")) {{
            paramsString = decodeURIComponent(url.hash.slice("#params=".length));
        }}

        if (!paramsString) abort("Missing worker bootstrap config");

        var params = JSON.parse(paramsString);
        var param = (n) => typeof params[n] === 'string' ? params[n] : '';
        var chunkUrls = Array.isArray(params[0]) ? params[0] : [];

        Object.assign(self, {{
            {0}
        }});

        if (chunkUrls.length > 0) {{
            var scriptsToLoad = [];
            for (var i = 0; i < chunkUrls.length; i++) {{
                var chunk = chunkUrls[i];
                // Chunks are relative to the origin.
                var chunkUrl = new URL(chunk, location.origin);
                if (chunkUrl.origin !== location.origin) {{
                    abort("Refusing to load script from foreign origin: " + chunkUrl.origin);
                }}
                scriptsToLoad.push(chunkUrl.toString());
            }}

            // As scripts are loaded, allow them to pop from the array
            chunkUrls.reverse();
            importScripts.apply(self, scriptsToLoad);
        }}
        }})();
        "##,
        globals_js
    )?;

    Ok(code.build())
}

/// Generates bootstrap code for an ES module web worker.
/// Uses dynamic `import()` to load chunks, enabling strict mode and ESM semantics.
///
/// Note: This file is served with `type: "module"`, so top-level `await` is available.
/// All loaded chunks will run in strict mode.
fn generate_module_worker_bootstrap_code(forwarded_globals: &[RcStr]) -> Result<Code> {
    let mut code: CodeBuilder = CodeBuilder::default();

    // Generate the Object.assign properties for forwarded globals
    // params[0] = chunk URLs, params[1] = ASSET_SUFFIX, params[2+] = forwarded globals
    let mut global_assignments = vec![
        "TURBOPACK_NEXT_CHUNK_URLS: chunkUrls".to_string(),
        "TURBOPACK_ASSET_SUFFIX: param(1)".to_string(),
    ];
    for (i, name) in forwarded_globals.iter().enumerate() {
        // Forwarded globals start at params[2]
        global_assignments.push(format!("{name}: param({n})", n = i + 2));
    }
    let globals_js = global_assignments.join(",\n    ");

    writedoc!(
        code,
        r##"
        if (
            typeof self["WorkerGlobalScope"] === "undefined" ||
            !(self instanceof self["WorkerGlobalScope"])
        ) {{
            throw new Error("Worker entrypoint must be loaded in a worker context");
        }}

        // Try querystring first (SharedWorker), then hash (regular Worker)
        var url = new URL(location.href);
        var paramsString = url.searchParams.get("params");
        if (!paramsString && url.hash.startsWith("#params=")) {{
            paramsString = decodeURIComponent(url.hash.slice("#params=".length));
        }}

        if (!paramsString) throw new Error("Missing worker bootstrap config");

        var params = JSON.parse(paramsString);
        var param = (n) => typeof params[n] === 'string' ? params[n] : '';
        var chunkUrls = Array.isArray(params[0]) ? params[0] : [];

        Object.assign(self, {{
            {0}
        }});

        // Restore original chunk order (params are stored reversed) so that
        // TURBOPACK_NEXT_CHUNK_URLS matches the original order.
        chunkUrls.reverse();

        await Promise.all(chunkUrls.map(function(chunk) {{
            var chunkUrl = new URL(chunk, location.origin);
            if (chunkUrl.origin !== location.origin) {{
                throw new Error("Refusing to load script from foreign origin: " + chunkUrl.origin);
            }}
            return import(chunkUrl.toString());
        }}));
        "##,
        globals_js
    )?;

    Ok(code.build())
}
