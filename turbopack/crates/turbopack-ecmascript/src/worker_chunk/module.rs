use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunksData, EvaluatableAsset, availability_info::AvailabilityInfo, worker_type::WorkerType,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
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
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

/// The `createWorker` runtime helper for `worker_type`, resolved through `asset_context`.
///
/// This is an on-demand module: the referring module resolves and references it during
/// analysis, then passes its exported function to the loader at runtime. The loader is created
/// later during chunking and never needs to resolve or reference this module itself.
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
/// Because it does not take part in graph construction, its `references()` are never traversed.
/// Its caller references the `createWorker` helper and passes that function at runtime, so the
/// loader has no module dependencies.
///
/// [`ChunkingContext::worker_loader_chunk_item`]: turbopack_core::chunk::ChunkingContext::worker_loader_chunk_item
#[turbo_tasks::value]
pub struct WorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub worker_type: WorkerType,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    /// Creates the loader for a worker reference found while chunking a chunk group.
    ///
    /// `availability_info` is only meaningful for web workers, where it is what unrolls a
    /// self-spawning worker (see [`Self::chunk_group`]). The Node branch builds a
    /// *self-contained* entry chunk and must not prune already-available modules, so it is
    /// normalized to [`AvailabilityInfo::root()`] here.
    ///
    /// That normalization is only defensive. Callers must *already* pass
    /// [`AvailabilityInfo::root()`] for [`WorkerType::NodeWorkerThread`]: the recursion a
    /// self-spawning worker creates is broken by keeping the surrounding task's arguments
    /// independent of nesting depth, and arguments are hashed to find the cached cell before
    /// this body ever runs. `make_chunk_group` is where it actually takes effect.
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
        availability_info: AvailabilityInfo,
    ) -> Vc<Self> {
        Self::cell(WorkerLoaderModule {
            inner: module,
            worker_type,
            availability_info: match worker_type {
                WorkerType::WebWorker | WorkerType::SharedWebWorker => availability_info,
                WorkerType::NodeWorkerThread => AvailabilityInfo::root(),
            },
        })
    }

    /// The worker's chunk group.
    ///
    /// For **web workers** this is built with `self.availability_info` (the availability of the
    /// chunk group that created this loader) rather than `AvailabilityInfo::root()`. That is
    /// what unrolls a self-referencing worker: the worker's own chunk group rediscovers the
    /// worker reference and creates a nested `WorkerLoaderModule` whose availability already
    /// contains the worker entry module, so the nested chunk group's traversal excludes it and
    /// emits no regular chunks — breaking the
    /// `chunk content -> chunk path -> chunk content` await cycle.
    ///
    /// Note this deliberately does *not* short-circuit to an empty asset list
    /// the way [`AsyncLoaderModule::chunk_group`] does when the target is
    /// already available. An async loader can call `parentImport(id)` because it
    /// runs in the same runtime as the factory; a worker gets a fresh realm and
    /// still needs its evaluate chunk to instantiate the entry module. The
    /// factories for already-available modules reach the worker via the
    /// preloaded chunk URLs that `createWorker` passes along.
    ///
    /// For **Node worker threads** the availability is always root (normalized in
    /// [`Self::new`]) and the entry chunk is self-contained; recursion terminates through
    /// memoization instead. See the `NodeWorkerThread` branch below.
    ///
    /// [`AsyncLoaderModule::chunk_group`]: crate::async_chunk::module::AsyncLoaderModule
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
            // This keeps `AvailabilityInfo::root()` so the emitted entry chunk stays
            // self-contained: a Node worker thread runs in a fresh thread that loads only this
            // entry chunk (and what it requires relative to `__dirname`), and there is no
            // equivalent of the browser `createWorker` preload list, so pruning
            // already-available modules would leave the worker without module factories.
            //
            // A self-spawning worker (`new Worker(__filename)`) does not recurse forever here
            // because `make_chunk_group` passes `AvailabilityInfo::root()` for this worker type,
            // keeping the `worker_loader_chunk_item` task arguments independent of nesting
            // depth. Every nested discovery therefore resolves to the *same* memoized task
            // rather than a new one per level.
            WorkerType::NodeWorkerThread => {
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
        // The loader is created after graph construction and has no module references.
        // Its caller references and passes the `createWorker` helper at runtime; the worker
        // entry is reached by the caller's `ChunkingType::Worker` edge.
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
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((createWorker, WorkerConstructor, workerOptions) => createWorker(__dirname + "/" + {worker_path:#})(WorkerConstructor, workerOptions));
                    "#,
                    worker_path = StringifyJs(&"a_fake_path_for_size_estimation"),
                }
                .into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let code = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                // For web workers, generate code that exports a function to create the worker.
                // The caller passes its referenced helper function as the first argument.
                // The loader applies the entrypoint and chunk list before constructing the worker.
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
                        {TURBOPACK_EXPORT_VALUE}((createWorker, WorkerConstructor, workerOptions) => createWorker({entrypoint}, {chunks})(WorkerConstructor, workerOptions));
                    "#,
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The caller passes its referenced helper function as the first argument.
                // The loader applies the worker path before constructing the thread.
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
                        {TURBOPACK_EXPORT_VALUE}((createWorker, WorkerConstructor, workerOptions) => createWorker(__dirname + "/" + {worker_path:#})(WorkerConstructor, workerOptions));
                    "#,
                    worker_path = StringifyJs(entry_path.file_name()),
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
