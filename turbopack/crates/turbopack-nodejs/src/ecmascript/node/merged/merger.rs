use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::version::{VersionedContent, VersionedContentMerger, VersionedContents};

use crate::ecmascript::node::{
    content::EcmascriptBuildNodeChunkContent,
    merged::content::EcmascriptBuildNodeMergedChunkContent,
};

/// Merges multiple [`EcmascriptBuildNodeChunkContent`] into a single
/// [`EcmascriptBuildNodeMergedChunkContent`]. This allows the chunk list to
/// produce a single `EcmascriptMergedUpdate` for multiple chunks updating at
/// the same time.
#[turbo_tasks::value]
pub(crate) struct EcmascriptBuildNodeChunkContentMerger;

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContentMerger {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(EcmascriptBuildNodeChunkContentMerger)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMerger for EcmascriptBuildNodeChunkContentMerger {
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
                    ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkContent>(*content)
                {
                    Ok(content)
                } else {
                    bail!("expected Vc<EcmascriptBuildNodeChunkContent>")
                }
            })
            .try_join()
            .await?;

        Ok(Vc::upcast(
            EcmascriptBuildNodeMergedChunkContent { contents }.cell(),
        ))
    }
}
