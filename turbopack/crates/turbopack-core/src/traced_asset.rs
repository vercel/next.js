use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    module::Module,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    reference::referenced_modules_and_affecting_sources,
};

/// Converts a traced external [Module] graph into a graph consisting of [TracedAsset]s.
#[turbo_tasks::value]
pub struct TracedAsset {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl TracedAsset {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(TracedAsset { module })
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for TracedAsset {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let references = referenced_modules_and_affecting_sources(*self.module)
            .await?
            .iter()
            .map(async |module| {
                Ok(ResolvedVc::upcast(
                    TracedAsset::new(**module).to_resolved().await?,
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
impl OutputAsset for TracedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }
}

#[turbo_tasks::value_impl]
impl Asset for TracedAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if let Some(source) = *self.module.source().await? {
            Ok(source.content())
        } else {
            bail!(
                "Module {} has no source",
                self.module.ident().to_string().await?,
            )
        }
    }
}
