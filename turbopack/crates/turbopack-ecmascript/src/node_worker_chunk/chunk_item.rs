use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt,
        availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
};

use super::module::NodeWorkerLoaderModule;
use crate::{
    chunk::{EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType},
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct NodeWorkerLoaderChunkItem {
    pub module: ResolvedVc<NodeWorkerLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl NodeWorkerLoaderChunkItem {
    #[turbo_tasks::function]
    async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;

        Ok(self.chunking_context.evaluated_chunk_group_assets(
            module.inner.ident().with_modifier(rcstr!("node worker")),
            ChunkGroup::Entry(vec![ResolvedVc::upcast(module.inner)]),
            *self.module_graph,
            AvailabilityInfo::root(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for NodeWorkerLoaderChunkItem {
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
        let worker_path = if estimated {
            // in estimation mode we cannot call into chunking context APIs otherwise we will induce
            // a turbo tasks cycle.  But we only need an approximate solution.
            rcstr!("a_fake_path_for_size_estimation")
        } else {
            let this = self.await?;
            let output_root = this.chunking_context.output_root().await?;
            let chunk_group = self.chunk_group().await?;
            let assets = chunk_group.assets.await?;

            // The last asset is the evaluate chunk (entry point) for the worker.
            // The evaluated_chunk_group adds regular chunks first, then pushes the evaluate chunk
            // last. The evaluate chunk contains the bootstrap code that loads the
            // runtime and other chunks. For Node.js workers, we need a single file path
            // (not a blob URL like browser workers), so we use the evaluate chunk which
            // serves as the entry point.
            let Some(entry_asset) = assets.last() else {
                bail!("cannot find worker entry point asset");
            };
            let entry_path = entry_asset.path().await?;
            let Some(relative_path) = output_root.get_path_to(&entry_path) else {
                bail!("generated chunk {entry_path} is not under the output root: {output_root}");
            };
            // For Node.js workers, we need to provide the absolute path
            // We'll use __dirname to resolve it at runtime
            RcStr::from(relative_path)
        };

        // For Node.js workers, we export the path to the worker entry chunk
        // The path is relative to the output root, so we use require.resolve or
        // __dirname-based resolution at runtime
        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}(__dirname + "/" + {worker_path:#});
            "#,
            worker_path = StringifyJs(&*worker_path),
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for NodeWorkerLoaderChunkItem {
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group()
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for NodeWorkerLoaderChunkItem {
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
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(EcmascriptChunkType::value_default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}
