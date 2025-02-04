use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference::referenced_modules_and_affecting_sources,
};

/// Converts a [Module] graph into an [OutputAsset] graph by placing it into a
/// different directory.
#[turbo_tasks::value]
#[derive(Hash)]
pub struct RebasedAsset {
    module: ResolvedVc<Box<dyn Module>>,
    input_dir: ResolvedVc<FileSystemPath>,
    output_dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl RebasedAsset {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn Module>>,
        input_dir: ResolvedVc<FileSystemPath>,
        output_dir: ResolvedVc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(RebasedAsset {
            module,
            input_dir,
            output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for RebasedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        FileSystemPath::rebase(
            self.module.ident().path(),
            *self.input_dir,
            *self.output_dir,
        )
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let references = referenced_modules_and_affecting_sources(*self.module)
            .await?
            .iter()
            .map(|module| async move {
                Ok(ResolvedVc::upcast(
                    RebasedAsset::new(**module, *self.input_dir, *self.output_dir)
                        .to_resolved()
                        .await?,
                ))
            })
            .try_join()
            .await?;
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.module.content()
    }
}
