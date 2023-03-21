use anyhow::{bail, Result};
use turbo_tasks::TryJoinIterExt;
use turbopack_core::version::{
    VersionedContentMerger, VersionedContentMergerVc, VersionedContentVc, VersionedContentsVc,
};

use super::{
    super::content::EcmascriptDevChunkContentVc, content::EcmascriptDevMergedChunkContent,
};

/// Merges multiple [`EcmascriptChunkContent`] into a single
/// [`EcmascriptDevMergedChunkContent`]. This is useful for generating a single
/// update for multiple ES chunks updating all at the same time.
#[turbo_tasks::value]
pub(crate) struct EcmascriptDevChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentMergerVc {
    /// Creates a new [`EcmascriptDevChunkContentMerger`].
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(EcmascriptDevChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptDevChunkContentMerger {
    #[turbo_tasks::function]
    async fn merge(&self, contents: VersionedContentsVc) -> Result<VersionedContentVc> {
        let contents = contents
            .await?
            .iter()
            .map(|content| async move {
                if let Some(content) = EcmascriptDevChunkContentVc::resolve_from(content).await? {
                    Ok(content)
                } else {
                    bail!("expected EcmascriptDevChunkContentVc")
                }
            })
            .try_join()
            .await?;

        Ok(EcmascriptDevMergedChunkContent { contents }.cell().into())
    }
}
