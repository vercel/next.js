//! Shared wire-format types for merged ecmascript chunk updates.
//!
//! These serde structures are the protocol contract sent to the JS HMR client
//! (see `applyEcmascriptMergedUpdateShared` in the ecmascript runtime). Both the
//! browser and node chunking contexts serialize into exactly this shape, so the
//! definitions live here to keep the two runtimes from drifting apart on the
//! wire format.
//!
//! These are native, strongly-typed Rust structs: they derive both `Serialize`
//! (producing the wire format) and `Deserialize` (so consumers such as the
//! Next.js HMR aggregator can round-trip an instruction through typed structs
//! instead of poking at an untyped `serde_json::Value`). They are also the
//! source of truth the TypeScript definitions are generated from.
//!
//! The turbo-tasks value types (`*MergedChunkContent`, `*MergedChunkVersion`,
//! `*ChunkContentMerger`) cannot be generic and therefore remain per-runtime,
//! but they all build and serialize these shared structs.
//!
//! ## Module ids on the wire
//!
//! Module ids ([`ModuleId`]) are emitted as strings, both as map keys and as
//! array elements (dev-mode HMR — the only place these instructions are
//! produced — always uses string module ids). We therefore model them here as
//! [`RcStr`] rather than [`ModuleId`]: this keeps the wire shape (`string` keys
//! and `string[]` arrays) identical to what the JS client already expects,
//! avoids depending on `ModuleId` implementing `Deserialize`, and matches the
//! generated TypeScript types.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, Vc};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{chunk::ModuleId, code_builder::Code, source_map::GenerateSourceMap};

/// Converts a [`ModuleId`] into its string wire representation, matching how it
/// is serialized as a JSON map key / array element.
pub(crate) fn module_id_key(id: &ModuleId) -> RcStr {
    match id {
        ModuleId::String(s) => s.clone(),
        ModuleId::Number(n) => n.to_string().into(),
    }
}

/// A merged update covering one or more ecmascript chunks that share a merger.
#[derive(Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedUpdate {
    /// A map from module id to its latest module entry (code + source map url).
    #[serde(default, skip_serializing_if = "FxIndexMap::is_empty")]
    #[ts(as = "std::collections::BTreeMap<String, EcmascriptModuleEntry>")]
    pub entries: FxIndexMap<RcStr, EcmascriptModuleEntry>,
    /// A map from chunk path to the update for that chunk.
    #[serde(default, skip_serializing_if = "FxIndexMap::is_empty")]
    #[ts(as = "std::collections::BTreeMap<String, EcmascriptMergedChunkUpdate>")]
    pub chunks: FxIndexMap<RcStr, EcmascriptMergedChunkUpdate>,
}

impl EcmascriptMergedUpdate {
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.chunks.is_empty()
    }
}

/// Per-chunk portion of an [`EcmascriptMergedUpdate`].
#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EcmascriptMergedChunkUpdate {
    Added(EcmascriptMergedChunkAdded),
    Deleted(EcmascriptMergedChunkDeleted),
    Partial(EcmascriptMergedChunkPartial),
}

/// A chunk that was newly added in this version.
#[derive(Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkAdded {
    #[serde(default, skip_serializing_if = "FxIndexSet::is_empty")]
    #[ts(as = "Vec<String>")]
    pub modules: FxIndexSet<RcStr>,
}

/// A chunk that was removed in this version.
#[derive(Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkDeleted {
    // Technically, this is redundant, since the client will already know all
    // modules in the chunk from the previous version. However, it's useful for
    // merging updates without access to an initial state.
    #[serde(default, skip_serializing_if = "FxIndexSet::is_empty")]
    #[ts(as = "Vec<String>")]
    pub modules: FxIndexSet<RcStr>,
}

/// A chunk that was present in both versions and whose module membership
/// changed.
#[derive(Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct EcmascriptMergedChunkPartial {
    #[serde(default, skip_serializing_if = "FxIndexSet::is_empty")]
    #[ts(as = "Vec<String>")]
    pub added: FxIndexSet<RcStr>,
    #[serde(default, skip_serializing_if = "FxIndexSet::is_empty")]
    #[ts(as = "Vec<String>")]
    pub deleted: FxIndexSet<RcStr>,
}

/// The code (and source map) for a single module in a merged update.
#[derive(Serialize, Deserialize, TS)]
pub struct EcmascriptModuleEntry {
    #[serde(with = "turbo_tasks_fs::rope::ser_as_string")]
    #[ts(as = "String")]
    pub code: Rope,
    pub url: String,
    #[serde(with = "turbo_tasks_fs::rope::ser_option_as_string")]
    #[ts(as = "Option<String>")]
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
            url: format!("{}?{}", chunk_path, id),
            map,
        })
    }
}
