use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference::referenced_modules_and_affecting_sources,
};

/// Converts a [Module] graph into an [OutputAsset] graph by placing it into a
/// different directory.
#[turbo_tasks::value]
#[derive(Hash)]
pub struct RebasedAsset {
    source: Vc<Box<dyn Module>>,
    input_dir: Vc<FileSystemPath>,
    output_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl RebasedAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Module>>,
        input_dir: Vc<FileSystemPath>,
        output_dir: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(RebasedAsset {
            source,
            input_dir,
            output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for RebasedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(FileSystemPath::rebase(
            self.source.ident().path(),
            self.input_dir,
            self.output_dir,
        ))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let mut references = Vec::new();
        for &module in referenced_modules_and_affecting_sources(self.source)
            .await?
            .iter()
        {
            references.push(Vc::upcast(RebasedAsset::new(
                module,
                self.input_dir,
                self.output_dir,
            )));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
