use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunksData, EvaluatableAsset, ModuleChunkItemIdExt, ModuleId,
        availability_info::AvailabilityInfo, worker_type::WorkerType,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::ModuleReferences,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    embed_js::embed_fs,
    references::esm::generated_export_key,
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::{StringifyJs, StringifyModuleId},
};

/// The `createWorker` runtime helper for `worker_type`, resolved through `asset_context`.
///
/// This is a real, on-demand module (it is only chunked into apps that actually use workers),
/// so it needs an `AssetContext` to be processed with. Two places resolve it and they *must*
/// agree on the exact same `Vc`, because the generated loader code embeds this module's chunk
/// item id:
///
/// - `WorkerAssetReference` declares a reference to it next to the worker reference itself, so the
///   module graph discovers it during construction and assigns it an id.
/// - `WorkerLoaderModule` (created later, during chunking) embeds that id.
///
/// Both pass `origin.asset_context()` — the loader recovers it from its inner module via
/// [`ResolveOrigin`], which is the same context `url_resolve`/`process_resolve_result` used to
/// resolve the worker in the first place. Since this function is memoized on its arguments,
/// equal arguments yield the identical `Vc` and therefore the identical chunk item.
///
/// [`ResolveOrigin`]: turbopack_core::resolve::origin::ResolveOrigin
#[turbo_tasks::function]
pub async fn create_worker_module(
    asset_context: Vc<Box<dyn AssetContext>>,
    worker_type: WorkerType,
) -> Result<Vc<Box<dyn Module>>> {
    let helper = match worker_type {
        WorkerType::WebWorker | WorkerType::SharedWebWorker => {
            rcstr!("worker/browser/createWorker.ts")
        }
        WorkerType::NodeWorkerThread => rcstr!("worker/node/createWorker.ts"),
    };
    Ok(asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed_fs()
                    .to_resolved()
                    .await?
                    .root()
                    .await?
                    .join(&helper)?,
            )),
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Import),
        )
        .module())
}

/// The ident of the `WorkerLoaderModule` for `(inner, worker_type)`.
///
/// Both the loader's own `Module::ident` and
/// [`ChunkingContext::worker_loader_chunk_item_ident`] route through this single memoized
/// function rather than each computing an equal `AssetIdent`: the module id map is keyed by the
/// resolved `Vc<AssetIdent>`, so a lookup only hits when the ident originates from the same
/// memoized call. This mirrors `AsyncLoaderModule::asset_ident_for`.
///
/// [`ChunkingContext::worker_loader_chunk_item_ident`]: turbopack_core::chunk::ChunkingContext::worker_loader_chunk_item_ident
#[turbo_tasks::function]
pub async fn worker_loader_asset_ident_for(
    inner: Vc<Box<dyn ChunkableModule>>,
    worker_type: WorkerType,
) -> Result<Vc<AssetIdent>> {
    Ok(inner
        .ident()
        .owned()
        .await?
        .with_modifier(worker_type.modifier_str())
        .into_vc())
}

/// The WorkerLoaderModule is a module that creates a separate chunk group for the given module
/// and exports a URL (for web workers) or file path (for Node.js workers) to pass to the worker
/// constructor.
///
/// It is **not** created while building the module graph — `WorkerAssetReference` resolves
/// straight to the worker's entry module over a [`ChunkingType::Worker`] edge. This loader is
/// constructed during chunking instead (see [`ChunkingContext::worker_loader_chunk_item`]) so it
/// can be handed the enclosing chunk group's availability info. That is what makes a worker that
/// spawns itself terminate instead of deadlocking — see [`Self::chunk_group`].
///
/// Because it does not take part in graph construction, its `references()` are never traversed;
/// everything its generated code needs an id for is declared by `WorkerAssetReference` instead.
///
/// [`ChunkingContext::worker_loader_chunk_item`]: turbopack_core::chunk::ChunkingContext::worker_loader_chunk_item
#[turbo_tasks::value]
pub struct WorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub worker_type: WorkerType,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Self> {
        Self::cell(WorkerLoaderModule {
            inner: module,
            worker_type,
            asset_context,
            availability_info,
        })
    }

    /// The worker's chunk group, built with `self.availability_info` (the
    /// availability of the chunk group that created this loader) rather than
    /// `AvailabilityInfo::root()`.
    ///
    /// This is what unrolls self-referencing workers: a worker that spawns
    /// itself produces a nested `WorkerLoaderModule` whose availability already
    /// contains the worker entry module, so the nested chunk group's traversal
    /// excludes it and emits no regular chunks — breaking the
    /// `chunk content -> chunk path -> chunk content` await cycle.
    ///
    /// Note this deliberately does *not* short-circuit to an empty asset list
    /// the way [`AsyncLoaderModule::chunk_group`] does when the target is
    /// already available. An async loader can call `parentImport(id)` because it
    /// runs in the same runtime as the factory; a worker gets a fresh realm and
    /// still needs its evaluate chunk to instantiate the entry module. The
    /// factories for already-available modules reach the worker via the
    /// preloaded chunk URLs that `createWorker` passes along.
    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        Ok(match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                let ident = this
                    .inner
                    .ident()
                    .owned()
                    .await?
                    .with_modifier(this.worker_type.chunk_modifier_str())
                    .into_vc();
                chunking_context.evaluated_chunk_group_assets(
                    ident,
                    ChunkGroup::Worker(ResolvedVc::upcast(this.inner)),
                    module_graph,
                    OutputAssets::empty(),
                    this.availability_info,
                )
            }
            // WorkerThreads are treated as an entry point, webworkers probably should too but
            // currently it would lead to a cascade that we need to address.
            //
            // Unlike the web-worker branch this keeps `AvailabilityInfo::root()`, so the emitted
            // entry chunk stays self-contained. A Node worker thread runs in a fresh thread that
            // loads only this entry chunk (and the chunks it requires relative to `__dirname`);
            // there is no equivalent of the browser `createWorker` preload list, so pruning
            // already-available modules here would produce a worker missing module factories.
            //
            // Termination for a self-spawning worker (e.g. `new Worker(__filename)`) is handled
            // by the check below instead: when the worker's own chunk group already contains the
            // worker entry, the nested loader skips building a second entry chunk group. It does
            // not need one — the path it emits is derived from the ident, and the outer level
            // already emitted the file at that path.
            WorkerType::NodeWorkerThread => {
                if *self
                    .inner_is_available(chunking_context, module_graph)
                    .await?
                {
                    return Ok(OutputAssetsWithReferenced {
                        assets: ResolvedVc::cell(vec![]),
                        referenced_assets: ResolvedVc::cell(vec![]),
                        references: ResolvedVc::cell(vec![]),
                    }
                    .cell());
                }

                let Some(evaluatable) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(this.inner)
                else {
                    bail!("Worker module must be evaluatable");
                };

                let entry_result = chunking_context
                    .root_entry_chunk_group(
                        Self::node_worker_entry_path(chunking_context, *this.inner)
                            .owned()
                            .await?,
                        ChunkGroup::Worker(ResolvedVc::upcast(evaluatable)),
                        module_graph,
                        OutputAssets::empty(),
                        OutputAssets::empty(),
                    )
                    .await?;

                OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![entry_result.asset]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                    references: ResolvedVc::cell(vec![]),
                }
                .cell()
            }
        })
    }

    #[turbo_tasks::function]
    async fn chunks_data(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            chunking_context.output_root().owned().await?,
            *self
                .chunk_group(chunking_context, module_graph)
                .await?
                .assets,
        ))
    }

    /// `createWorker` is stored in a module; for each worker we need to
    /// load, we require this module and then use it.
    ///
    /// Delegates to the shared memoized [`create_worker_module`], which `WorkerAssetReference`
    /// also references, so both resolve to the identical module (and therefore the identical
    /// chunk item id). That reference is what puts the helper into the module graph — this
    /// loader is created during chunking and so cannot contribute graph edges of its own.
    #[turbo_tasks::function]
    async fn create_worker_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        Ok(create_worker_module(*this.asset_context, this.worker_type))
    }

    /// The path of the entry chunk emitted for a Node worker thread.
    ///
    /// Derived purely from the inner module's ident, so it is the same whether or not this
    /// loader actually built the entry chunk group. That is what lets a self-spawning worker's
    /// nested loader emit the right path without recursing (see [`Self::chunk_group`]).
    #[turbo_tasks::function]
    fn node_worker_entry_path(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        inner: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<FileSystemPath> {
        chunking_context.chunk_path(
            None,
            inner.ident(),
            Some(rcstr!("[worker thread]")),
            rcstr!(".js"),
        )
    }

    /// Whether the worker's entry module is already part of the chunk group that created this
    /// loader — i.e. this is a worker spawning itself.
    ///
    /// Mirrors the availability check in `AsyncLoaderModule::chunk_group`.
    #[turbo_tasks::function]
    async fn inner_is_available(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<bool>> {
        if let Some(available_modules) = self.availability_info.available_modules() {
            let batches = module_graph
                .module_batches(chunking_context.batching_config())
                .await?;
            let module_or_batch = batches.get_entry(ResolvedVc::upcast(self.inner)).await?;
            if let Some(chunkable) = ChunkableModuleOrBatch::from_module_or_batch(module_or_batch)
                && *available_modules.get(chunkable.into()).await?
            {
                return Ok(Vc::cell(true));
            }
        }
        Ok(Vc::cell(false))
    }

    /// Returns output assets including the worker entrypoint for web workers.
    #[turbo_tasks::function]
    async fn chunk_group_with_type(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        Ok(match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => self
                .chunk_group(chunking_context, module_graph)
                .concatenate_asset(chunking_context.worker_entrypoint()),
            WorkerType::NodeWorkerThread => {
                // Node.js workers don't need a separate entrypoint asset
                self.chunk_group(chunking_context, module_graph)
            }
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        // Must be the *same* memoized call that `ChunkingContext::worker_loader_chunk_item_ident`
        // uses, so the id the `new Worker(...)` codegen looks up and the id this chunk item is
        // registered under agree. `availability_info` is intentionally not part of the ident, so
        // the same worker has one id across chunk groups.
        worker_loader_asset_ident_for(*self.inner, self.worker_type)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        // This loader is created during chunking, after the module graph is built, so any
        // references declared here would never be traversed. Both of its dependencies — the
        // worker's own entry module and the `createWorker` runtime helper — are declared by
        // `WorkerAssetReference` on the module that contains the `new Worker(...)` call.
        Vc::cell(vec![])
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };

        if estimated {
            // In estimation mode we cannot call into chunking context APIs
            // otherwise we will induce a turbo tasks cycle. But we only need an
            // approximate solution. We'll use the same estimate for both web
            // and Node.js workers.
            //
            // That includes the export key: resolving the real one needs the chunking context, so
            // the estimate uses the source name even when the helper's exports are mangled. It can
            // only be off by a few characters.
            let fake_id = ModuleId::String(rcstr!("a_fake_module"));
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"](__dirname + "/" + {worker_path:#}));
                    "#,
                    worker_path = StringifyJs(&"a_fake_path_for_size_estimation"),
                    workers_module = StringifyModuleId(&fake_id),
                }
                .into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let create_worker_module = self.create_worker_module();
        let create_worker_id = create_worker_module.chunk_item_id(chunking_context).await?;
        // The helper's `default` export is read here as a string, so it has to go through the same
        // mapping the helper itself emits — a hard-coded `["default"]` misses once its exports are
        // mangled.
        let create_worker_export = match ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(
            create_worker_module.to_resolved().await?,
        ) {
            Some(placeable) => {
                generated_export_key(placeable, chunking_context, &rcstr!("default")).await?
            }
            None => rcstr!("default"),
        };

        let code = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                // For web workers, generate code that exports a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the entrypoint and chunks baked in.
                let entrypoint_full_path = chunking_context.worker_entrypoint().path().await?;

                // Get the entrypoint path relative to output root
                let output_root = chunking_context.output_root().owned().await?;
                let entrypoint_path = output_root
                    .get_path_to(&entrypoint_full_path)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| entrypoint_full_path.path.to_string());

                // Get the chunk data for the worker module
                let chunks_data = self.chunks_data(chunking_context, module_graph).await?;
                let chunks_data = chunks_data.iter().try_join().await?;
                let chunks_data: Vec<_> = chunks_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect();

                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})[{export:#}]({entrypoint}, {chunks}));
                    "#,
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                    workers_module = StringifyModuleId(&create_worker_id),
                    export = StringifyJs(&create_worker_export),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the worker path baked in.
                //
                // The path is derived from the inner module's ident rather than read off the
                // chunk group's assets, because a self-spawning worker's nested loader
                // deliberately builds no chunk group (see `chunk_group`) — the outer level
                // already emitted the entry chunk at exactly this path.
                //
                // We use just the filename because both the loader module and the worker entry
                // chunk are in the same directory (typically server/chunks/), so we don't need a
                // relative path — `__dirname` already points at the right directory.
                let entry_path =
                    Self::node_worker_entry_path(chunking_context, *this.inner).await?;

                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})[{export:#}](__dirname + "/" + {worker_path:#}));
                    "#,
                    worker_path = StringifyJs(entry_path.file_name()),
                    workers_module = StringifyModuleId(&create_worker_id),
                    export = StringifyJs(&create_worker_export),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            options,
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group_with_type(chunking_context, module_graph)
    }
}
