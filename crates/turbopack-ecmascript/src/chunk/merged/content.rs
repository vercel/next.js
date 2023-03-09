use anyhow::{bail, Result};
use turbo_tasks::TryJoinIterExt;
use turbopack_core::{
    asset::AssetContentVc,
    version::{UpdateVc, VersionVc, VersionedContent, VersionedContentVc},
};

use super::{
    update::update_ecmascript_merged_chunk,
    version::{EcmascriptMergedChunkVersion, EcmascriptMergedChunkVersionVc},
};
use crate::chunk::content::EcmascriptChunkContentVc;

/// Composite [`EcmascriptChunkContent`] that is the result of merging multiple
/// EcmaScript chunk's contents together through the
/// [`EcmascriptChunkContentMerger`].
///
/// [`EcmascriptChunkContentMerger`]: super::merger::EcmascriptChunkContentMerger
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptMergedChunkContent {
    pub contents: Vec<EcmascriptChunkContentVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptMergedChunkContentVc {
    #[turbo_tasks::function]
    pub async fn version(self) -> Result<EcmascriptMergedChunkVersionVc> {
        Ok(EcmascriptMergedChunkVersion {
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
impl VersionedContent for EcmascriptMergedChunkContent {
    #[turbo_tasks::function]
    fn content(_self_vc: EcmascriptMergedChunkContentVc) -> Result<AssetContentVc> {
        bail!("EcmascriptMergedChunkContent does not have content")
    }

    #[turbo_tasks::function]
    fn version(self_vc: EcmascriptMergedChunkContentVc) -> VersionVc {
        self_vc.version().into()
    }

    #[turbo_tasks::function]
    async fn update(
        self_vc: EcmascriptMergedChunkContentVc,
        from_version: VersionVc,
    ) -> Result<UpdateVc> {
        Ok(update_ecmascript_merged_chunk(self_vc, from_version)
            .await?
            .cell())
    }
}
