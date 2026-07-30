use std::sync::Arc;

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TraitRef, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent;
use turbopack_core::version::{PartialUpdate, Update, Version, VersionState, VersionedContent};
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
        let snapshot = map.hmr_chunks_in_path(root).await?;
        Ok(Vc::upcast(Self::from_chunks(&snapshot.active).await?))
    }

    pub async fn from_chunks(chunks: &[HmrChunkWithContent]) -> Result<Vc<Self>> {
        let versions = Self::versions_from_chunks(chunks)
            .await?
            .into_iter()
            .collect();
        Ok(Self { versions }.cell())
    }

    /// Builds the next aggregate version while retaining the last version of
    /// chunks outside the current working set. Inactive entries therefore do
    /// not need to be evaluated on every update, but can still be diffed against
    /// their last active version when they re-enter the working set.
    pub async fn from_chunks_with_previous(
        chunks: &[HmrChunkWithContent],
        inactive_paths: &FxHashSet<RcStr>,
        previous: Vc<VersionState>,
    ) -> Result<Vc<Self>> {
        let mut versions = Self::versions_from_chunks(chunks).await?;

        let previous = previous.get().to_resolved().await?;
        if let Some(previous) = ResolvedVc::try_downcast_type::<AggregateHmrVersion>(previous) {
            versions.extend(
                previous
                    .await?
                    .versions
                    .iter()
                    .filter(|(path, _)| inactive_paths.contains(*path))
                    .map(|(path, version)| (path.clone(), version.clone())),
            );
        }

        // Aggregate version IDs depend on iteration order. Keep the union sorted
        // so merely activating or deactivating an unchanged entry is a no-op.
        versions.sort_by(|(a, _), (b, _)| a.cmp(b));
        Ok(Self {
            versions: versions.into_iter().collect(),
        }
        .cell())
    }

    async fn versions_from_chunks(
        chunks: &[HmrChunkWithContent],
    ) -> Result<Vec<(RcStr, TraitRef<Box<dyn Version>>)>> {
        let mut versions = chunks
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
            .await?;
        versions.sort_by(|(a, _), (b, _)| a.cmp(b));
        Ok(versions)
    }
}

/// Aggregates per-entry HMR instructions into a single combined `ChunkListUpdate`.
#[derive(Default)]
pub struct ChunkListUpdateBuilder {
    chunks: FxHashMap<String, serde_json::Value>,
    merged: FxIndexSet<serde_json::Value>,
}

impl ChunkListUpdateBuilder {
    pub fn add_instruction(&mut self, instruction: &serde_json::Value) {
        let Some(obj) = instruction.as_object() else {
            return;
        };
        match obj.get("type").and_then(|v| v.as_str()) {
            Some("ChunkListUpdate") => {
                if let Some(chunks) = obj.get("chunks").and_then(|v| v.as_object()) {
                    for (k, v) in chunks {
                        self.chunks.insert(k.clone(), v.clone());
                    }
                }
                if let Some(merged) = obj.get("merged").and_then(|v| v.as_array()) {
                    for update in merged {
                        self.push_merged(update);
                    }
                }
            }
            Some("EcmascriptMergedUpdate") => {
                self.push_merged(instruction);
            }
            // Unknown instruction shapes are ignored; the caller already
            // escalates `Total`/`Missing` updates to a full restart.
            _ => {}
        }
    }

    fn push_merged(&mut self, update: &serde_json::Value) {
        self.merged.insert(update.clone());
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty() && self.merged.is_empty()
    }

    pub fn build(self, to: TraitRef<Box<dyn Version>>) -> Update {
        let mut instruction = serde_json::Map::new();
        instruction.insert(
            "type".to_string(),
            serde_json::Value::String("ChunkListUpdate".to_string()),
        );
        if !self.chunks.is_empty() {
            instruction.insert(
                "chunks".to_string(),
                serde_json::Value::Object(self.chunks.into_iter().collect()),
            );
        }
        if !self.merged.is_empty() {
            instruction.insert(
                "merged".to_string(),
                serde_json::Value::Array(self.merged.into_iter().collect()),
            );
        }
        Update::Partial(PartialUpdate {
            to,
            instruction: Arc::new(serde_json::Value::Object(instruction)),
        })
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
