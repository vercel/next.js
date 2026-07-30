use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TraitRef, Vc};
use turbopack_core::version::{
    MergeableVersionedContent, PartialUpdate, TotalUpdate, Update, Version, VersionedContent,
    VersionedContentMerger,
};

use super::{merged_update::EcmascriptMergedUpdate, version::ChunkListVersion};

/// A single HMR update instruction as sent to the JS client.
///
/// This is the native, strongly-typed representation of the payload stored in
/// [`turbopack_core::version::PartialUpdate::instruction`]. The turbo-tasks
/// `Update`/`PartialUpdate` boundary is generic over arbitrary versioned
/// content and therefore keeps carrying an opaque `serde_json::Value`, but
/// everywhere the ecmascript HMR path produces or consumes an instruction it
/// goes through this enum, so the code is compiler-checked instead of poking at
/// untyped JSON.
///
/// The `type` tag (`"ChunkListUpdate"` / `"EcmascriptMergedUpdate"`) is owned by
/// this enum, which is why the inner structs no longer carry their own serde
/// tag. This keeps the wire format identical while giving a single place that
/// enumerates the known instruction shapes.
#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type")]
pub enum HmrUpdateInstruction {
    ChunkListUpdate(ChunkListUpdate),
    EcmascriptMergedUpdate(EcmascriptMergedUpdate),
}

/// Update of a chunk list from one version to another.
#[derive(Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChunkListUpdate {
    /// A map from chunk path to a corresponding update of that chunk.
    #[serde(default, skip_serializing_if = "FxIndexMap::is_empty")]
    #[ts(as = "std::collections::BTreeMap<String, ChunkUpdate>")]
    pub chunks: FxIndexMap<RcStr, ChunkUpdate>,
    /// List of merged updates since the last version.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub merged: Vec<HmrUpdateInstruction>,
}

/// Update of a chunk from one version to another.
#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChunkUpdate {
    /// The chunk was updated and must be reloaded.
    Total,
    /// The chunk was updated and can be merged with the previous version.
    Partial { instruction: HmrUpdateInstruction },
    /// The chunk was added.
    Added,
    /// The chunk was deleted.
    Deleted,
}

impl ChunkListUpdate {
    /// Returns `true` if this update is empty.
    fn is_empty(&self) -> bool {
        let ChunkListUpdate { chunks, merged } = self;
        chunks.is_empty() && merged.is_empty()
    }
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

    let mut chunks = FxIndexMap::<RcStr, ChunkUpdate>::default();

    for (chunk_path, from_chunk_version) in &from.by_path {
        if let Some(chunk_content) = by_path.swap_remove(chunk_path) {
            let chunk_update = chunk_content
                .update(TraitRef::cell(from_chunk_version.clone()))
                .await?;

            match &*chunk_update {
                Update::Total(_) => {
                    chunks.insert(chunk_path.as_str().into(), ChunkUpdate::Total);
                }
                Update::Partial(partial) => {
                    chunks.insert(
                        chunk_path.as_str().into(),
                        ChunkUpdate::Partial {
                            instruction: serde_json::from_value(
                                partial.instruction.as_ref().clone(),
                            )?,
                        },
                    );
                }
                Update::Missing | Update::None => {}
            }
        } else {
            chunks.insert(chunk_path.as_str().into(), ChunkUpdate::Deleted);
        }
    }

    for chunk_path in by_path.keys() {
        chunks.insert(chunk_path.as_str().into(), ChunkUpdate::Added);
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
                    merged.push(serde_json::from_value(
                        partial.instruction.as_ref().clone(),
                    )?);
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
            instruction: Arc::new(serde_json::to_value(
                &HmrUpdateInstruction::ChunkListUpdate(update),
            )?),
        })
    };

    Ok(update.cell())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::RcStr;
    use turbo_tasks::FxIndexMap;
    use turbo_tasks_fs::rope::Rope;

    use super::{ChunkListUpdate, ChunkUpdate, HmrUpdateInstruction};
    use crate::chunk_list::merged_update::{
        EcmascriptMergedChunkAdded, EcmascriptMergedChunkPartial, EcmascriptMergedChunkUpdate,
        EcmascriptMergedUpdate, EcmascriptModuleEntry,
    };

    fn rc(s: &str) -> RcStr {
        RcStr::from(s)
    }

    /// A single-chunk `EcmascriptMergedUpdate` must serialize to exactly the
    /// wire shape the JS client expects, and round-trip through the typed
    /// representation without changing a byte.
    #[test]
    fn ecmascript_merged_update_wire_format() {
        let mut entries = FxIndexMap::default();
        entries.insert(
            rc("[project]/foo.js [test]"),
            EcmascriptModuleEntry {
                code: Rope::from("console.log(1)".to_string()),
                url: "chunk.js?id=%5Bproject%5D%2Ffoo.js".to_string(),
                map: None,
            },
        );
        let mut chunks = FxIndexMap::default();
        let mut partial = EcmascriptMergedChunkPartial::default();
        partial.added.insert(rc("[project]/foo.js [test]"));
        chunks.insert(
            rc("chunk.js"),
            EcmascriptMergedChunkUpdate::Partial(partial),
        );

        let update = HmrUpdateInstruction::EcmascriptMergedUpdate(EcmascriptMergedUpdate {
            entries,
            chunks,
        });
        let json = serde_json::to_string(&update).unwrap();
        assert_eq!(
            json,
            r#"{"type":"EcmascriptMergedUpdate","entries":{"[project]/foo.js [test]":{"code":"console.log(1)","url":"chunk.js?id=%5Bproject%5D%2Ffoo.js","map":null}},"chunks":{"chunk.js":{"type":"partial","added":["[project]/foo.js [test]"]}}}"#
        );

        let roundtrip: HmrUpdateInstruction = serde_json::from_str(&json).unwrap();
        assert_eq!(serde_json::to_string(&roundtrip).unwrap(), json);
    }

    /// A `ChunkListUpdate` nests a merged update inside `merged` (each carrying
    /// its own `type` tag) and describes per-chunk updates in `chunks`.
    #[test]
    fn chunk_list_update_wire_format() {
        let mut cl_chunks = FxIndexMap::default();
        cl_chunks.insert(rc("server/chunk.js"), ChunkUpdate::Total);
        cl_chunks.insert(rc("server/added.js"), ChunkUpdate::Added);

        let mut added = EcmascriptMergedChunkAdded::default();
        added.modules.insert(rc("42"));
        let mut m_chunks = FxIndexMap::default();
        m_chunks.insert(
            rc("server/new.js"),
            EcmascriptMergedChunkUpdate::Added(added),
        );
        let merged = vec![HmrUpdateInstruction::EcmascriptMergedUpdate(
            EcmascriptMergedUpdate {
                entries: FxIndexMap::default(),
                chunks: m_chunks,
            },
        )];

        let update = HmrUpdateInstruction::ChunkListUpdate(ChunkListUpdate {
            chunks: cl_chunks,
            merged,
        });
        let json = serde_json::to_string(&update).unwrap();
        assert_eq!(
            json,
            r#"{"type":"ChunkListUpdate","chunks":{"server/chunk.js":{"type":"total"},"server/added.js":{"type":"added"}},"merged":[{"type":"EcmascriptMergedUpdate","chunks":{"server/new.js":{"type":"added","modules":["42"]}}}]}"#
        );

        let roundtrip: HmrUpdateInstruction = serde_json::from_str(&json).unwrap();
        assert_eq!(serde_json::to_string(&roundtrip).unwrap(), json);
    }
}
