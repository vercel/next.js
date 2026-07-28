use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::version::{Version, VersionIdCache};

use super::super::version::EcmascriptBrowserChunkVersion;

/// The version of a [`super::content::EcmascriptMergedChunkContent`]. This is
/// essentially a composite [`EcmascriptChunkVersion`].
#[turbo_tasks::value(serialization = "skip", shared)]
pub(super) struct EcmascriptBrowserMergedChunkVersion {
    #[turbo_tasks(trace_ignore)]
    pub(super) versions: Vec<ReadRef<EcmascriptBrowserChunkVersion>>,
    pub(super) id_cache: VersionIdCache,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Version for EcmascriptBrowserMergedChunkVersion {
    async fn id(&self) -> Result<RcStr> {
        self.id_cache
            .get_or_init(async || {
                let mut hasher = Xxh3Hash64Hasher::new();
                hasher.write_value(self.versions.len());
                let sorted_ids = {
                    // Each `id()` is memoized on the version it belongs to, so this stays cheap
                    // across repeated calls even though we hold `ReadRef`s rather than cells.
                    let mut sorted_ids = self.versions.iter().map(|v| v.id()).try_join().await?;
                    sorted_ids.sort();
                    sorted_ids
                };
                for id in sorted_ids {
                    hasher.write_value(id);
                }
                let hash = hasher.finish();
                Ok(encode_base64(hash).into())
            })
            .await
    }
}
