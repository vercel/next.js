use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkGroupType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunkingType, ChunksData, EvaluatableAsset, ModuleChunkItemIdExt,
        ModuleId, availability_info::AvailabilityInfo, worker_type::WorkerType,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};

use super::entry_module::WorkerEntryModule;
use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::{StringifyJs, StringifyModuleId},
};

/// The WorkerLoaderModule is a module that creates a separate chunk group for the given module
/// and exports a URL (for web workers) or file path (for Node.js workers) to pass to the worker
/// constructor.
///
/// It is **not** created while building the module graph. `WorkerAssetReference` resolves to a
/// [`WorkerEntryModule`] marker instead, and this loader is constructed during chunking (see
/// [`ChunkingContext::worker_loader_chunk_item`]) so it can be handed the enclosing chunk group's
/// availability info. That is what makes a worker that spawns itself terminate instead of
/// deadlocking — see [`Self::chunk_group`].
///
/// [`WorkerEntryModule`]: super::entry_module::WorkerEntryModule
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
                    ChunkGroup::Isolated(ResolvedVc::upcast(this.inner)),
                    module_graph,
                    OutputAssets::empty(),
                    this.availability_info,
                )
            }
            // WorkerThreads are treated as an entry point, webworkers probably should too but
            // currently it would lead to a cascade that we need to address.
            WorkerType::NodeWorkerThread => {
                let Some(evaluatable) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(this.inner)
                else {
                    bail!("Worker module must be evaluatable");
                };

                let worker_path = chunking_context
                    .chunk_path(
                        None,
                        this.inner.ident(),
                        Some(rcstr!("[worker thread]")),
                        rcstr!(".js"),
                    )
                    .owned()
                    .await?;

                let entry_result = chunking_context
                    .root_entry_chunk_group(
                        worker_path,
                        ChunkGroup::Isolated(ResolvedVc::upcast(evaluatable)),
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
    /// Delegates to the shared memoized helper that [`WorkerEntryModule`] also references, so
    /// both resolve to the identical module (and therefore the identical chunk item id). The
    /// marker is what puts this helper into the module graph — this loader is created during
    /// chunking and so cannot contribute graph edges of its own.
    #[turbo_tasks::function]
    async fn create_worker_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        Ok(super::entry_module::create_worker_module(
            *this.asset_context,
            this.worker_type,
        ))
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
        // Must be the *same* memoized call the `WorkerEntryModule` marker uses, so both
        // resolve to the same `Vc<AssetIdent>` and therefore the same module id. The marker
        // is what appears in the module graph (and gets registered in the module id map),
        // while this loader is what becomes the chunk item `new Worker(...)` requires.
        // `availability_info` is intentionally not part of the ident.
        WorkerEntryModule::asset_ident_for(*self.inner, self.worker_type)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        // Both of this loader's dependencies — the worker's own entry module and the
        // `createWorker` runtime helper — are declared by the `WorkerEntryModule` marker that
        // this loader is created from during chunking. This loader is not part of the module
        // graph, so references declared here would never be traversed anyway.
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

        let create_worker_id = self
            .create_worker_module()
            .chunk_item_id(chunking_context)
            .await?;

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
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"]({entrypoint}, {chunks}));
                    "#,
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                    workers_module = StringifyModuleId(&create_worker_id),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the worker path baked in.
                let chunk_group = self.chunk_group(chunking_context, module_graph).await?;
                let assets = chunk_group.assets.await?;

                // The last asset is the evaluate chunk (entry point) for the worker.
                // The evaluated_chunk_group adds regular chunks first, then pushes the
                // evaluate chunk last. The evaluate chunk contains the bootstrap code that
                // loads the runtime and other chunks. For Node.js workers, we need a single
                // file path (not a blob URL like browser workers), so we use the evaluate
                // chunk which serves as the entry point.
                let Some(entry_asset) = assets.last() else {
                    bail!("cannot find worker entry point asset");
                };
                let entry_path = entry_asset.path().await?;

                // Get the filename of the worker entry chunk
                // We use just the filename because both the loader module and the worker
                // entry chunk are in the same directory (typically server/chunks/), so we
                // don't need a relative path - __dirname will already point to the correct
                // directory
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}({TURBOPACK_REQUIRE}({workers_module})["default"](__dirname + "/" + {worker_path:#}));
                    "#,
                    worker_path = StringifyJs(entry_path.file_name()),
                    workers_module = StringifyModuleId(&create_worker_id),
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

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("{} module", self.worker_type.friendly_str())]
pub struct WorkerModuleReference {
    pub module: ResolvedVc<Box<dyn Module>>,
    pub worker_type: WorkerType,
}

#[turbo_tasks::value_impl]
impl WorkerModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>, worker_type: WorkerType) -> Vc<Self> {
        Self::cell(WorkerModuleReference {
            module,
            worker_type,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Isolated {
            _ty: match self.worker_type {
                WorkerType::SharedWebWorker | WorkerType::WebWorker => ChunkGroupType::Evaluated,
                WorkerType::NodeWorkerThread => ChunkGroupType::Entry,
            },
            merge_tag: None,
        })
    }
}
