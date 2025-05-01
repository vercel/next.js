use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    output::OutputAsset,
    source::Source,
};

/// A module where source code doesn't need to be parsed but can be used as is.
/// This module has no references to other modules.
#[turbo_tasks::value]
pub struct RawOutput {
    path: ResolvedVc<FileSystemPath>,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for RawOutput {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        *self.path
    }
}

#[turbo_tasks::value_impl]
impl Asset for RawOutput {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl RawOutput {
    #[turbo_tasks::function]
    pub fn new(
        path: ResolvedVc<FileSystemPath>,
        source: ResolvedVc<Box<dyn Source>>,
    ) -> Vc<RawOutput> {
        RawOutput { path, source }.cell()
    }
}
