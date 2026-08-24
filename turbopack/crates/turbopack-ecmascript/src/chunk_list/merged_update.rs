//! Shared wire-format types for merged ecmascript chunk updates.
//!
//! These serde structures are the protocol contract sent to the JS HMR client
//! (see `applyEcmascriptMergedUpdateShared` in the ecmascript runtime). Both the
//! browser and node chunking contexts serialize into exactly this shape, so the
//! definitions live here to keep the two runtimes from drifting apart on the
//! wire format.
//!
//! The turbo-tasks value types (`*MergedChunkContent`, `*MergedChunkVersion`,
//! `*ChunkContentMerger`) cannot be generic and therefore remain per-runtime,
//! but they all build and serialize these shared structs.

use anyhow::Result;
use serde::Serialize;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{chunk::ModuleId, code_builder::Code, source_map::GenerateSourceMap};

/// A merged update covering one or more ecmascript chunks that share a merger.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(
    tag = "type",
    rename = "EcmascriptMergedUpdate",
    rename_all = "camelCase"
)]
pub struct EcmascriptMergedUpdate {
    /// A map from module id to its latest module entry (code + source map url).
    #[serde(skip_serializing_if = "FrozenMap::is_empty")]
    pub entries: FrozenMap<ModuleId, EcmascriptModuleEntry>,
    /// A map from chunk path to the update for that chunk.
    #[serde(skip_serializing_if = "FrozenMap::is_empty")]
    pub chunks: FrozenMap<RcStr, EcmascriptMergedChunkUpdate>,
}

impl EcmascriptMergedUpdate {
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.chunks.is_empty()
    }
}

/// Per-chunk portion of an [`EcmascriptMergedUpdate`].
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EcmascriptMergedChunkUpdate {
    Added(EcmascriptMergedChunkAdded),
    Deleted(EcmascriptMergedChunkDeleted),
    Partial(EcmascriptMergedChunkPartial),
}

/// A chunk that was newly added in this version.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkAdded {
    #[serde(skip_serializing_if = "FrozenSet::is_empty")]
    pub modules: FrozenSet<ModuleId>,
}

/// A chunk that was removed in this version.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkDeleted {
    // Technically, this is redundant, since the client will already know all
    // modules in the chunk from the previous version. However, it's useful for
    // merging updates without access to an initial state.
    #[serde(skip_serializing_if = "FrozenSet::is_empty")]
    pub modules: FrozenSet<ModuleId>,
}

/// A chunk that was present in both versions and whose module membership
/// changed.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkPartial {
    #[serde(skip_serializing_if = "FrozenSet::is_empty")]
    pub added: FrozenSet<ModuleId>,
    #[serde(skip_serializing_if = "FrozenSet::is_empty")]
    pub deleted: FrozenSet<ModuleId>,
}

/// The code (and source map) for a single module in a merged update.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, TraceRawVcs, NonLocalValue)]
pub struct EcmascriptModuleEntry {
    #[serde(with = "turbo_tasks_fs::rope::ser_as_string")]
    pub code: Rope,
    pub url: RcStr,
    #[serde(with = "turbo_tasks_fs::rope::ser_option_as_string")]
    pub map: Option<Rope>,
}

impl EcmascriptModuleEntry {
    pub async fn from_code(id: &ModuleId, code: Vc<Code>, chunk_path: &str) -> Result<Self> {
        let map = &*code.generate_source_map().await?;
        let map = map.as_content().map(|f| f.content().clone());

        /// serde_qs can't serialize a lone enum when it's [serde::untagged].
        #[derive(Serialize)]
        struct Id<'a> {
            id: &'a ModuleId,
        }
        let id = serde_qs::to_string(&Id { id }).unwrap();

        Ok(EcmascriptModuleEntry {
            // Cloning a rope is cheap.
            code: code.await?.source_code().clone(),
            url: format!("{}?{}", chunk_path, id).into(),
            map,
        })
    }
}
