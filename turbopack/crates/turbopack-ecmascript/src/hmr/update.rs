use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::ModuleId,
    code_builder::Code,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};

use crate::{
    chunk_list::merged_update::{
        EcmascriptMergedChunkAdded, EcmascriptMergedChunkDeleted, EcmascriptMergedChunkPartial,
        EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate, EcmascriptModuleEntry,
    },
    hmr::{
        EcmascriptHmrChunkContent,
        content::EcmascriptMergedChunkContent,
        version::{EcmascriptChunkVersion, EcmascriptMergedChunkVersion},
    },
};

/// The module-level difference between two versions of a single chunk.
pub enum EcmascriptChunkUpdate {
    None,
    Partial {
        /// Added modules, keyed by id, with their content hash (used by the
        /// merged-chunk path to dedup code emission across chunks) and code.
        added: FxIndexMap<ModuleId, (u128, ResolvedVc<Code>)>,
        modified: FxIndexMap<ModuleId, ResolvedVc<Code>>,
        deleted: FxIndexMap<ModuleId, u128>,
    },
}

/// Diffs two versions of a single chunk's content.
///
/// Runtime-agnostic: both the browser and node paths, and the merged-chunk path
/// on top of them, share this one implementation.
pub async fn update_ecmascript_hmr_chunk_content(
    content: Vc<Box<dyn EcmascriptHmrChunkContent>>,
    to: &ReadRef<EcmascriptChunkVersion>,
    from: &ReadRef<EcmascriptChunkVersion>,
) -> Result<EcmascriptChunkUpdate> {
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
                    modified.insert(id.clone(), entry.code);
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
                added.insert(id.clone(), (*hash, entry.code));
            }
        }
    }

    Ok(
        if added.is_empty() && modified.is_empty() && deleted.is_empty() {
            EcmascriptChunkUpdate::None
        } else {
            EcmascriptChunkUpdate::Partial {
                added,
                modified,
                deleted,
            }
        },
    )
}

/// Helper structure to get a module's hash from multiple different chunk
/// versions, without having to actually merge the versions into a single
/// hashmap, which would be expensive.
struct MergedModuleMap {
    versions: Vec<ReadRef<EcmascriptChunkVersion>>,
}

impl MergedModuleMap {
    /// Creates a new `MergedModuleMap` from the given versions.
    fn new(versions: Vec<ReadRef<EcmascriptChunkVersion>>) -> Self {
        Self { versions }
    }

    /// Returns the hash of the module with the given id, or `None` if the
    /// module is not present in any of the versions.
    fn get(&self, id: &ModuleId) -> Option<u128> {
        for version in &self.versions {
            if let Some(hash) = version.entries_hashes.get(id) {
                return Some(*hash);
            }
        }
        None
    }
}

/// Computes a single [`Update`] covering every chunk in a merged chunk content.
///
/// Runtime-agnostic: both the browser and node chunk lists share this one
/// implementation.
pub async fn update_ecmascript_merged_chunk(
    content: Vc<EcmascriptMergedChunkContent>,
    from_version: ResolvedVc<Box<dyn Version>>,
) -> Result<Update> {
    let to_merged_version = content.version();
    let Some(from_merged_version) =
        ResolvedVc::try_downcast_type::<EcmascriptMergedChunkVersion>(from_version)
    else {
        // It's likely `from_version` is `NotFoundVersion`.
        return Ok(Update::Total(TotalUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_merged_version)
                .into_trait_ref()
                .await?,
        }));
    };

    let to = to_merged_version.await?;
    let from = from_merged_version.await?;

    // When to and from point to the same value we can skip comparing them
    if from.ptr_eq(&to) {
        return Ok(Update::None);
    }

    let mut from_versions_by_chunk_path: FxIndexMap<_, _> = from
        .versions
        .iter()
        .map(|version| (&*version.chunk_path, version))
        .collect();

    let merged_module_map = MergedModuleMap::new(from.versions.to_vec());

    let content = content.await?;
    let to_contents = content
        .contents
        .iter()
        .map(|content| async move {
            let entries = content.entries().await?;
            let version = content.own_version().await?;
            Ok((*content, entries, version))
        })
        .try_join()
        .await?;

    let mut merged_update = EcmascriptMergedUpdate::default();

    for (content, entries, to_version) in &to_contents {
        let chunk_path = to_version.chunk_path.as_str();

        let chunk_update = if let Some(from_version) =
            from_versions_by_chunk_path.swap_remove(chunk_path)
        {
            // Reuse the single-chunk diff so the merged path stays in sync with
            // the standalone chunk update path.
            match update_ecmascript_hmr_chunk_content(**content, to_version, from_version).await? {
                EcmascriptChunkUpdate::None => continue,
                EcmascriptChunkUpdate::Partial {
                    added,
                    modified,
                    deleted,
                } => {
                    let mut partial = EcmascriptMergedChunkPartial::default();

                    for (module_id, (module_hash, module_code)) in added {
                        partial.added.insert(module_id.clone());

                        // Only ship the code if no other chunk in the group
                        // already provides this module at the same hash.
                        if merged_module_map.get(&module_id) != Some(module_hash) {
                            let entry = EcmascriptModuleEntry::from_code(
                                &module_id,
                                *module_code,
                                chunk_path,
                            )
                            .await?;
                            merged_update.entries.insert(module_id, entry);
                        }
                    }

                    partial.deleted.extend(deleted.into_keys());

                    for (module_id, module_code) in modified {
                        let entry =
                            EcmascriptModuleEntry::from_code(&module_id, *module_code, chunk_path)
                                .await?;
                        merged_update.entries.insert(module_id, entry);
                    }

                    EcmascriptMergedChunkUpdate::Partial(partial)
                }
            }
        } else {
            let mut added = EcmascriptMergedChunkAdded::default();

            for (id, entry) in entries {
                let hash = *entry.hash.await?;
                added.modules.insert(id.clone());

                if merged_module_map.get(id) != Some(hash) {
                    let entry =
                        EcmascriptModuleEntry::from_code(id, *entry.code, chunk_path).await?;
                    merged_update.entries.insert(id.clone(), entry);
                }
            }

            EcmascriptMergedChunkUpdate::Added(added)
        };

        merged_update.chunks.insert(chunk_path, chunk_update);
    }

    for (chunk_path, chunk_version) in from_versions_by_chunk_path {
        let hashes = &chunk_version.entries_hashes;
        merged_update.chunks.insert(
            chunk_path,
            EcmascriptMergedChunkUpdate::Deleted(EcmascriptMergedChunkDeleted {
                modules: hashes.keys().cloned().collect(),
            }),
        );
    }

    Ok(if merged_update.is_empty() {
        Update::None
    } else {
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_merged_version)
                .into_trait_ref()
                .await?,
            instruction: Arc::new(serde_json::to_value(&merged_update)?),
        })
    })
}
