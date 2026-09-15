use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TraitRef, Vc, trace::TraceRawVcs};
use turbopack_core::{
    update_instruction::UpdateInstruction,
    version::{
        MergeableVersionedContent, PartialUpdate, TotalUpdate, Update, Version, VersionedContent,
        VersionedContentMerger,
    },
};

use super::{merged_update::EcmascriptMergedUpdate, version::ChunkListVersion};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(untagged)]
pub enum EcmascriptUpdateInstruction {
    ChunkList(ChunkListUpdate),
    Merged(EcmascriptMergedUpdate),
}

/// Update of a chunk list from one version to another.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(tag = "type", rename = "ChunkListUpdate", rename_all = "camelCase")]
pub struct ChunkListUpdate {
    /// A map from chunk path to a corresponding update of that chunk.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    pub chunks: FxIndexMap<RcStr, ChunkUpdate>,
    /// List of merged updates since the last version.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub merged: Vec<EcmascriptMergedUpdate>,
}

impl ChunkListUpdate {
    pub fn into_instruction(self) -> UpdateInstruction {
        UpdateInstruction::new(EcmascriptUpdateInstruction::ChunkList(self))
    }
}

/// Update of a chunk from one version to another.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
pub enum ChunkUpdate {
    /// The chunk was updated and must be reloaded.
    Total,
    /// The chunk was updated and can be merged with the previous version.
    Partial { instruction: EcmascriptMergedUpdate },
    /// The chunk was added.
    Added,
    /// The chunk was deleted.
    Deleted,
}

/// Computes the update of a chunk list from one version to another.
///
/// Runtime-agnostic (takes plain paths + [`VersionedContent`]) so the browser
/// and node chunking contexts can share one implementation instead of each
/// duplicating the merge-by-[`VersionedContentMerger`] logic.
pub async fn update_chunk_list(
    chunks_contents: &FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
    to_version: Vc<ChunkListVersion>,
    from_version: ResolvedVc<Box<dyn Version>>,
) -> Result<Vc<Update>> {
    let from_version =
        if let Some(from) = ResolvedVc::try_downcast_type::<ChunkListVersion>(from_version) {
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

    // Group mergeable chunks by merger so their updates collapse into one
    // `EcmascriptMergedUpdate`; everything else is diffed individually by path.
    let mut by_merger = FxIndexMap::<_, Vec<_>>::default();
    let mut by_path = FxIndexMap::<_, _>::default();

    for (chunk_path, chunk_content) in chunks_contents {
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
                    chunks.insert(chunk_path.clone().into(), ChunkUpdate::Total);
                }
                Update::Partial(partial) => {
                    let instruction = expect_merged_instruction_from_partial(partial);
                    chunks.insert(
                        chunk_path.clone().into(),
                        ChunkUpdate::Partial {
                            instruction: instruction.clone(),
                        },
                    );
                }
                Update::Missing | Update::None => {}
            }
        } else {
            chunks.insert(chunk_path.clone().into(), ChunkUpdate::Deleted);
        }
    }

    for chunk_path in by_path.keys() {
        chunks.insert((*chunk_path).clone().into(), ChunkUpdate::Added);
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
                    let instruction = expect_merged_instruction_from_partial(partial);
                    merged.push(instruction.clone());
                }
                Update::Missing | Update::None => {}
            }
        }
    }
    let update = if chunks.is_empty() && merged.is_empty() {
        Update::None
    } else {
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
            instruction: ChunkListUpdate { chunks, merged }.into_instruction(),
        })
    };

    Ok(update.cell())
}

fn expect_merged_instruction_from_partial(partial: &PartialUpdate) -> &EcmascriptMergedUpdate {
    let Some(EcmascriptUpdateInstruction::Merged(instruction)) = partial
        .instruction
        .downcast_ref::<EcmascriptUpdateInstruction>(
    ) else {
        panic!("ECMAScript partial updates must contain a merged instruction");
    };
    instruction
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use turbo_frozenmap::{FrozenMap, FrozenSet};
    use turbo_tasks::FxIndexMap;

    use super::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction};
    use crate::chunk_list::merged_update::{
        EcmascriptMergedChunkAdded, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
    };

    #[test]
    fn instruction_wire_format() {
        let instruction = EcmascriptUpdateInstruction::ChunkList(ChunkListUpdate {
            chunks: FxIndexMap::from_iter([("app.js".into(), ChunkUpdate::Total)]),
            merged: vec![EcmascriptMergedUpdate {
                entries: FrozenMap::default(),
                chunks: FrozenMap::from_iter([(
                    "app.js".into(),
                    EcmascriptMergedChunkUpdate::Added(EcmascriptMergedChunkAdded {
                        modules: FrozenSet::default(),
                    }),
                )]),
            }],
        });

        assert_eq!(
            serde_json::to_value(instruction).unwrap(),
            json!({
                "type": "ChunkListUpdate",
                "chunks": { "app.js": { "type": "total" } },
                "merged": [{
                    "type": "EcmascriptMergedUpdate",
                    "chunks": { "app.js": { "type": "added" } },
                }],
            })
        );
    }
}
