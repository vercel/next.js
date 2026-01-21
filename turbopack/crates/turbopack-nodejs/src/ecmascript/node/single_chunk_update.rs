use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{FxIndexMap, FxIndexSet, IntoTraitRef, ResolvedVc, Vc};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::{ChunkingContext, ModuleId},
    code_builder::Code,
    output::OutputAsset,
    source_map::GenerateSourceMap,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};

use super::{content::EcmascriptBuildNodeChunkContent, version::EcmascriptBuildNodeChunkVersion};

/// Wrapper for the chunk list update format expected by the TypeScript runtime.
/// This mirrors the browser's ChunkListUpdate format.
#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
struct ChunkListUpdate {
    /// List of merged updates since the last version.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    merged: Vec<serde_json::Value>,
}

#[derive(Serialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
struct EcmascriptMergedUpdate<'a> {
    /// A map from module id to latest module entry.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    entries: FxIndexMap<ModuleId, EcmascriptModuleEntry>,
    /// A map from chunk path to the chunk update.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    chunks: FxIndexMap<&'a str, EcmascriptChunkUpdate>,
}

impl EcmascriptMergedUpdate<'_> {
    fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.chunks.is_empty()
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EcmascriptChunkUpdate {
    Partial(EcmascriptChunkPartial),
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EcmascriptChunkPartial {
    #[serde(skip_serializing_if = "FxIndexSet::is_empty")]
    added: FxIndexSet<ModuleId>,
    #[serde(skip_serializing_if = "FxIndexSet::is_empty")]
    deleted: FxIndexSet<ModuleId>,
}

#[derive(Serialize)]
struct EcmascriptModuleEntry {
    #[serde(with = "turbo_tasks_fs::rope::ser_as_string")]
    code: Rope,
    url: String,
    #[serde(with = "turbo_tasks_fs::rope::ser_option_as_string")]
    map: Option<Rope>,
}

impl EcmascriptModuleEntry {
    async fn from_code(id: &ModuleId, code: Vc<Code>, chunk_path: &str) -> Result<Self> {
        let map = &*code.generate_source_map().await?;
        let map = map.as_content().map(|f| f.content().clone());

        /// serde_qs can't serialize a lone enum when it's [serde::untagged].
        #[derive(Serialize)]
        struct Id<'a> {
            id: &'a ModuleId,
        }
        let id = serde_qs::to_string(&Id { id }).unwrap();

        Ok(EcmascriptModuleEntry {
            code: code.await?.source_code().clone(),
            url: format!("{}?{}", chunk_path, &id),
            map,
        })
    }
}

/// Computes an update for a single Node.js chunk.
/// This produces `Partial` updates with module code for HMR.
#[turbo_tasks::function]
pub async fn update_single_ecmascript_node_chunk(
    content: Vc<EcmascriptBuildNodeChunkContent>,
    from_version: Vc<Box<dyn Version>>,
) -> Result<Vc<Update>> {
    let to_version = content.own_version();
    let from_version = if let Some(from) = ResolvedVc::try_downcast_type::<
        EcmascriptBuildNodeChunkVersion,
    >(from_version.to_resolved().await?)
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

    // When to and from point to the same value we can skip comparing them.
    if from.ptr_eq(&to) {
        return Ok(Update::None.cell());
    }

    let entries = content.entries().await?;
    let content_ref = content.await?;
    let output_root = content_ref.chunking_context.output_root().await?;
    let path = content_ref.chunk.path().await?;

    let Some(chunk_path) = output_root.get_path_to(&path) else {
        return Ok(Update::Total(TotalUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
        })
        .cell());
    };

    let mut merged_update = EcmascriptMergedUpdate::default();
    let mut chunk_partial = EcmascriptChunkPartial::default();

    // Find modified and deleted entries
    for (id, from_hash) in &from.entries_hashes {
        if let Some(entry) = entries.get(id) {
            let to_hash = *entry.hash.await?;
            if to_hash != *from_hash {
                // Modified
                let entry = EcmascriptModuleEntry::from_code(id, *entry.code, chunk_path).await?;
                merged_update.entries.insert(id.clone(), entry);
            }
        } else {
            // Deleted
            chunk_partial.deleted.insert(id.clone());
        }
    }

    // Find added entries
    for (id, entry) in entries.iter() {
        if !from.entries_hashes.contains_key(id) {
            chunk_partial.added.insert(id.clone());
            let entry = EcmascriptModuleEntry::from_code(id, *entry.code, chunk_path).await?;
            merged_update.entries.insert(id.clone(), entry);
        }
    }

    // Only add chunk update if there are changes
    if !chunk_partial.added.is_empty() || !chunk_partial.deleted.is_empty() {
        merged_update
            .chunks
            .insert(chunk_path, EcmascriptChunkUpdate::Partial(chunk_partial));
    }

    let update = if merged_update.is_empty() {
        Update::None
    } else {
        // Wrap in ChunkListUpdate with merged array, matching the browser format
        let chunk_list_update = ChunkListUpdate {
            merged: vec![serde_json::to_value(&merged_update)?],
        };
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
            instruction: Arc::new(serde_json::to_value(&chunk_list_update)?),
        })
    };

    Ok(update.cell())
}
