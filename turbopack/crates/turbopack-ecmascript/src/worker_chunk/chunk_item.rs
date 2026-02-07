use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt,
        ChunksData, EvaluatableAsset, EvaluatableAssets, availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
};

use super::{module::WorkerLoaderModule, worker_type::WorkerType};
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType,
        data::EcmascriptChunkData,
    },
    runtime_functions::{TURBOPACK_CREATE_WORKER, TURBOPACK_EXPORT_VALUE},
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct WorkerLoaderChunkItem {
    pub module: ResolvedVc<WorkerLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub worker_type: WorkerType,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;

        Ok(match self.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                self.chunking_context.evaluated_chunk_group_assets(
                    module
                        .inner
                        .ident()
                        .with_modifier(self.worker_type.chunk_modifier_str()),
                    ChunkGroup::Isolated(ResolvedVc::upcast(module.inner)),
                    *self.module_graph,
                    AvailabilityInfo::root(),
                )
            }
            // WorkerThreads are treated as an entry point, webworkers probably should too but
            // currently it would lead to a cascade that we need to address.
            WorkerType::NodeWorkerThread => {
                let Some(evaluatable) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(module.inner)
                else {
                    bail!("Worker module must be evaluatable");
                };

                let worker_path = self
                    .chunking_context
                    .chunk_path(
                        None,
                        module.inner.ident(),
                        Some(rcstr!("[worker thread]")),
                        rcstr!(".js"),
                    )
                    .owned()
                    .await?;

                let entry_result = self
                    .chunking_context
                    .root_entry_chunk_group(
                        worker_path,
                        EvaluatableAssets::one(*evaluatable),
                        *self.module_graph,
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
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root().owned().await?,
            *self.chunk_group().await?.assets,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("should not be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        self: Vc<Self>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;

        if estimated {
            // In estimation mode we cannot call into chunking context APIs
            // otherwise we will induce a turbo tasks cycle. But we only need an
            // approximate solution. We'll use the same estimate for both web
            // and Node.js workers.
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return {TURBOPACK_CREATE_WORKER}(Ctor, __dirname + "/" + {worker_path:#}, opts);
                        }});
                    "#,
                    worker_path = StringifyJs(&"a_fake_path_for_size_estimation"),
                }.into(),
                ..Default::default()
            }
            .cell());
        }

        let code = match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => {
                // For web workers, generate code that exports a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the entrypoint and chunks baked in.
                let entrypoint_full_path = this.chunking_context.worker_entrypoint().path().await?;

                // Get the entrypoint path relative to output root
                let output_root = this.chunking_context.output_root().owned().await?;
                let entrypoint_path = output_root
                    .get_path_to(&entrypoint_full_path)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| entrypoint_full_path.path.to_string());

                // Get the chunk data for the worker module
                let chunks_data = self.chunks_data().await?;
                let chunks_data = chunks_data.iter().try_join().await?;
                let chunks_data: Vec<_> = chunks_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect();

                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return {TURBOPACK_CREATE_WORKER}(Ctor, {entrypoint}, {chunks}, opts);
                        }});
                    "#,
                    entrypoint = StringifyJs(&entrypoint_path),
                    chunks = StringifyJs(&chunks_data),
                }
            }
            WorkerType::NodeWorkerThread => {
                // For Node.js workers, export a function to create the worker.
                // The function takes (WorkerConstructor, workerOptions) and calls createWorker
                // with the worker path baked in.
                let chunk_group = self.chunk_group().await?;
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
                        {TURBOPACK_EXPORT_VALUE}(function(Ctor, opts) {{
                            return {TURBOPACK_CREATE_WORKER}(Ctor, __dirname + "/" + {worker_path:#}, opts);
                        }});
                    "#,
                    worker_path = StringifyJs(entry_path.file_name()),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        match this.worker_type {
            WorkerType::WebWorker | WorkerType::SharedWebWorker => Ok(self
                .chunk_group()
                .concatenate_asset(this.chunking_context.worker_entrypoint())),
            WorkerType::NodeWorkerThread => {
                // Node.js workers don't need a separate entrypoint asset
                Ok(self.chunk_group())
            }
        }
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn content_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}
