use anyhow::Result;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_tasks::{FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::ModuleId,
    code_builder::Code,
    update_instruction::UpdateInstruction,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};

use crate::{
    chunk::EcmascriptChunkContentEntries,
    chunk_list::{
        merged_update::{
            EcmascriptMergedChunkAdded, EcmascriptMergedChunkDeleted, EcmascriptMergedChunkPartial,
            EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate, EcmascriptModuleEntry,
        },
        update::EcmascriptUpdateInstruction,
    },
    hmr::{
        EcmascriptHmrChunkContent,
        content::EcmascriptMergedChunkContent,
        version::{EcmascriptChunkVersion, EcmascriptMergedChunkVersion},
    },
};

/// The module-level difference between two versions of a single chunk.
enum EcmascriptChunkUpdate {
    None,
    Partial {
        added: FxIndexMap<ModuleId, AddedModule>,
        modified: FxIndexMap<ModuleId, ResolvedVc<Code>>,
        deleted: FxIndexMap<ModuleId, u128>,
    },
}

struct AddedModule {
    hash: u128,
    code: ResolvedVc<Code>,
}

/// Diffs two versions of a single chunk's content, as one step of building a
/// merged update.
async fn update_ecmascript_hmr_chunk_content(
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
                added.insert(
                    id.clone(),
                    AddedModule {
                        hash: *hash,
                        code: entry.code,
                    },
                );
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

/// Looks up a module's hash across several chunk versions, avoiding the cost of
/// merging them into a single map.
fn module_hash(versions: &[ReadRef<EcmascriptChunkVersion>], id: &ModuleId) -> Option<u128> {
    versions
        .iter()
        .find_map(|version| version.entries_hashes.get(id).copied())
}

/// Code only has to be shipped once per update: skip any module another chunk in
/// the group already provides at the same hash.
async fn insert_entry_unless_shipped(
    entries: &mut FxIndexMap<ModuleId, EcmascriptModuleEntry>,
    from_versions: &[ReadRef<EcmascriptChunkVersion>],
    id: ModuleId,
    hash: u128,
    code: Vc<Code>,
    chunk_path: &str,
) -> Result<()> {
    if module_hash(from_versions, &id) != Some(hash) {
        let entry = EcmascriptModuleEntry::from_code(&id, code, chunk_path).await?;
        entries.insert(id, entry);
    }
    Ok(())
}

/// Translates a single chunk's module diff into its merged-update payload.
async fn partial_chunk_update(
    update: EcmascriptChunkUpdate,
    chunk_path: &str,
    from_versions: &[ReadRef<EcmascriptChunkVersion>],
    entries: &mut FxIndexMap<ModuleId, EcmascriptModuleEntry>,
) -> Result<EcmascriptMergedChunkUpdate> {
    let EcmascriptChunkUpdate::Partial {
        added,
        modified,
        deleted,
    } = update
    else {
        unreachable!("caller filters out EcmascriptChunkUpdate::None");
    };

    let mut added_modules = FxIndexSet::default();

    for (id, AddedModule { hash, code }) in added {
        added_modules.insert(id.clone());
        insert_entry_unless_shipped(entries, from_versions, id, hash, *code, chunk_path).await?;
    }

    for (id, code) in modified {
        let entry = EcmascriptModuleEntry::from_code(&id, *code, chunk_path).await?;
        entries.insert(id, entry);
    }

    Ok(EcmascriptMergedChunkUpdate::Partial(
        EcmascriptMergedChunkPartial {
            added: FrozenSet::from(added_modules),
            deleted: deleted.into_keys().collect(),
        },
    ))
}

/// Builds the payload for a chunk that wasn't present in the previous version.
async fn added_chunk_update(
    chunk_entries: &ReadRef<EcmascriptChunkContentEntries>,
    chunk_path: &str,
    from_versions: &[ReadRef<EcmascriptChunkVersion>],
    entries: &mut FxIndexMap<ModuleId, EcmascriptModuleEntry>,
) -> Result<EcmascriptMergedChunkUpdate> {
    let mut modules = FxIndexSet::default();

    for (id, entry) in chunk_entries.iter() {
        modules.insert(id.clone());
        insert_entry_unless_shipped(
            entries,
            from_versions,
            id.clone(),
            *entry.hash.await?,
            *entry.code,
            chunk_path,
        )
        .await?;
    }

    Ok(EcmascriptMergedChunkUpdate::Added(
        EcmascriptMergedChunkAdded {
            modules: FrozenSet::from(modules),
        },
    ))
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

    let from_versions = &from.versions;

    let content = content.await?;
    let to_contents = content
        .contents
        .iter()
        .map(|content| async move {
            let entries = content.entries().await?;
            let version = content.ecmascript_chunk_version().await?;
            Ok((*content, entries, version))
        })
        .try_join()
        .await?;

    let mut merged_entries = FxIndexMap::default();
    let mut chunks = FxIndexMap::default();

    for (content, entries, to_version) in &to_contents {
        let chunk_path = to_version.chunk_path.as_str();

        let chunk_update = match from_versions_by_chunk_path.swap_remove(chunk_path) {
            Some(from_version) => {
                match update_ecmascript_hmr_chunk_content(**content, to_version, from_version)
                    .await?
                {
                    EcmascriptChunkUpdate::None => continue,
                    update => {
                        partial_chunk_update(update, chunk_path, from_versions, &mut merged_entries)
                            .await?
                    }
                }
            }
            None => {
                added_chunk_update(entries, chunk_path, from_versions, &mut merged_entries).await?
            }
        };

        chunks.insert(to_version.chunk_path.clone(), chunk_update);
    }

    for chunk_version in from_versions_by_chunk_path.into_values() {
        let hashes = &chunk_version.entries_hashes;
        chunks.insert(
            chunk_version.chunk_path.clone(),
            EcmascriptMergedChunkUpdate::Deleted(EcmascriptMergedChunkDeleted {
                modules: hashes.keys().cloned().collect(),
            }),
        );
    }

    let merged_update = EcmascriptMergedUpdate {
        entries: FrozenMap::from(merged_entries),
        chunks: FrozenMap::from(chunks),
    };

    Ok(if merged_update.is_empty() {
        Update::None
    } else {
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_merged_version)
                .into_trait_ref()
                .await?,
            instruction: UpdateInstruction::new(EcmascriptUpdateInstruction::Merged(merged_update)),
        })
    })
}
