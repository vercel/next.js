use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    asset::AssetContent,
    version::{Update, Version, VersionedContent},
};

use crate::hmr::{
    EcmascriptHmrChunkContent, update::update_ecmascript_merged_chunk,
    version::EcmascriptMergedChunkVersion,
};

/// Composite [`VersionedContent`] that is the result of merging multiple
/// Ecmascript chunk contents together through the
/// [`super::merger::EcmascriptChunkContentMerger`]. This allows a chunk
/// list to produce a single `EcmascriptMergedUpdate` for multiple chunks updating
/// at the same time.
///
/// "Merged" here refers to [`turbopack_core::version::VersionedContentMerger`]
/// combining several chunks into one update payload.
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct EcmascriptMergedChunkContent {
    pub contents: Vec<ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptMergedChunkContent {
    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<EcmascriptMergedChunkVersion>> {
        Ok(EcmascriptMergedChunkVersion {
            versions: self
                .contents
                .iter()
                .map(|content| content.ecmascript_chunk_version())
                .try_join()
                .await?,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptMergedChunkContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptMergedChunkContent does not have content")
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
