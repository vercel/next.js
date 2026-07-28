use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::version::Version;

use crate::ecmascript::node::version::EcmascriptBuildNodeChunkVersion;

/// The version of a [`super::content::EcmascriptBuildNodeMergedChunkContent`].
#[turbo_tasks::value(serialization = "skip", shared)]
pub(crate) struct EcmascriptBuildNodeMergedChunkVersion {
    pub(super) versions: Vec<ReadRef<EcmascriptBuildNodeChunkVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBuildNodeMergedChunkVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.versions.len());
        let sorted_ids = {
            let mut sorted_ids = self
                .versions
                .iter()
                .map(|version| ReadRef::cell(version.clone()).id())
                .try_join()
                .await?;
            sorted_ids.sort();
            sorted_ids
        };
        for id in sorted_ids {
            hasher.write_value(id);
        }
        let hash = hasher.finish();
        let hash = encode_base64(hash);
        Ok(Vc::cell(hash.into()))
    }
}
