use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssetsReference},
};

/// Reported as a collectible so wrapping or tree-shaking a processed module doesn't lose its files.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct EmittedFile {
    /// The compiler that ran the transform.
    pub scope: RcStr,
    /// Relative to the compiler's output directory.
    pub name: RcStr,
    /// The resource whose transform emitted the file, for diagnostics.
    pub origin: FileSystemPath,
    pub content: ResolvedVc<FileContent>,
}

#[turbo_tasks::value_trait]
pub trait EmittedFileCollectible {
    #[turbo_tasks::function]
    fn file(self: Vc<Self>) -> Vc<EmittedFile>;
}

#[turbo_tasks::value_impl]
impl EmittedFileCollectible for EmittedFile {
    #[turbo_tasks::function]
    fn file(self: Vc<Self>) -> Vc<EmittedFile> {
        self
    }
}

impl EmittedFile {
    pub fn emit(self: ResolvedVc<Self>) {
        turbo_tasks::emit::<Box<dyn EmittedFileCollectible>>(ResolvedVc::upcast(self));
    }
}

#[turbo_tasks::value]
pub struct EmittedOutputAsset {
    path: FileSystemPath,
    content: ResolvedVc<FileContent>,
}

#[turbo_tasks::value_impl]
impl EmittedOutputAsset {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPath, content: ResolvedVc<FileContent>) -> Vc<Self> {
        Self { path, content }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EmittedOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EmittedOutputAsset {}

#[turbo_tasks::value_impl]
impl Asset for EmittedOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        AssetContent::file(*self.content)
    }
}
