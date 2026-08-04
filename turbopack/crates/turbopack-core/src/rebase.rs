use std::hash::Hash;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;

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
        let ref_data = turbo_tasks::read!(referenced_modules_and_affecting_sources(
            *self.module,
            false
        ))?;
        let modules = ref_data
            .iter()
            .flat_map(|(_, ref_data)| ref_data.modules.iter());
        // Keep the concurrent `try_join` in the async build; `.to_resolved()` futures
        // cannot fan out through `parallel!` under sync, so resolve sequentially.
        #[cfg(not(feature = "sync"))]
        let resolved = {
            use turbo_tasks::TryJoinIterExt;
            modules
                .map(|module| {
                    RebasedAsset::new(**module, self.input_dir.clone(), self.output_dir.clone())
                        .to_resolved()
                })
                .try_join()
                .await?
        };
        #[cfg(feature = "sync")]
        let resolved = {
            let mut resolved = Vec::new();
            for module in modules {
                resolved.push(turbo_tasks::read!(
                    RebasedAsset::new(**module, self.input_dir.clone(), self.output_dir.clone())
                        .to_resolved()
                )?);
            }
            resolved
        };
        let references: Vec<ResolvedVc<Box<dyn OutputAsset>>> =
            resolved.into_iter().map(ResolvedVc::upcast).collect();
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
            turbo_tasks::read!(self.module.ident())?.path.clone(),
            self.input_dir.clone(),
            self.output_dir.clone(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if let Some(source) = *turbo_tasks::read!(self.module.source())? {
            Ok(source.content())
        } else {
            turbobail!("Module {} has no source", self.module.ident());
        }
    }
}
