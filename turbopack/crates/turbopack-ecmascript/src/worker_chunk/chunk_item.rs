use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, AsyncModuleInfo, ChunkData, ChunkItem, ChunkType,
        ChunkingContext, ChunkingContextExt, ChunksData,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{chunk_group_info::ChunkGroup, ModuleGraph},
    output::OutputAssets,
};

use super::module::WorkerLoaderModule;
use crate::{
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkType,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_WORKER_BLOB_URL},
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct WorkerLoaderChunkItem {
    pub module: ResolvedVc<WorkerLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::function]
pub fn worker_modifier() -> Vc<RcStr> {
    Vc::cell("worker".into())
}

#[turbo_tasks::value_impl]
impl WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunks(&self) -> Result<Vc<OutputAssets>> {
        let module = self.module.await?;

        Ok(self.chunking_context.evaluated_chunk_group_assets(
            module.inner.ident().with_modifier(worker_modifier()),
            ChunkGroup::Isolated(ResolvedVc::upcast(module.inner)),
            *self.module_graph,
            Value::new(AvailabilityInfo::Root),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root(),
            self.chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}({TURBOPACK_WORKER_BLOB_URL}({chunks:#}));
            "#,
            chunks = StringifyJs(&chunks_data),
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::function]
fn chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("worker chunk".into())
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
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        self.chunks()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
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

    #[turbo_tasks::function]
    fn estimated_size(self: Vc<Self>, async_module_info: Option<Vc<AsyncModuleInfo>>) -> Vc<usize> {
        EcmascriptChunkItem::estimated_size(self, async_module_info)
    }
}
