use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::version::{Update, Version, VersionedContent};

use super::{
    update::update_ecmascript_merged_chunk, version::EcmascriptBuildNodeMergedChunkVersion,
};
use crate::ecmascript::node::content::EcmascriptBuildNodeChunkContent;

/// Composite [`VersionedContent`] that is the result of merging multiple
/// node ecmascript chunk contents together through the
/// [`EcmascriptBuildNodeChunkContentMerger`].
#[turbo_tasks::value(serialization = "skip", shared)]
pub(crate) struct EcmascriptBuildNodeMergedChunkContent {
    pub(super) contents: Vec<ResolvedVc<EcmascriptBuildNodeChunkContent>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeMergedChunkContent {
    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<EcmascriptBuildNodeMergedChunkVersion>> {
        Ok(EcmascriptBuildNodeMergedChunkVersion {
            versions: self
                .contents
                .iter()
                .map(|content| async move { content.own_version().await })
                .try_join()
                .await?,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeMergedChunkContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<turbopack_core::asset::AssetContent>> {
        bail!("EcmascriptBuildNodeMergedChunkContent does not have content")
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }

    #[turbo_tasks::function]
    async fn update(
        self: Vc<Self>,
        from_version: ResolvedVc<Box<dyn Version>>,
    ) -> Result<Vc<Update>> {
        Ok(update_ecmascript_merged_chunk(self, from_version)
            .await?
            .cell())
    }
}
