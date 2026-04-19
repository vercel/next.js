use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::version::{VersionedContent, VersionedContentMerger, VersionedContents};

use super::{
    super::content::EcmascriptBrowserChunkContent, content::EcmascriptBrowserMergedChunkContent,
};

/// Merges multiple [`EcmascriptChunkContent`] into a single
/// [`EcmascriptDevMergedChunkContent`]. This is useful for generating a single
/// update for multiple ES chunks updating all at the same time.
#[turbo_tasks::value]
pub(crate) struct EcmascriptBrowserChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkContentMerger {
    /// Creates a new [`EcmascriptDevChunkContentMerger`].
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(EcmascriptBrowserChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptBrowserChunkContentMerger {
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
                    ResolvedVc::try_downcast_type::<EcmascriptBrowserChunkContent>(*content)
                {
                    Ok(content)
                } else {
                    bail!("expected Vc<EcmascriptBrowserChunkContent>")
                }
            })
            .try_join()
            .await?;

        Ok(Vc::upcast(
            EcmascriptBrowserMergedChunkContent { contents }.cell(),
        ))
    }
}
