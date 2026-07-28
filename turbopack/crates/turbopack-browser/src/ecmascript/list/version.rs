use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TraitRef, TryJoinIterExt};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::version::{Version, VersionIdCache, VersionedContentMerger};

type VersionTraitRef = TraitRef<Box<dyn Version>>;

/// The version of a [`EcmascriptDevChunkListContent`].
///
/// [`EcmascriptDevChunkListContent`]: super::content::EcmascriptDevChunkListContent
#[turbo_tasks::value(serialization = "skip", shared)]
pub(super) struct EcmascriptDevChunkListVersion {
    /// A map from chunk path to its version.
    #[turbo_tasks(trace_ignore)]
    pub by_path: FxIndexMap<String, VersionTraitRef>,
    /// A map from chunk merger to the version of the merged contents of chunks.
    //
    // TODO: This trace_ignore is *very* wrong, and could cause problems if/when we add a GC!
    // Version is also expected not to contain `Vc`/`ResolvedVc`/`OperationVc`, and
    // `turbopack_core::version::TotalUpdate` assumes it doesn't.
    #[turbo_tasks(trace_ignore)]
    pub by_merger: FxIndexMap<ResolvedVc<Box<dyn VersionedContentMerger>>, VersionTraitRef>,
    pub id_cache: VersionIdCache,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Version for EcmascriptDevChunkListVersion {
    async fn id(&self) -> Result<RcStr> {
        self.id_cache
            .get_or_init(async || {
                let by_path = {
                    let mut by_path = self
                        .by_path
                        .iter()
                        .map(async |(path, version)| Ok((path, version.id().await?)))
                        .try_join()
                        .await?;
                    by_path.sort();
                    by_path
                };
                let by_merger = {
                    let mut by_merger = self
                        .by_merger
                        .iter()
                        .map(|(_merger, version)| version.id())
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
                Ok(encode_base64(hash).into())
            })
            .await
    }
}
