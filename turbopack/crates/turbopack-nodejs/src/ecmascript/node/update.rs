use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{FxIndexMap, FxIndexSet, IntoTraitRef, ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::ModuleId,
    code_builder::Code,
    source_map::GenerateSourceMap,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};

use super::{content::EcmascriptBuildNodeChunkContent, version::EcmascriptBuildNodeChunkVersion};

#[derive(Serialize, Default)]
#[serde(
    tag = "type",
    rename = "EcmascriptMergedUpdate",
    rename_all = "camelCase"
)]
struct EcmascriptMergedUpdate<'a> {
    /// A map from module id to latest module entry.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    entries: FxIndexMap<ModuleId, EcmascriptModuleEntry>,
    /// A map from chunk path to the chunk update.
    #[serde(skip_serializing_if = "FxIndexMap::is_empty")]
    chunks: FxIndexMap<&'a str, EcmascriptMergedChunkUpdate>,
}

impl EcmascriptMergedUpdate<'_> {
    fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.chunks.is_empty()
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EcmascriptMergedChunkUpdate {
    Partial(EcmascriptMergedChunkPartial),
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EcmascriptMergedChunkPartial {
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
            // Cloning a rope is cheap.
            code: code.await?.source_code().clone(),
            url: format!("{}?{}", chunk_path, &id),
            map,
        })
    }
}

pub(super) async fn update_node_chunk(
    content: Vc<EcmascriptBuildNodeChunkContent>,
    from_version: ResolvedVc<Box<dyn Version>>,
) -> Result<Update> {
    let to_version = content.own_version();
    let from_version = if let Some(from) =
        ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkVersion>(from_version)
    {
        from
    } else {
        // It's likely `from_version` is `NotFoundVersion`.
        return Ok(Update::Total(TotalUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
        }));
    };

    let to = to_version.await?;
    let from = from_version.await?;

    // When to and from point to the same value we can skip comparing them
    if from.ptr_eq(&to) {
        return Ok(Update::None);
    }

    let chunk_path = &to.chunk_path;
    let chunk_update = update_ecmascript_node_chunk_content(&to, &from).await?;

    let mut merged_update = EcmascriptMergedUpdate::default();

    match chunk_update {
        NodeChunkUpdate::None => {
            return Ok(Update::None);
        }
        NodeChunkUpdate::Partial {
            added,
            modified,
            deleted,
        } => {
            let mut partial = EcmascriptMergedChunkPartial::default();

            for (module_id, module_code) in added {
                partial.added.insert(module_id.clone());

                let entry =
                    EcmascriptModuleEntry::from_code(&module_id, module_code, chunk_path).await?;
                merged_update.entries.insert(module_id, entry);
            }

            partial.deleted.extend(deleted.into_keys());

            for (module_id, module_code) in modified {
                let entry =
                    EcmascriptModuleEntry::from_code(&module_id, module_code, chunk_path).await?;
                merged_update.entries.insert(module_id, entry);
            }

            merged_update
                .chunks
                .insert(chunk_path, EcmascriptMergedChunkUpdate::Partial(partial));
        }
    }

    let update = if merged_update.is_empty() {
        Update::None
    } else {
        // Serialize EcmascriptMergedUpdate directly
        // The hot-reloader will wrap it in ChunkListUpdate format for the runtime
        let instruction_value = serde_json::to_value(&merged_update)?;

        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_version)
                .into_trait_ref()
                .await?,
            instruction: Arc::new(instruction_value),
        })
    };

    Ok(update)
}

enum NodeChunkUpdate {
    None,
    Partial {
        added: FxIndexMap<ModuleId, Vc<Code>>,
        modified: FxIndexMap<ModuleId, Vc<Code>>,
        deleted: FxIndexMap<ModuleId, u64>,
    },
}

async fn update_ecmascript_node_chunk_content(
    to: &ReadRef<EcmascriptBuildNodeChunkVersion>,
    from: &ReadRef<EcmascriptBuildNodeChunkVersion>,
) -> Result<NodeChunkUpdate> {
    let mut added = FxIndexMap::default();
    let mut modified = FxIndexMap::default();
    let mut deleted = FxIndexMap::default();

    // Build a map of module_id -> Vc<Code> for the "to" version
    let mut to_entries: FxIndexMap<ModuleId, Vc<Code>> = FxIndexMap::default();
    for item in &to.chunk_items {
        for (id, code) in item {
            // Convert ReadRef<Code> to Vc<Code>
            to_entries.insert(id.clone(), ReadRef::cell(code.clone()));
        }
    }

    // Check for deleted and modified modules
    for (id, from_hash) in &from.entries_hashes {
        if let Some(to_hash) = to.entries_hashes.get(id) {
            if *to_hash != *from_hash {
                // Module was modified
                if let Some(code) = to_entries.get(id) {
                    modified.insert(id.clone(), *code);
                }
            }
        } else {
            // Module was deleted
            deleted.insert(id.clone(), *from_hash);
        }
    }

    // Check for added modules
    for (id, _hash) in &to.entries_hashes {
        if !from.entries_hashes.contains_key(id)
            && let Some(code) = to_entries.get(id)
        {
            added.insert(id.clone(), *code);
        }
    }

    let update = if added.is_empty() && modified.is_empty() && deleted.is_empty() {
        NodeChunkUpdate::None
    } else {
        NodeChunkUpdate::Partial {
            added,
            modified,
            deleted,
        }
    };

    Ok(update)
}
