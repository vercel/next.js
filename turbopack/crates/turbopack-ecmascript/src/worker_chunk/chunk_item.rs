use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt, ChunksData,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    reference_type::WorkerReferenceSubType,
};

use super::module::WorkerLoaderModule;
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType,
        data::EcmascriptChunkData,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_WORKER_URL},
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct WorkerLoaderChunkItem {
    pub module: ResolvedVc<WorkerLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub worker_type: WorkerReferenceSubType,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;
        Ok(self.chunking_context.evaluated_chunk_group_assets(
            module.inner.ident().with_modifier(rcstr!("worker")),
            ChunkGroup::Isolated(ResolvedVc::upcast(module.inner)),
            *self.module_graph,
            AvailabilityInfo::root(),
        ))
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
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;

        // Get the worker entrypoint for this chunking context
        let asset_context = *this.asset_context;
        let entrypoint_full_path = this
            .chunking_context
            .worker_entrypoint(asset_context)
            .path()
            .await?;

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

        // Determine if this is a SharedWorker
        let is_shared = matches!(this.worker_type, WorkerReferenceSubType::SharedWorker);

        // Generate code that creates a worker URL with the entrypoint and chunk paths
        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}({TURBOPACK_WORKER_URL}({entrypoint}, {chunks}, {shared}));
            "#,
            entrypoint = StringifyJs(&entrypoint_path),
            chunks = StringifyJs(&chunks_data),
            shared = is_shared,
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
        let asset_context = *this.asset_context;
        Ok(self
            .chunk_group()
            .concatenate_asset(this.chunking_context.worker_entrypoint(asset_context)))
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
