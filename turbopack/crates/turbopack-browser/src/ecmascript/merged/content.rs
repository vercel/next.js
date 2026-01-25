use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    asset::AssetContent,
    version::{Update, Version, VersionedContent},
};

use super::{
    super::content::EcmascriptBrowserChunkContent, update::update_ecmascript_merged_chunk,
    version::EcmascriptBrowserMergedChunkVersion,
};

/// Composite [`EcmascriptChunkContent`] that is the result of merging multiple
/// EcmaScript chunk's contents together through the
/// [`EcmascriptChunkContentMerger`].
///
/// [`EcmascriptChunkContentMerger`]: super::merger::EcmascriptChunkContentMerger
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptBrowserMergedChunkContent {
    pub contents: Vec<ResolvedVc<EcmascriptBrowserChunkContent>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserMergedChunkContent {
    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<EcmascriptBrowserMergedChunkVersion>> {
        Ok(EcmascriptBrowserMergedChunkVersion {
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
impl VersionedContent for EcmascriptBrowserMergedChunkContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptDevMergedChunkContent does not have content")
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
