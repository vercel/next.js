use anyhow::{bail, Result};
use turbo_tasks::TryJoinIterExt;
use turbopack_core::{
    asset::AssetContentVc,
    version::{UpdateVc, VersionVc, VersionedContent, VersionedContentVc},
};

use super::{
    super::content::EcmascriptDevChunkContentVc,
    update::update_ecmascript_merged_chunk,
    version::{EcmascriptDevMergedChunkVersion, EcmascriptDevMergedChunkVersionVc},
};

/// Composite [`EcmascriptChunkContent`] that is the result of merging multiple
/// EcmaScript chunk's contents together through the
/// [`EcmascriptChunkContentMerger`].
///
/// [`EcmascriptChunkContentMerger`]: super::merger::EcmascriptChunkContentMerger
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptDevMergedChunkContent {
    pub contents: Vec<EcmascriptDevChunkContentVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevMergedChunkContentVc {
    #[turbo_tasks::function]
    pub async fn version(self) -> Result<EcmascriptDevMergedChunkVersionVc> {
        Ok(EcmascriptDevMergedChunkVersion {
            versions: self
                .await?
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
impl VersionedContent for EcmascriptDevMergedChunkContent {
    #[turbo_tasks::function]
    fn content(_self_vc: EcmascriptDevMergedChunkContentVc) -> Result<AssetContentVc> {
        bail!("EcmascriptDevMergedChunkContent does not have content")
    }

    #[turbo_tasks::function]
    fn version(self_vc: EcmascriptDevMergedChunkContentVc) -> VersionVc {
        self_vc.version().into()
    }

    #[turbo_tasks::function]
    async fn update(
        self_vc: EcmascriptDevMergedChunkContentVc,
        from_version: VersionVc,
    ) -> Result<UpdateVc> {
        Ok(update_ecmascript_merged_chunk(self_vc, from_version)
            .await?
            .cell())
    }
}
