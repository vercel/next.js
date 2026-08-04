use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
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
        let read_contents = turbo_tasks::read!(contents)?;
        let mut contents = Vec::with_capacity(read_contents.len());
        for content in read_contents.iter() {
            if let Some(content) =
                ResolvedVc::try_downcast_type::<EcmascriptBrowserChunkContent>(*content)
            {
                contents.push(content);
            } else {
                bail!("expected Vc<EcmascriptBrowserChunkContent>")
            }
        }

        Ok(Vc::upcast(
            EcmascriptBrowserMergedChunkContent { contents }.cell(),
        ))
    }
}
