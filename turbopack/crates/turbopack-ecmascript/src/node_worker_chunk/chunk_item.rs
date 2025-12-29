use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::rcstr;
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
        fn build_code(worker_path: &str) -> String {
            // For Node.js workers, we export the path to the worker entry chunk
            // The path is relative to the output root, so we use require.resolve or
            // __dirname-based resolution at runtime
            formatdoc! {
                r#"
                {TURBOPACK_EXPORT_VALUE}(__dirname + "/" + {worker_path:#});
            "#,
                worker_path = StringifyJs(&*worker_path),
            }
        }
        let code = if estimated {
            // in estimation mode we cannot call into chunking context APIs otherwise we will induce
            // a turbo tasks cycle.  But we only need an approximate solution.
            build_code("a_fake_path_for_size_estimation")
        } else {
            let chunk_group = self.references().await?;
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

            // Get the filename of the worker entry chunk
            // We use just the filename because both the loader module and the worker entry
            // chunk are in the same directory (typically server/chunks/), so we don't need
            // a relative path - __dirname will already point to the correct directory
            build_code(entry_path.file_name())
        };
        eprintln!("loader_module_content: {}", code);

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
    async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;

        Ok(self.chunking_context.evaluated_chunk_group_assets(
            module.inner.ident().with_modifier(rcstr!("node worker")),
            ChunkGroup::Isolated(ResolvedVc::upcast(module.inner)),
            *self.module_graph,
            AvailabilityInfo::root(),
        ))
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
