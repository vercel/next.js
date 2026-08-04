use anyhow::Result;
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{FxIndexMap, ResolvedVc, TraitRef, Vc};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::version::{Version, VersionedContentMerger};

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
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptDevChunkListVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let by_path = {
            // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
            // per-item work runs concurrently in the async build (as before) and
            // sequentially under `sync`.
            #[cfg(not(feature = "sync"))]
            let mut by_path = self
                .by_path
                .iter()
                .map(|(path, version)| (path, TraitRef::cell(version.clone())))
                .map(|(path, version)| async move {
                    let id = turbo_tasks::read!(version.id().owned())?;
                    Ok((path, id))
                })
                .try_join()
                .await?;
            #[cfg(feature = "sync")]
            let mut by_path = {
                let mut by_path = Vec::with_capacity(self.by_path.len());
                for (path, version) in self.by_path.iter() {
                    let version = TraitRef::cell(version.clone());
                    let id = turbo_tasks::read!(version.id().owned())?;
                    by_path.push((path, id));
                }
                by_path
            };
            by_path.sort();
            by_path
        };
        let by_merger = {
            let mut by_merger = turbo_tasks::parallel!(
                self.by_merger
                    .iter()
                    .map(|(_merger, version)| TraitRef::cell(version.clone()).id())
            )?;
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
        let hash = encode_base64(hash);
        Ok(Vc::cell(hash.into()))
    }
}
