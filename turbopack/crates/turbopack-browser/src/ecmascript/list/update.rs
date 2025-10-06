use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{FxIndexMap, IntoTraitRef, ResolvedVc, TraitRef, Vc};
use turbopack_core::version::{
    MergeableVersionedContent, PartialUpdate, TotalUpdate, Update, Version, VersionedContent,
    VersionedContentMerger,
};

use super::{content::EcmascriptDevChunkListContent, version::EcmascriptDevChunkListVersion};

/// Update of a chunk list from one version to another.
#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
struct ChunkListUpdate<'a> {
    /// A map from chunk path to a corresponding update of that chunk.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    chunks: FxIndexMap<&'a str, ChunkUpdate>,
    /// List of merged updates since the last version.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    merged: Vec<Arc<serde_json::Value>>,
}

/// Update of a chunk from one version to another.
#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
enum ChunkUpdate {
    /// The chunk was updated and must be reloaded.
    Total,
    /// The chunk was updated and can be merged with the previous version.
    Partial { instruction: Arc<serde_json::Value> },
    /// The chunk was added.
    Added,
    /// The chunk was deleted.
    Deleted,
}

impl ChunkListUpdate<'_> {
    /// Returns `true` if this update is empty.
    fn is_empty(&self) -> bool {
        let ChunkListUpdate { chunks, merged } = self;
        chunks.is_empty() && merged.is_empty()
    }
}

/// Computes the update of a chunk list from one version to another.
#[turbo_tasks::function]
pub(super) async fn update_chunk_list(
    content: Vc<EcmascriptDevChunkListContent>,
    from_version: ResolvedVc<Box<dyn Version>>,
) -> Result<Vc<Update>> {
    let to_version = content.version();
    let from_version = if let Some(from) =
        ResolvedVc::try_downcast_type::<EcmascriptDevChunkListVersion>(from_version)
    {
        from
    } else {
        // It's likely `from_version` is `NotFoundVersion`.
        return Ok(Update::Total(TotalUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
        })
        .cell());
    };

    let to = to_version.await?;
    let from = from_version.await?;

    // When to and from point to the same value we can skip comparing them. This will happen since
    // `TraitRef::<Box<dyn Version>>::cell` will not clone the value, but only make the cell point
    // to the same immutable value (`Arc`).
    if from.ptr_eq(&to) {
        return Ok(Update::None.cell());
    }

    let content = content.await?;

    // There are two kind of updates nested within a chunk list update:
    // * merged updates; and
    // * single chunk updates.
    // In order to compute merged updates, we first need to group mergeable chunks
    // by common mergers. Then, we compute the update of each group separately.
    // Single chunk updates are computed separately and only require a stable chunk
    // path to identify the chunk across versions.
    let mut by_merger = FxIndexMap::<_, Vec<_>>::default();
    let mut by_path = FxIndexMap::<_, _>::default();

    for (chunk_path, chunk_content) in &content.chunks_contents {
        if let Some(mergeable) =
            ResolvedVc::try_sidecast::<Box<dyn MergeableVersionedContent>>(*chunk_content)
        {
            let merger = mergeable.get_merger().to_resolved().await?;
            by_merger.entry(merger).or_default().push(*chunk_content);
        } else {
            by_path.insert(chunk_path, chunk_content);
        }
    }

    let mut chunks = FxIndexMap::<_, _>::default();

    for (chunk_path, from_chunk_version) in &from.by_path {
        if let Some(chunk_content) = by_path.swap_remove(chunk_path) {
            let chunk_update = chunk_content
                .update(TraitRef::cell(from_chunk_version.clone()))
                .await?;

            match &*chunk_update {
                Update::Total(_) => {
                    chunks.insert(chunk_path.as_ref(), ChunkUpdate::Total);
                }
                Update::Partial(partial) => {
                    chunks.insert(
                        chunk_path.as_ref(),
                        ChunkUpdate::Partial {
                            instruction: partial.instruction.clone(),
                        },
                    );
                }
                Update::Missing | Update::None => {}
            }
        } else {
            chunks.insert(chunk_path.as_ref(), ChunkUpdate::Deleted);
        }
    }

    for chunk_path in by_path.keys() {
        chunks.insert(chunk_path.as_ref(), ChunkUpdate::Added);
    }

    let mut merged = vec![];

    for (merger, chunks_contents) in by_merger {
        if let Some(from_version) = from.by_merger.get(&merger) {
            let content = merger.merge(Vc::cell(chunks_contents));

            let chunk_update = content.update(TraitRef::cell(from_version.clone())).await?;

            match &*chunk_update {
                // Getting a total or not found update from a merger is unexpected. If it
                // happens, we have no better option than to short-circuit
                // the update.
                Update::Total(_) => {
                    return Ok(Update::Total(TotalUpdate {
                        to: Vc::upcast::<Box<dyn Version>>(to_version)
                            .into_trait_ref()
                            .await?,
                    })
                    .cell());
                }
                Update::Partial(partial) => {
                    merged.push(partial.instruction.clone());
                }
                Update::Missing | Update::None => {}
            }
        }
    }
    let update = ChunkListUpdate { chunks, merged };

    let update = if update.is_empty() {
        Update::None
    } else {
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
            instruction: Arc::new(serde_json::to_value(&update)?),
        })
    };

    Ok(update.into())
}
