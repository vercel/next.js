use std::io::Write;

use anyhow::Result;
use either::Either;
use indoc::writedoc;
use serde::Serialize;
use turbo_rcstr::rcstr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, ValueToString, Vc, turbobail};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkData, ChunkingContext, ChunksData, EvaluatableAssets, MinifyType,
        ModuleChunkItemIdExt, ModuleId,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkData, EcmascriptChunkPlaceable},
    minify::minify,
    utils::StringifyJs,
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::{
    BrowserChunkingContext,
    chunking_context::{CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR, CurrentChunkMethod},
};

/// An Ecmascript chunk that:
/// * Contains the Turbopack browser runtime code; and
/// * Evaluates a list of runtime entries.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Browser Evaluate Chunk")]
pub(crate) struct EcmascriptBrowserEvaluateChunk {
    chunking_context: ResolvedVc<BrowserChunkingContext>,
    ident: ResolvedVc<AssetIdent>,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    // TODO(sokra): It's weird to use ModuleGraph here, we should convert evaluatable_assets to a
    // list of chunk items before passing it to this struct
    module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserEvaluateChunk {
    /// Creates a new [`Vc<EcmascriptBrowserEvaluateChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        ident: ResolvedVc<AssetIdent>,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Vc<Self> {
        EcmascriptBrowserEvaluateChunk {
            chunking_context,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn chunks_data(&self) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            turbo_tasks::read!(self.chunking_context.output_root().owned())?,
            *self.other_chunks,
        ))
    }

    #[turbo_tasks::function]
    pub(crate) async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = turbo_tasks::read!(self)?;
        let environment = this.chunking_context.environment();

        let output_root_to_root_path =
            turbo_tasks::read!(this.chunking_context.output_root_to_root_path().owned())?;
        let source_maps = *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )?;
        // Lifetime hack to pull out the var into this scope
        let chunk_path;
        let script_or_path =
            match *turbo_tasks::read!(this.chunking_context.current_chunk_method())? {
                CurrentChunkMethod::StringLiteral => {
                    let output_root = turbo_tasks::read!(this.chunking_context.output_root())?;
                    let chunk_path_vc = self.path();
                    chunk_path = turbo_tasks::read!(chunk_path_vc)?;
                    let chunk_server_path = if let Some(path) = output_root.get_path_to(&chunk_path)
                    {
                        path
                    } else {
                        turbobail!("chunk path {chunk_path} is not in output root {output_root}");
                    };
                    Either::Left(StringifyJs(chunk_server_path))
                }
                CurrentChunkMethod::DocumentCurrentScript => {
                    Either::Right(CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR)
                }
            };

        let other_chunks_data = turbo_tasks::read!(self.chunks_data())?;
        let other_chunks_data = turbo_tasks::parallel!(other_chunks_data.iter())?;
        let other_chunks_data: Vec<_> = other_chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let evaluatable_assets = turbo_tasks::read!(this.evaluatable_assets)?;
        let chunking_context = this.chunking_context;
        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work runs concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let runtime_module_ids: Vec<_> = evaluatable_assets
            .iter()
            .map(move |entry| async move {
                if let Some(placeable) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*entry)
                {
                    Ok(Some(turbo_tasks::read!(
                        placeable.chunk_item_id(Vc::upcast(*chunking_context))
                    )?))
                } else {
                    Ok(None)
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();
        #[cfg(feature = "sync")]
        let runtime_module_ids: Vec<_> = {
            let mut runtime_module_ids = Vec::new();
            for entry in evaluatable_assets.iter() {
                if let Some(placeable) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*entry)
                {
                    runtime_module_ids.push(turbo_tasks::read!(
                        placeable.chunk_item_id(Vc::upcast(*chunking_context))
                    )?);
                }
            }
            runtime_module_ids
        };

        let params = EcmascriptBrowserChunkRuntimeParams {
            other_chunks: &other_chunks_data,
            runtime_module_ids,
        };

        let mut code = CodeBuilder::new(
            source_maps,
            *turbo_tasks::read!(this.chunking_context.debug_ids_enabled())?,
        );

        // Use the configured chunk loading global variable to store the chunk here.
        // This allows multiple runtimes to coexist on the same page when using different global
        // names.
        let chunk_loading_global =
            turbo_tasks::read!(this.chunking_context.chunk_loading_global())?;
        writedoc!(
            code,
            // `||=` would be better but we need to be es2020 compatible
            //`x || (x = default)` is better than `x = x || default` simply because we avoid _writing_ the property in the common case.
            r#"
                (globalThis[{chunk_loading_global}] || (globalThis[{chunk_loading_global}] = [])).push([
                    {script_or_path},
                    {params}
                ]);
            "#,
            chunk_loading_global = StringifyJs(&chunk_loading_global),
            params = StringifyJs(&params),
        )?;

        let asset_context = turbopack::get_runtime_asset_context(environment);

        let runtime_type = *turbo_tasks::read!(this.chunking_context.runtime_type())?;
        // Detect async modules from the whole-app graph in production. In development, the graph
        // is per-page. To keep the shared `runtime.js` stable, always include the machinery.
        let has_async_modules = if matches!(runtime_type, RuntimeType::Production) {
            !turbo_tasks::read!(this.module_graph.async_module_info())?.is_empty()
        } else {
            true
        };
        match runtime_type {
            RuntimeType::Production | RuntimeType::Development => {
                let runtime_code = turbopack_ecmascript_runtime::get_browser_runtime_code(
                    asset_context,
                    this.chunking_context.chunk_base_path(),
                    this.chunking_context.asset_suffix(),
                    runtime_type,
                    output_root_to_root_path,
                    source_maps,
                    this.chunking_context.chunk_loading_global(),
                    this.chunking_context.cross_origin(),
                    this.chunking_context.chunk_load_retry(),
                    has_async_modules,
                    this.chunking_context.chunk_loading(),
                );
                code.push_code(&*turbo_tasks::read!(runtime_code)?);
            }
            #[cfg(feature = "test")]
            RuntimeType::Dummy => {
                let runtime_code = turbopack_ecmascript_runtime::get_dummy_runtime_code();
                code.push_code(&runtime_code);
            }
        }

        let mut code = code.build();

        if let MinifyType::Minify { mangle } =
            *turbo_tasks::read!(this.chunking_context.minify_type())?
        {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = turbo_tasks::read!(self.ident.owned())?
            .with_modifier(rcstr!("ecmascript browser evaluate chunk"));

        let evaluatable_assets = turbo_tasks::read!(self.evaluatable_assets)?;
        ident.modifiers.extend(
            turbo_tasks::parallel!(
                evaluatable_assets
                    .iter()
                    .map(|entry| entry.ident().to_string())
            )?
            .into_iter()
            .map(|s| (*s).clone()),
        );
        let other_chunks = turbo_tasks::read!(self.other_chunks)?;
        ident.modifiers.extend(
            turbo_tasks::parallel!(other_chunks.iter().map(|chunk| chunk.path().to_string()))?
                .into_iter()
                .map(|s| (*s).clone()),
        );

        Ok(ident.into_vc())
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = turbo_tasks::read!(self)?;
        Ok(SourceMapAsset::new(
            Vc::upcast(*this.chunking_context),
            self.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
        let mut references = Vec::new();

        let include_source_map = *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )?;

        if include_source_map {
            references.push(ResolvedVc::upcast(turbo_tasks::read!(
                self.source_map().to_resolved()
            )?));
        }

        references.extend(turbo_tasks::read!(this.other_chunks)?.iter().copied());

        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = turbo_tasks::read!(self)?;
        let ident = self.ident_for_path();
        Ok(this.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            ident,
            Some(rcstr!("turbopack")),
            rcstr!(".js"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(turbo_tasks::read!(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
            )?))
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcmascriptBrowserChunkRuntimeParams<'a, T> {
    /// Other chunks in the chunk group this chunk belongs to, if any. Does not
    /// include the chunk itself.
    ///
    /// These chunks must be loaed before the runtime modules can be
    /// instantiated.
    other_chunks: &'a [T],
    /// List of module IDs that this chunk should instantiate when executed.
    runtime_module_ids: Vec<ModuleId>,
}
