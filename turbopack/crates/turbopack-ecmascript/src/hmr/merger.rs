use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::version::{VersionedContent, VersionedContentMerger, VersionedContents};

use crate::hmr::{EcmascriptHmrChunkContent, content::EcmascriptMergedChunkContent};

/// Merges multiple [`EcmascriptHmrChunkContent`] into a single
/// [`EcmascriptMergedChunkContent`]. This allows the chunk list to produce a
/// single `EcmascriptMergedUpdate` for multiple chunks updating at the same time.
#[turbo_tasks::value]
pub struct EcmascriptChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentMerger {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(EcmascriptChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptChunkContentMerger {
    #[turbo_tasks::function]
    async fn merge(
        &self,
        contents: Vc<VersionedContents>,
    ) -> Result<Vc<Box<dyn VersionedContent>>> {
        let contents = contents
            .await?
            .iter()
            .map(|content| {
                if let Some(content) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptHmrChunkContent>>(*content)
                {
                    Ok(content)
                } else {
                    bail!("expected Vc<Box<dyn EcmascriptHmrChunkContent>>")
                }
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Vc::upcast(EcmascriptMergedChunkContent { contents }.cell()))
    }
}
