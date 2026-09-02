use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TraitRef, TryJoinIterExt, Vc};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::version::{
    MergeableVersionedContent, Version, VersionedContent, VersionedContentMerger,
};

type VersionTraitRef = TraitRef<Box<dyn Version>>;

/// The version of a chunk list content.
///
/// Tracks versions of individual chunks by path and by merger. Chunks that
/// implement [`MergeableVersionedContent`] are grouped by their merger and
/// their versions are merged. Other chunks are tracked by path.
///
/// [`MergeableVersionedContent`]: turbopack_core::version::MergeableVersionedContent
#[turbo_tasks::value(serialization = "skip", shared, eq = "manual")]
#[derive(Debug)]
pub struct ChunkListVersion {
    pub id: RcStr,
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

// `id` is a hash over every tracked chunk version, so comparing it is equivalent to comparing
// the maps, which hold `VersionTraitRef`s that are not structurally comparable.
impl PartialEq for ChunkListVersion {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for ChunkListVersion {}

#[turbo_tasks::value_impl]
impl Version for ChunkListVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(self.id.clone()))
    }
}

async fn chunk_list_version_id(
    by_path: &FxIndexMap<String, VersionTraitRef>,
    by_merger: &FxIndexMap<ResolvedVc<Box<dyn VersionedContentMerger>>, VersionTraitRef>,
) -> Result<RcStr> {
    let by_path = {
        let mut by_path = by_path
            .iter()
            .map(|(path, version)| (path, TraitRef::cell(version.clone())))
            .map(async |(path, version)| {
                let id = version.id().owned().await?;
                Ok((path, id))
            })
            .try_join()
            .await?;
        by_path.sort();
        by_path
    };
    let by_merger = {
        let mut by_merger = by_merger
            .iter()
            .map(|(_merger, version)| TraitRef::cell(version.clone()).id().owned())
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
    let hash = encode_base64(hash);
    Ok(hash.into())
}

/// Computes a [`ChunkListVersion`] from a map of chunk paths to their
/// [`VersionedContent`].
///
/// Chunks that implement [`MergeableVersionedContent`] are grouped by their
/// merger and their versions are merged. Other chunks are tracked by path.
///
/// [`VersionedContent`]: turbopack_core::version::VersionedContent
/// [`MergeableVersionedContent`]: turbopack_core::version::MergeableVersionedContent
pub async fn compute_chunk_list_version(
    chunks_contents: &FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
) -> Result<Vc<ChunkListVersion>> {
    let mut by_merger = FxIndexMap::<_, Vec<_>>::default();
    let mut by_path = FxIndexMap::<_, _>::default();

    for (chunk_path, chunk_content) in chunks_contents {
        if let Some(mergeable) =
            ResolvedVc::try_sidecast::<Box<dyn MergeableVersionedContent>>(*chunk_content)
        {
            let merger = mergeable.get_merger().to_resolved().await?;
            by_merger.entry(merger).or_default().push(*chunk_content);
        } else {
            by_path.insert(
                chunk_path.clone(),
                chunk_content.version().into_trait_ref().await?,
            );
        }
    }

    let by_merger = by_merger
        .into_iter()
        .map(|(merger, contents)| (merger, Vc::cell(contents)))
        .map(async |(merger, contents)| {
            Ok((
                merger,
                merger.merge(contents).version().into_trait_ref().await?,
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .collect();

    let id = chunk_list_version_id(&by_path, &by_merger).await?;
    Ok(ChunkListVersion {
        id,
        by_path,
        by_merger,
    }
    .cell())
}
