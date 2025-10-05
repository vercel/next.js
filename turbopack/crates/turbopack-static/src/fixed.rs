use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::OutputAsset,
    source::Source,
};

/// A static asset that is served at a fixed output path. It won't use
/// content hashing to generate a long term cacheable URL.
#[turbo_tasks::value]
pub struct FixedStaticAsset {
    output_path: FileSystemPath,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl FixedStaticAsset {
    #[turbo_tasks::function]
    pub fn new(output_path: FileSystemPath, source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        FixedStaticAsset {
            output_path,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for FixedStaticAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for FixedStaticAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
