use anyhow::{bail, Result};
use turbo_tasks::TryJoinIterExt;
use turbopack_core::version::{
    VersionedContentMerger, VersionedContentMergerVc, VersionedContentVc, VersionedContentsVc,
};

use super::content::EcmascriptMergedChunkContent;
use crate::chunk::content::EcmascriptChunkContentVc;

/// Merges multiple [`EcmascriptChunkContent`] into a single
/// [`EcmascriptMergedChunkContent`]. This is useful for generating a single
/// update for multiple ES chunks updating all at the same time.
#[turbo_tasks::value]
pub(crate) struct EcmascriptChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentMergerVc {
    /// Creates a new [`EcmascriptChunkContentMerger`].
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(EcmascriptChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptChunkContentMerger {
    #[turbo_tasks::function]
    async fn merge(&self, contents: VersionedContentsVc) -> Result<VersionedContentVc> {
        let contents = contents
            .await?
            .iter()
            .map(|content| async move {
                if let Some(content) = EcmascriptChunkContentVc::resolve_from(content).await? {
                    Ok(content)
                } else {
                    bail!("expected EcmascriptChunkContentVc")
                }
            })
            .try_join()
            .await?;

        Ok(EcmascriptMergedChunkContent { contents }.cell().into())
    }
}
