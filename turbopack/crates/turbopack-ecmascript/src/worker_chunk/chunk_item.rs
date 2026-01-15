use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{
        ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt,
        availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    reference_type::WorkerReferenceSubType,
};

use super::module::WorkerLoaderModule;
use crate::{
    chunk::{EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType},
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_WORKER_URL},
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct WorkerLoaderChunkItem {
    pub module: ResolvedVc<WorkerLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub worker_type: WorkerReferenceSubType,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;
        let worker = self.chunking_context.evaluated_chunk_group_assets(
            module.inner.ident().with_modifier(rcstr!("worker")),
            ChunkGroup::Isolated(ResolvedVc::upcast(module.inner)),
            *self.module_graph,
            AvailabilityInfo::root(),
        );
        Ok(worker)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;

        // Get the worker entrypoint for this chunking context
        let entrypoint_full_path = this.chunking_context.worker_entrypoint().path().await?;

        // Get the entrypoint path relative to output root
        let output_root = this.chunking_context.output_root().owned().await?;
        let entrypoint_path = output_root
            .get_path_to(&entrypoint_full_path)
            .map(|s| s.to_string())
            .unwrap_or_else(|| entrypoint_full_path.path.to_string());

        // Get the chunk paths for the worker module
        let chunk_group = self.chunk_group().await?;
        let assets = chunk_group.assets.await?;
        let mut chunk_paths: Vec<String> = Vec::with_capacity(assets.len());
        for asset in assets.iter() {
            let path = asset.path().await?;
            if let Some(relative_path) = output_root.get_path_to(&path) {
                chunk_paths.push(relative_path.to_string());
            }
        }

        // Determine if this is a SharedWorker
        let is_shared = matches!(this.worker_type, WorkerReferenceSubType::SharedWorker);

        // Generate code that creates a worker URL with the entrypoint and chunk paths
        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}({TURBOPACK_WORKER_URL}({entrypoint}, {chunks}, {shared}));
            "#,
            entrypoint = StringifyJs(&entrypoint_path),
            chunks = StringifyJs(&chunk_paths),
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
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group()
            .concatenate(self.chunking_context().worker_entrypoint().references())
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
