use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkingContext, ModuleId},
    output::OutputAsset,
    version::{PartialUpdate, TotalUpdate, Update, Version},
};
use turbopack_ecmascript::chunk_list::merged_update::{
    EcmascriptMergedChunkAdded, EcmascriptMergedChunkDeleted, EcmascriptMergedChunkPartial,
    EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate, EcmascriptModuleEntry,
};

use crate::ecmascript::node::{
    merged::{
        content::EcmascriptBuildNodeMergedChunkContent,
        version::EcmascriptBuildNodeMergedChunkVersion,
    },
    update::{NodeChunkUpdate, update_ecmascript_node_chunk_content},
    version::EcmascriptBuildNodeChunkVersion,
};

struct MergedModuleMap {
    versions: Vec<ReadRef<EcmascriptBuildNodeChunkVersion>>,
}

impl MergedModuleMap {
    fn new(versions: Vec<ReadRef<EcmascriptBuildNodeChunkVersion>>) -> Self {
        Self { versions }
    }

    fn get(&self, id: &ModuleId) -> Option<u128> {
        for version in &self.versions {
            if let Some(hash) = version.entries_hashes.get(id) {
                return Some(*hash);
            }
        }
        None
    }
}

pub(crate) async fn update_ecmascript_merged_chunk(
    content: Vc<EcmascriptBuildNodeMergedChunkContent>,
    from_version: ResolvedVc<Box<dyn Version>>,
) -> Result<Update> {
    let to_merged_version = content.version();
    let from_merged_version = if let Some(from) =
        ResolvedVc::try_downcast_type::<EcmascriptBuildNodeMergedChunkVersion>(from_version)
    {
        from
    } else {
        return Ok(Update::Total(TotalUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_merged_version)
                .into_trait_ref()
                .await?,
        }));
    };

    let to = to_merged_version.await?;
    let from = from_merged_version.await?;

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
            let content_ref = content.await?;
            let output_root = content_ref.chunking_context.output_root().await?;
            let path = content_ref.chunk.path().await?;
            Ok((*content, entries, output_root, path))
        })
        .try_join()
        .await?;

    let mut merged_update = EcmascriptMergedUpdate::default();

    for (content, entries, output_root, path) in &to_contents {
        let Some(chunk_path) = output_root.get_path_to(path) else {
            continue;
        };

        let chunk_update = if let Some(from_version) =
            from_versions_by_chunk_path.swap_remove(chunk_path)
        {
            // Reuse the single-chunk diff so the merged path stays in sync with
            // the standalone chunk update path.
            let to_version = content.own_version().await?;
            match update_ecmascript_node_chunk_content(**content, &to_version, from_version).await?
            {
                NodeChunkUpdate::None => continue,
                NodeChunkUpdate::Partial {
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
                                module_code,
                                chunk_path,
                            )
                            .await?;
                            merged_update.entries.insert(module_id, entry);
                        }
                    }

                    partial.deleted.extend(deleted.into_keys());

                    for (module_id, module_code) in modified {
                        let entry =
                            EcmascriptModuleEntry::from_code(&module_id, module_code, chunk_path)
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

    let update = if merged_update.is_empty() {
        Update::None
    } else {
        Update::Partial(PartialUpdate {
            to: Vc::upcast::<Box<dyn Version>>(to_merged_version)
                .into_trait_ref()
                .await?,
            instruction: Arc::new(serde_json::to_value(&merged_update)?),
        })
    };

    Ok(update)
}
