use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, Vc};
use turbopack_core::{
    chunk::ModuleId,
    code_builder::Code,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};
use turbopack_ecmascript::chunk_list::merged_update::{
    EcmascriptMergedChunkPartial, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
    EcmascriptModuleEntry,
};

use super::{content::EcmascriptBuildNodeChunkContent, version::EcmascriptBuildNodeChunkVersion};

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

    let chunk_path = to.chunk_path.as_str();
    let chunk_update = update_ecmascript_node_chunk_content(content, &to, &from).await?;

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

            for (module_id, (_hash, module_code)) in added {
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

pub(crate) enum NodeChunkUpdate {
    None,
    Partial {
        /// Added modules, keyed by id, with their content hash (used by the
        /// merged-chunk path to dedup code emission across chunks) and code.
        added: FxIndexMap<ModuleId, (u128, Vc<Code>)>,
        modified: FxIndexMap<ModuleId, Vc<Code>>,
        deleted: FxIndexMap<ModuleId, u128>,
    },
}

pub(super) async fn update_ecmascript_node_chunk_content(
    content: Vc<EcmascriptBuildNodeChunkContent>,
    to: &ReadRef<EcmascriptBuildNodeChunkVersion>,
    from: &ReadRef<EcmascriptBuildNodeChunkVersion>,
) -> Result<NodeChunkUpdate> {
    let mut added = FxIndexMap::default();
    let mut modified = FxIndexMap::default();
    let mut deleted = FxIndexMap::default();

    // Lazily resolve the entries map only when we actually need to ship code
    // bytes for an added or modified module. For chunks that only have deletions
    // (or no changes that need code beyond hashes), this avoids materializing
    // any `Vc<Code>`.
    let mut entries_ref = None;

    // Check for deleted and modified modules
    for (id, from_hash) in &from.entries_hashes {
        if let Some(to_hash) = to.entries_hashes.get(id) {
            if *to_hash != *from_hash {
                // Module was modified
                let entries = match &entries_ref {
                    Some(entries) => entries,
                    None => entries_ref.insert(content.entries().await?),
                };
                if let Some(entry) = entries.get(id) {
                    modified.insert(id.clone(), *entry.code);
                }
            }
        } else {
            // Module was deleted
            deleted.insert(id.clone(), *from_hash);
        }
    }

    // Check for added modules
    for (id, hash) in &to.entries_hashes {
        if !from.entries_hashes.contains_key(id) {
            let entries = match &entries_ref {
                Some(entries) => entries,
                None => entries_ref.insert(content.entries().await?),
            };
            if let Some(entry) = entries.get(id) {
                added.insert(id.clone(), (*hash, *entry.code));
            }
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
