use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc, turbobail};
use turbo_tasks_fs::{FileSystemPath, WriteLinkContent};

use crate::{
    asset::{Asset, AssetContent},
    module::Module,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    reference::referenced_modules_and_affecting_sources,
};

/// Converts a [Module] graph into an [OutputAsset] graph by placing it into a
/// different directory.
#[turbo_tasks::value]
#[derive(Hash)]
pub struct RebasedAsset {
    module: ResolvedVc<Box<dyn Module>>,
    input_dir: FileSystemPath,
    output_dir: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl RebasedAsset {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn Module>>,
        input_dir: FileSystemPath,
        output_dir: FileSystemPath,
    ) -> Vc<Self> {
        Self::cell(RebasedAsset {
            module,
            input_dir,
            output_dir,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for RebasedAsset {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let references = referenced_modules_and_affecting_sources(*self.module, false)
            .await?
            .iter()
            .flat_map(|(_, ref_data)| ref_data.modules.iter())
            .map(async |module| {
                Ok(ResolvedVc::upcast(
                    RebasedAsset::new(**module, self.input_dir.clone(), self.output_dir.clone())
                        .to_resolved()
                        .await?,
                ))
            })
            .try_join()
            .await?;
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for RebasedAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(FileSystemPath::rebase(
            self.module.ident().await?.path.clone(),
            self.input_dir.clone(),
            self.output_dir.clone(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if let Some(source) = *self.module.source().await? {
            let source_content = source.content();
            let AssetContent::Redirect(redirect) = &*source_content.await? else {
                return Ok(source_content);
            };
            // treat symlinks targets as relative to the symlink. When we rebase the symlink, we
            // should also rebase its target path
            let redirect = WriteLinkContent {
                target: FileSystemPath::rebase(
                    redirect.target.clone(),
                    self.input_dir.clone(),
                    self.output_dir.clone(),
                )
                .owned()
                .await?,
                target_type: redirect.target_type.clone(),
            };
            Ok(AssetContent::Redirect(redirect).cell())
        } else {
            turbobail!("Module {} has no source", self.module.ident());
        }
    }
}
