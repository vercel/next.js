use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ReadRef, TryJoinIterExt};
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::version::{Version, VersionVc};

use crate::chunk::version::EcmascriptChunkVersionReadRef;

/// The version of a [`super::content::EcmascriptMergedChunkContent`]. This is
/// essentially a composite [`EcmascriptChunkVersion`].
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptMergedChunkVersion {
    #[turbo_tasks(trace_ignore)]
    pub(super) versions: Vec<EcmascriptChunkVersionReadRef>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptMergedChunkVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
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
        Ok(StringVc::cell(hex_hash))
    }
}
