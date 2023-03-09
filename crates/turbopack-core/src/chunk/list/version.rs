use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{primitives::StringVc, TraitRef, TryJoinIterExt};
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};

use crate::version::{Version, VersionVc, VersionedContentMergerVc};

/// The version of a [`ChunkListContent`].
///
/// [`ChunkListContent`]: super::content::ChunkListContent
#[turbo_tasks::value(shared)]
pub(super) struct ChunkListVersion {
    /// A map from chunk path to its version.
    #[turbo_tasks(trace_ignore)]
    pub by_path: IndexMap<String, TraitRef<VersionVc>>,
    /// A map from chunk merger to the version of the merged contents of chunks.
    #[turbo_tasks(trace_ignore)]
    pub by_merger: IndexMap<VersionedContentMergerVc, TraitRef<VersionVc>>,
}

#[turbo_tasks::value_impl]
impl Version for ChunkListVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
        let by_path = {
            let mut by_path = self
                .by_path
                .iter()
                .map(|(path, version)| async move {
                    let id = TraitRef::cell(version.clone()).id().await?.clone_value();
                    Ok((path, id))
                })
                .try_join()
                .await?;
            by_path.sort();
            by_path
        };
        let by_merger = {
            let mut by_merger = self
                .by_merger
                .iter()
                .map(|(_merger, version)| async move {
                    Ok(TraitRef::cell(version.clone()).id().await?.clone_value())
                })
                .try_join()
                .await?;
            by_merger.sort();
            by_merger
        };
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(by_path.len());
        for (path, id) in by_path {
            hasher.write_value(path);
            hasher.write_value(id);
        }
        hasher.write_value(by_merger.len());
        for id in by_merger {
            hasher.write_value(id);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(StringVc::cell(hex_hash))
    }
}
