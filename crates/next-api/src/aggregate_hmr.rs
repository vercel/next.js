use std::sync::Arc;

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TraitRef, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent;
use turbopack_core::version::{PartialUpdate, Update, Version, VersionState, VersionedContent};
use turbopack_ecmascript::chunk_list::update::{
    ChunkListUpdate, ChunkUpdate, HmrUpdateInstruction,
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::EcmascriptBuildNodeChunkListContent;

use crate::versioned_content_map::VersionedContentMap;

pub struct HmrChunkWithContent {
    pub path: RcStr,
    pub content: ResolvedVc<Box<dyn VersionedContent>>,
}

/// Whether `content` is a chunk list, i.e. an entry point of the chunk graph that
/// an HMR subscription can be anchored on.
///
/// Note this must enumerate every chunk list content type. A new chunking context
/// that introduces one has to be added here, otherwise its chunks silently drop
/// out of the HMR subscription.
pub fn is_entry_chunk_list_content(content: ResolvedVc<Box<dyn VersionedContent>>) -> bool {
    ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkListContent>(content).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptDevChunkListContent>(content).is_some()
}

/// Per-chunk versions keyed by path
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct AggregateHmrVersion {
    #[turbo_tasks(trace_ignore)]
    pub versions: FxIndexMap<RcStr, TraitRef<Box<dyn Version>>>,
}

#[turbo_tasks::value_impl]
impl Version for AggregateHmrVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let entries = self
            .versions
            .iter()
            .map(|(path, version)| {
                let path = path.clone();
                let version = TraitRef::cell(version.clone());
                async move {
                    let id = version.id().owned().await?;
                    Ok::<_, anyhow::Error>((path, id))
                }
            })
            .try_join()
            .await?;

        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(entries.len());
        for (path, id) in entries {
            hasher.write_value(path.as_str());
            hasher.write_value(id.as_str());
        }
        Ok(Vc::cell(encode_base64(hasher.finish()).into()))
    }
}

impl AggregateHmrVersion {
    pub async fn from_map(
        map: Vc<VersionedContentMap>,
        root: &FileSystemPath,
    ) -> Result<Vc<Box<dyn Version>>> {
        // An empty `versions` map behaves the same as `NotFoundVersion` would in
        // `diff_chunks_against`, so no special case is needed here.
        let chunks = map.hmr_chunks_in_path(root).await?;
        Ok(Vc::upcast(Self::from_chunks(&chunks).await?))
    }

    pub async fn from_chunks(chunks: &[HmrChunkWithContent]) -> Result<Vc<Self>> {
        let versions = chunks
            .iter()
            .map(|HmrChunkWithContent { path, content }| {
                let path = path.clone();
                let content = *content;
                async move {
                    let version = content.version().into_trait_ref().await?;
                    Ok::<_, anyhow::Error>((path, version))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        Ok(Self { versions }.cell())
    }
}

/// Aggregates per-entry HMR instructions into a single combined `ChunkListUpdate`.
///
/// Each per-entry instruction is deserialized into the strongly-typed
/// [`HmrUpdateInstruction`] rather than being inspected as an untyped
/// `serde_json::Value`, so the aggregation logic is compiler-checked and shares
/// the exact wire-format definition produced by the ecmascript chunking
/// contexts.
#[derive(Default)]
pub struct ChunkListUpdateBuilder {
    chunks: FxIndexMap<RcStr, ChunkUpdate>,
    merged: Vec<HmrUpdateInstruction>,
    /// Tracks the serialized form of instructions already pushed into `merged`
    /// so identical merged updates are only sent once (preserving the
    /// deduplication the previous `FxIndexSet<Value>` implementation provided
    /// while keeping insertion order).
    seen_merged: FxHashSet<String>,
}

impl ChunkListUpdateBuilder {
    pub fn add_instruction(&mut self, instruction: &serde_json::Value) -> Result<()> {
        match serde_json::from_value::<HmrUpdateInstruction>(instruction.clone())? {
            HmrUpdateInstruction::ChunkListUpdate(ChunkListUpdate { chunks, merged }) => {
                self.chunks.extend(chunks);
                for update in merged {
                    self.push_merged(update)?;
                }
            }
            merged @ HmrUpdateInstruction::EcmascriptMergedUpdate(_) => {
                self.push_merged(merged)?;
            }
        }
        Ok(())
    }

    fn push_merged(&mut self, update: HmrUpdateInstruction) -> Result<()> {
        let key = serde_json::to_string(&update)?;
        if self.seen_merged.insert(key) {
            self.merged.push(update);
        }
        Ok(())
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty() && self.merged.is_empty()
    }

    /// Assembles the aggregated, typed [`HmrUpdateInstruction::ChunkListUpdate`].
    fn into_instruction(self) -> HmrUpdateInstruction {
        HmrUpdateInstruction::ChunkListUpdate(ChunkListUpdate {
            chunks: self.chunks,
            merged: self.merged,
        })
    }

    pub fn build(self, to: TraitRef<Box<dyn Version>>) -> Result<Update> {
        Ok(Update::Partial(PartialUpdate {
            to,
            instruction: Arc::new(serde_json::to_value(&self.into_instruction())?),
        }))
    }
}

/// Per-chunk [`Update`]s computed against an `AggregateHmrVersion` snapshot.
/// `has_new_chunks` is true when the current snapshot contains chunks absent
/// from `from` (e.g. a new endpoint was written); callers decide whether that
/// affects the batch shape.
pub struct DiffResult {
    pub chunk_updates: Vec<(RcStr, ReadRef<Update>)>,
    pub has_new_chunks: bool,
}

/// Diffs each chunk against the [`AggregateHmrVersion`] held by `from`.
///
/// If `from` holds some other kind of `Version`, there's nothing meaningful to
/// diff against, so this returns no updates and leaves it to the caller to
/// decide what to do.
pub async fn diff_chunks_against(
    chunks: &[HmrChunkWithContent],
    from: Vc<VersionState>,
) -> Result<DiffResult> {
    if chunks.is_empty() {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
        });
    }
    let from_resolved = from.get().to_resolved().await?;
    let Some(from_aggregate) = ResolvedVc::try_downcast_type::<AggregateHmrVersion>(from_resolved)
    else {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
        });
    };
    let from_aggregate = from_aggregate.await?;

    let mut has_new_chunks = false;
    let chunk_updates = chunks
        .iter()
        .filter_map(|HmrChunkWithContent { path, content }| {
            let Some(prev) = from_aggregate.versions.get(path).cloned() else {
                has_new_chunks = true;
                return None;
            };
            Some((path.clone(), *content, TraitRef::cell(prev)))
        })
        .map(|(path, content, prev)| async move {
            let update = content.update(prev).await?;
            Ok::<_, anyhow::Error>((path, update))
        })
        .try_join()
        .await?;
    Ok(DiffResult {
        chunk_updates,
        has_new_chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::ChunkListUpdateBuilder;

    /// The builder folds a `ChunkListUpdate` and a standalone
    /// `EcmascriptMergedUpdate` into a single typed `ChunkListUpdate`, matching
    /// the previous hand-built `serde_json::Value` output.
    #[test]
    fn aggregates_typed_instructions() {
        let mut builder = ChunkListUpdateBuilder::default();

        let chunk_list = serde_json::json!({
            "type": "ChunkListUpdate",
            "chunks": { "server/a.js": { "type": "total" } },
            "merged": [{
                "type": "EcmascriptMergedUpdate",
                "chunks": { "server/a.js": { "type": "partial", "added": ["1"] } }
            }]
        });
        let standalone_merged = serde_json::json!({
            "type": "EcmascriptMergedUpdate",
            "chunks": { "server/b.js": { "type": "added", "modules": ["2"] } }
        });

        builder.add_instruction(&chunk_list).unwrap();
        builder.add_instruction(&standalone_merged).unwrap();
        assert!(!builder.is_empty());

        let instruction = serde_json::to_string(&builder.into_instruction()).unwrap();
        assert_eq!(
            instruction,
            r#"{"type":"ChunkListUpdate","chunks":{"server/a.js":{"type":"total"}},"merged":[{"type":"EcmascriptMergedUpdate","chunks":{"server/a.js":{"type":"partial","added":["1"]}}},{"type":"EcmascriptMergedUpdate","chunks":{"server/b.js":{"type":"added","modules":["2"]}}}]}"#
        );
    }

    /// Identical merged updates are only emitted once (dedup preserved from the
    /// previous `FxIndexSet<Value>` implementation).
    #[test]
    fn deduplicates_identical_merged_updates() {
        let mut builder = ChunkListUpdateBuilder::default();
        let merged = serde_json::json!({
            "type": "EcmascriptMergedUpdate",
            "chunks": { "server/a.js": { "type": "added", "modules": ["1"] } }
        });
        builder.add_instruction(&merged).unwrap();
        builder.add_instruction(&merged).unwrap();

        let instruction = serde_json::to_string(&builder.into_instruction()).unwrap();
        assert_eq!(
            instruction,
            r#"{"type":"ChunkListUpdate","merged":[{"type":"EcmascriptMergedUpdate","chunks":{"server/a.js":{"type":"added","modules":["1"]}}}]}"#
        );
    }
}
