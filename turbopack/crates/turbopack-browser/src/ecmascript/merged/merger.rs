use anyhow::{bail, Result};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::version::{VersionedContent, VersionedContentMerger, VersionedContents};

use super::{super::content::EcmascriptDevChunkContent, content::EcmascriptDevMergedChunkContent};

/// Merges multiple [`EcmascriptChunkContent`] into a single
/// [`EcmascriptDevMergedChunkContent`]. This is useful for generating a single
/// update for multiple ES chunks updating all at the same time.
#[turbo_tasks::value]
pub(crate) struct EcmascriptDevChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentMerger {
    /// Creates a new [`EcmascriptDevChunkContentMerger`].
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(EcmascriptDevChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptDevChunkContentMerger {
    #[turbo_tasks::function]
    async fn merge(
        &self,
        contents: Vc<VersionedContents>,
    ) -> Result<Vc<Box<dyn VersionedContent>>> {
        let contents = contents
            .await?
            .iter()
            .map(|content| async move {
                if let Some(content) =
                    ResolvedVc::try_downcast_type::<EcmascriptDevChunkContent>(*content)
                {
                    Ok(content)
                } else {
                    bail!("expected Vc<EcmascriptDevChunkContent>")
                }
            })
            .try_join()
            .await?;

        Ok(Vc::upcast(
            EcmascriptDevMergedChunkContent { contents }.cell(),
        ))
    }
}
