use std::io::Write;

use anyhow::Result;
use indoc::{indoc, writedoc};
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
        let mut code = if this.is_esm {
            generate_module_worker_bootstrap_code(&forwarded_globals)
        } else {
            generate_script_worker_bootstrap_code(&forwarded_globals)
        }?;

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

/// Builds the `Object.assign(self, { ... })` properties that expose worker params as globals.
///
/// URL params layout: `params[0]` = chunk URLs array, `params[1]` = ASSET_SUFFIX string,
/// `params[2+]` = forwarded globals (one per entry in `forwarded_globals`).
fn build_globals_js(forwarded_globals: &[RcStr]) -> String {
    let mut assignments = vec![
        "TURBOPACK_NEXT_CHUNK_URLS: chunkUrls".to_string(),
        "TURBOPACK_ASSET_SUFFIX: param(1)".to_string(),
    ];
    for (i, name) in forwarded_globals.iter().enumerate() {
        assignments.push(format!("{name}: param({})", i + 2));
    }
    assignments.join(",\n    ")
}

/// Generates the shared worker preamble: `abort()` helper, WorkerGlobalScope guard,
/// and URL-params parsing into `chunkUrls`/`param` locals.
///
/// Callers must follow with an `Object.assign(self, { ... })` to expose chunk config
/// as worker globals, then either `importScripts` (classic) or `import()` (module) chunks.
fn build_preamble_js() -> &'static str {
    indoc! {"
        function abort(message) {
            console.error(message);
            throw new Error(message);
        }
        if (
            typeof self[\"WorkerGlobalScope\"] === \"undefined\" ||
            !(self instanceof self[\"WorkerGlobalScope\"])
        ) {
            abort(\"Worker entrypoint must be loaded in a worker context\");
        }

        // Try querystring first (SharedWorker), then hash (regular Worker)
        var url = new URL(location.href);
        var paramsString = url.searchParams.get(\"params\");
        if (!paramsString && url.hash.startsWith(\"#params=\")) {
            paramsString = decodeURIComponent(url.hash.slice(\"#params=\".length));
        }

        if (!paramsString) abort(\"Missing worker bootstrap config\");

        var params = JSON.parse(paramsString);
        var param = (n) => typeof params[n] === 'string' ? params[n] : '';
        var chunkUrls = Array.isArray(params[0]) ? params[0] : [];"}
}

/// Generates bootstrap code for a classic (non-module) web worker.
///
/// Uses `importScripts` to load chunks synchronously. The bootstrap code is wrapped in
/// an IIFE because classic worker scripts don't have module-level `await`.
///
/// The generated code is slightly paranoid to avoid being useful as an XSS gadget:
/// - Verifies it's running inside a `WorkerGlobalScope` (guarantees same-origin).
/// - Only loads chunk scripts from the same origin.
/// - Validates the type of every parameter before use.
fn generate_script_worker_bootstrap_code(forwarded_globals: &[RcStr]) -> Result<Code> {
    let mut code: CodeBuilder = CodeBuilder::default();
    let preamble = build_preamble_js();
    let globals = build_globals_js(forwarded_globals);

    writedoc!(
        code,
        r##"
        (function() {{
        {preamble}

        Object.assign(self, {{
            {globals}
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

            // Restore original order in TURBOPACK_NEXT_CHUNK_URLS (URL params store them reversed).
            chunkUrls.reverse();
            importScripts.apply(self, scriptsToLoad);
        }}
        }})();
        "##,
        preamble = preamble,
        globals = globals
    )?;

    Ok(code.build())
}

/// Generates bootstrap code for an ES module web worker.
///
/// Uses dynamic `import()` to load chunks in parallel. Because the entrypoint file itself is
/// served with `type: "module"`, top-level `await` is available and all loaded chunks run in
/// strict mode.
///
/// For SharedWorkers, the `await Promise.all(...)` creates a suspension point where the browser
/// event loop can dispatch `connect` events before the user module has registered its listener.
/// To fix this, connect events are buffered before the `await` and replayed after.
fn generate_module_worker_bootstrap_code(forwarded_globals: &[RcStr]) -> Result<Code> {
    let mut code: CodeBuilder = CodeBuilder::default();
    let preamble = build_preamble_js();
    let globals = build_globals_js(forwarded_globals);

    writedoc!(
        code,
        r##"
        {preamble}

        Object.assign(self, {{
            {globals}
        }});

        // Buffer connect events for SharedWorkers: the async await below creates a suspension
        // point where the browser can dispatch connect before the user module has registered
        // its addEventListener('connect', ...) handler.
        var _connectBuffer_ = null;
        var _connectListener_ = null;
        if (typeof self['SharedWorkerGlobalScope'] !== 'undefined' && self instanceof self['SharedWorkerGlobalScope']) {{
            _connectBuffer_ = [];
            _connectListener_ = function(e) {{ _connectBuffer_.push(e.ports[0]); }};
            self.addEventListener('connect', _connectListener_);
        }}

        await Promise.all(chunkUrls.map(function(chunk) {{
            return import(chunk);
        }}));

        // Replay connect events that arrived during async initialization
        if (_connectBuffer_ !== null) {{
            self.removeEventListener('connect', _connectListener_);
            for (var _i_ = 0; _i_ < _connectBuffer_.length; _i_++) {{
                self.dispatchEvent(new MessageEvent('connect', {{ ports: [_connectBuffer_[_i_]] }}));
            }}
        }}
        "##,
        preamble = preamble,
        globals = globals
    )?;

    Ok(code.build())
}
