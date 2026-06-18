//! Aggregated HMR: one [`VersionState`] covering every chunk under a target's
//! root, so the dev server subscribes once instead of per chunk.
//!
//! [`VersionState`]: turbopack_core::version::VersionState

use std::sync::Arc;

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TraitRef, TryJoinIterExt, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent;
use turbopack_core::version::{
    NotFoundVersion, PartialUpdate, Update, Version, VersionState, VersionedContent,
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::EcmascriptBuildNodeChunkListContent;

use crate::versioned_content_map::VersionedContentMap;

/// One chunk's contribution to an [`AggregateHmrVersion`]: its output path and
/// the versioned content backing it.
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

/// Per-chunk versions keyed by path. `id()` hashes sorted entries so it's
/// stable across `FxIndexMap` iteration order. Mirrors `EcmascriptDevChunkListVersion`.
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
    /// Snapshots every HMR-eligible chunk under `root` in `map`.
    /// Returns [`NotFoundVersion`] when no chunks exist yet.
    pub async fn from_map(
        map: Vc<VersionedContentMap>,
        root: &FileSystemPath,
    ) -> Result<Vc<Box<dyn Version>>> {
        let chunks = map.hmr_chunks_in_path(root).await?;
        if chunks.is_empty() {
            return Ok(Vc::upcast(NotFoundVersion::new()));
        }
        Ok(Vc::upcast(Self::from_chunks(&chunks).await?))
    }

    /// Snapshots each chunk's [`Version`] into a new [`AggregateHmrVersion`].
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

/// A single chunk list's contribution to an aggregated client HMR tick.
#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, NonLocalValue, ValueDebugFormat)]
pub struct ClientChunkListUpdate {
    /// Chunk list path relative to the client root. Used as `resource.path`
    /// by the browser's HMR dispatcher.
    pub path: RcStr,
    /// Per-chunk-list update kind. The instruction is kept as
    /// `Arc<serde_json::Value>` so it can be relayed to napi without rebuilding.
    pub kind: ClientChunkListUpdateKind,
}

#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, NonLocalValue, ValueDebugFormat)]
pub enum ClientChunkListUpdateKind {
    /// Restart: the browser must reload to recover (Total/Missing).
    Restart,
    Partial {
        #[turbo_tasks(trace_ignore)]
        instruction: Arc<serde_json::Value>,
    },
}

/// Aggregated client HMR tick: every chunk list with a non-empty diff, plus
/// the aggregate `to` version to advance [`VersionState`] to. `to` is
/// computed alongside `updates` so it participates in invalidation with them.
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct ClientHmrUpdates {
    pub updates: Vec<ClientChunkListUpdate>,
    #[turbo_tasks(trace_ignore)]
    pub to: TraitRef<Box<dyn Version>>,
}

/// Per-chunk [`Update`]s computed against an `AggregateHmrVersion` snapshot.
/// Used by both server and client aggregate flows; each post-processes the
/// per-chunk results into its target-specific shape.
pub struct DiffResult {
    pub chunk_updates: Vec<(RcStr, ReadRef<Update>)>,
    /// Chunks present in the current snapshot but absent from `from`. The
    /// server reports a non-`None` Partial when new chunks appear; the client
    /// ignores this (the runtime require()s new chunk lists on demand).
    pub has_new_chunks: bool,
    /// Chunk list paths present in `from` but absent from the current
    /// snapshot. The client emits a per-resource `Restart` for each so the
    /// browser clears stale issues/state for deleted chunk lists. The server
    /// ignores this (a `Total` restart is already escalated when any chunk
    /// needs `Total`/`Missing`).
    pub deleted_chunks: Vec<RcStr>,
}

pub struct AggregateHmrSnapshot {
    pub chunks: Vec<HmrChunkWithContent>,
    pub to_ref: TraitRef<Box<dyn Version>>,
    pub diff: DiffResult,
}

/// Shared prologue for server and client HMR ticks. Lists every chunk under
/// `root`, builds the aggregate `to` version via
/// [`AggregateHmrVersion::from_map`], and diffs against `from`.
///
/// When no chunks exist yet, `to_ref` is a [`NotFoundVersion`] and `diff` is
/// empty so the consumer can short-circuit.
pub async fn snapshot_aggregate_hmr(
    map: Vc<VersionedContentMap>,
    root: &FileSystemPath,
    from: Vc<VersionState>,
) -> Result<AggregateHmrSnapshot> {
    let chunks = map.hmr_chunks_in_path(root).await?;
    let to_ref = AggregateHmrVersion::from_map(map, root)
        .await?
        .into_trait_ref()
        .await?;
    let diff = diff_chunks_against(&chunks, from).await?;
    Ok(AggregateHmrSnapshot {
        chunks,
        to_ref,
        diff,
    })
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
    let from_resolved = from.get().to_resolved().await?;
    let Some(from_aggregate) = ResolvedVc::try_downcast_type::<AggregateHmrVersion>(from_resolved)
    else {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
            deleted_chunks: Vec::new(),
        });
    };
    let from_aggregate = from_aggregate.await?;

    let current_paths: FxHashSet<RcStr> = chunks.iter().map(|c| c.path.clone()).collect();

    let deleted_chunks = from_aggregate
        .versions
        .keys()
        .filter(|path| !current_paths.contains(*path))
        .cloned()
        .collect();

    if chunks.is_empty() {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
            deleted_chunks,
        });
    }

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
        deleted_chunks,
    })
}
