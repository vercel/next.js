use std::sync::Arc;

use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use serde::Serialize;
use turbo_tasks::{IntoTraitRef, TryJoinIterExt};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkingContext, ModuleId, ModuleIdReadRef},
    code_builder::CodeReadRef,
    version::{PartialUpdate, TotalUpdate, Update, VersionVc},
};

use super::{
    super::{
        update::{update_ecmascript_chunk, EcmascriptChunkUpdate},
        version::EcmascriptDevChunkVersionReadRef,
    },
    content::EcmascriptDevMergedChunkContentVc,
    version::EcmascriptDevMergedChunkVersionVc,
};

#[derive(Serialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
struct EcmascriptMergedUpdate<'a> {
    /// A map from module id to latest module entry.
    #[serde(skip_serializing_if = "IndexMap::is_empty")]
    entries: IndexMap<ModuleIdReadRef, EcmascriptModuleEntry>,
    /// A map from chunk path to the chunk update.
    #[serde(skip_serializing_if = "IndexMap::is_empty")]
    chunks: IndexMap<&'a str, EcmascriptMergedChunkUpdate>,
}

impl EcmascriptMergedUpdate<'_> {
    fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.chunks.is_empty()
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum EcmascriptMergedChunkUpdate {
    Added(EcmascriptMergedChunkAdded),
    Deleted(EcmascriptMergedChunkDeleted),
    Partial(EcmascriptMergedChunkPartial),
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EcmascriptMergedChunkAdded {
    #[serde(skip_serializing_if = "IndexSet::is_empty")]
    modules: IndexSet<ModuleIdReadRef>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EcmascriptMergedChunkDeleted {
    // Technically, this is redundant, since the client will already know all
    // modules in the chunk from the previous version. However, it's useful for
    // merging updates without access to an initial state.
    #[serde(skip_serializing_if = "IndexSet::is_empty")]
    modules: IndexSet<ModuleIdReadRef>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct EcmascriptMergedChunkPartial {
    #[serde(skip_serializing_if = "IndexSet::is_empty")]
    added: IndexSet<ModuleIdReadRef>,
    #[serde(skip_serializing_if = "IndexSet::is_empty")]
    deleted: IndexSet<ModuleIdReadRef>,
}

#[derive(Serialize)]
struct EcmascriptModuleEntry {
    code: Rope,
    url: String,
    map: Option<String>,
}

impl EcmascriptModuleEntry {
    fn new(id: &ModuleId, code: CodeReadRef, chunk_path: &str) -> Self {
        /// serde_qs can't serialize a lone enum when it's [serde::untagged].
        #[derive(Serialize)]
        struct Id<'a> {
            id: &'a ModuleId,
        }
        let id = serde_qs::to_string(&Id { id }).unwrap();
        EcmascriptModuleEntry {
            // Cloning a rope is cheap.
            code: code.source_code().clone(),
            url: format!("{}?{}", chunk_path, &id),
            map: code
                .has_source_map()
                .then(|| format!("/__turbopack_sourcemap__/{}.map?{}", chunk_path, &id)),
        }
    }
}

/// Helper structure to get a module's hash from multiple different chunk
/// versions, without having to actually merge the versions into a single
/// hashmap, which would be expensive.
struct MergedModuleMap {
    versions: Vec<EcmascriptDevChunkVersionReadRef>,
}

impl MergedModuleMap {
    /// Creates a new `MergedModuleMap` from the given versions.
    fn new(versions: Vec<EcmascriptDevChunkVersionReadRef>) -> Self {
        Self { versions }
    }

    /// Returns the hash of the module with the given id, or `None` if the
    /// module is not present in any of the versions.
    fn get(&self, id: &ModuleId) -> Option<u64> {
        for version in &self.versions {
            if let Some(hash) = version.entries_hashes.get(id) {
                return Some(*hash);
            }
        }
        None
    }
}

pub(super) async fn update_ecmascript_merged_chunk(
    content: EcmascriptDevMergedChunkContentVc,
    from_version: VersionVc,
) -> Result<Update> {
    let to_merged_version = content.version();
    let from_merged_version =
        if let Some(from) = EcmascriptDevMergedChunkVersionVc::resolve_from(from_version).await? {
            from
        } else {
            // It's likely `from_version` is `NotFoundVersion`.
            return Ok(Update::Total(TotalUpdate {
                to: to_merged_version.as_version().into_trait_ref().await?,
            }));
        };

    let to = to_merged_version.await?;
    let from = from_merged_version.await?;

    // When to and from point to the same value we can skip comparing them.
    // This will happen since `TraitRef<VersionVc>::cell` will not clone the value,
    // but only make the cell point to the same immutable value (Arc).
    if from.ptr_eq(&to) {
        return Ok(Update::None);
    }

    let mut from_versions_by_chunk_path: IndexMap<_, _> = from
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
            let content_ref = content.await?;
            let output_root = content_ref.chunking_context.output_root().await?;
            let path = content_ref.chunk.ident().path().await?;
            Ok((*content, content_ref, output_root, path))
        })
        .try_join()
        .await?;

    let mut merged_update = EcmascriptMergedUpdate::default();

    for (content, content_ref, output_root, path) in &to_contents {
        let Some(chunk_path) = output_root.get_path_to(path) else {
            continue;
        };

        let chunk_update = if let Some(from_version) =
            from_versions_by_chunk_path.remove(chunk_path)
        {
            // The chunk was present in the previous version, so we must update it.
            let update = update_ecmascript_chunk(*content, from_version).await?;

            match update {
                EcmascriptChunkUpdate::None => {
                    // Nothing changed, so we can skip this chunk.
                    continue;
                }
                EcmascriptChunkUpdate::Partial(chunk_partial) => {
                    // The chunk was updated.
                    let mut partial = EcmascriptMergedChunkPartial::default();

                    for (module_id, (module_hash, module_code)) in chunk_partial.added {
                        partial.added.insert(module_id.clone());

                        if merged_module_map.get(&module_id) != Some(module_hash) {
                            let entry = EcmascriptModuleEntry::new(
                                &module_id,
                                module_code.clone(),
                                chunk_path,
                            );
                            merged_update.entries.insert(module_id, entry);
                        }
                    }

                    partial.deleted.extend(chunk_partial.deleted.into_keys());

                    for (module_id, module_code) in chunk_partial.modified {
                        let entry = EcmascriptModuleEntry::new(&module_id, module_code, chunk_path);
                        merged_update.entries.insert(module_id, entry);
                    }

                    EcmascriptMergedChunkUpdate::Partial(partial)
                }
            }
        } else {
            // The chunk was added in this version.
            let mut added = EcmascriptMergedChunkAdded::default();

            for (id, entry) in &content_ref.entries.await? {
                let hash = *entry.hash.await?;
                let code = entry.code.await?;
                added.modules.insert(id.clone());

                if merged_module_map.get(id) != Some(hash) {
                    let entry = EcmascriptModuleEntry::new(id, code, chunk_path);
                    merged_update.entries.insert(id.clone(), entry);
                }
            }

            EcmascriptMergedChunkUpdate::Added(added)
        };

        merged_update.chunks.insert(chunk_path, chunk_update);
    }

    // Deleted chunks.
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
            to: to_merged_version.as_version().into_trait_ref().await?,
            instruction: Arc::new(serde_json::to_value(&merged_update)?),
        })
    };

    Ok(update)
}
