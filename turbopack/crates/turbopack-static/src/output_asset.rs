use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::{OutputAsset, OutputAssetsReference},
    source::Source,
};
#[turbo_tasks::value]
pub struct StaticOutputAsset {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    source: ResolvedVc<Box<dyn Source>>,
    tag: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl StaticOutputAsset {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        source: ResolvedVc<Box<dyn Source>>,
        tag: Option<RcStr>,
    ) -> Vc<Self> {
        Self::cell(StaticOutputAsset {
            chunking_context,
            source,
            tag,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for StaticOutputAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for StaticOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.chunking_context.asset_path(
            self.source.content(),
            self.source.ident(),
            self.tag.clone(),
        )
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
