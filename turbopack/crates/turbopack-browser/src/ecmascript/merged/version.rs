use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_hex};
use turbopack_core::version::Version;

use super::super::version::EcmascriptBrowserChunkVersion;

/// The version of a [`super::content::EcmascriptMergedChunkContent`]. This is
/// essentially a composite [`EcmascriptChunkVersion`].
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptBrowserMergedChunkVersion {
    #[turbo_tasks(trace_ignore)]
    pub(super) versions: Vec<ReadRef<EcmascriptBrowserChunkVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBrowserMergedChunkVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.versions.len());
        let sorted_ids = {
            let mut sorted_ids = self
                .versions
                .iter()
                .map(|version| async move { ReadRef::cell(version.clone()).id().await })
                .try_join()
                .await?;
            sorted_ids.sort();
            sorted_ids
        };
        for id in sorted_ids {
            hasher.write_value(id);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(Vc::cell(hex_hash.into()))
    }
}
