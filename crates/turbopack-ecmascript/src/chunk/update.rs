use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use serde::Serialize;
use turbo_tasks::primitives::JsonValueVc;
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::ModuleId,
    version::{PartialUpdate, TotalUpdate, Update, UpdateVc, VersionVc},
};

use super::{
    content::EcmascriptChunkContentVc, snapshot::EcmascriptChunkContentEntry,
    version::EcmascriptChunkVersionVc,
};

#[derive(Serialize)]
#[serde(tag = "type")]
struct EcmascriptChunkUpdate<'a> {
    added: IndexMap<&'a ModuleId, HmrUpdateEntry<'a>>,
    modified: IndexMap<&'a ModuleId, HmrUpdateEntry<'a>>,
    deleted: IndexSet<&'a ModuleId>,
}

#[turbo_tasks::function]
pub(super) async fn update_ecmascript_chunk(
    content: EcmascriptChunkContentVc,
    from_version: VersionVc,
) -> Result<UpdateVc> {
    let to_version = content.version();
    let from_version =
        if let Some(from) = EcmascriptChunkVersionVc::resolve_from(from_version).await? {
            from
        } else {
            return Ok(Update::Total(TotalUpdate {
                to: to_version.into(),
            })
            .cell());
        };

    let to = to_version.await?;
    let from = from_version.await?;

    // When to and from point to the same value we can skip comparing them.
    // This will happen since `cell_local` will not clone the value, but only make
    // the local cell point to the same immutable value (Arc).
    if from.ptr_eq(&to) {
        return Ok(Update::None.cell());
    }

    let content = content.await?;
    let chunk_path = &content.chunk_path.path;

    // TODO(alexkirsz) This should probably be stored as a HashMap already.
    let mut module_factories: IndexMap<_, _> = content
        .module_factories
        .iter()
        .map(|entry| (entry.id(), entry))
        .collect();
    let mut added = IndexMap::new();
    let mut modified = IndexMap::new();
    let mut deleted = IndexSet::new();

    for (id, hash) in &from.module_factories_hashes {
        let id = &**id;
        if let Some(entry) = module_factories.remove(id) {
            if entry.hash != *hash {
                modified.insert(id, HmrUpdateEntry::new(entry, chunk_path));
            }
        } else {
            deleted.insert(id);
        }
    }

    // Remaining entries are added
    for (id, entry) in module_factories {
        added.insert(id, HmrUpdateEntry::new(entry, chunk_path));
    }

    let update = if added.is_empty() && modified.is_empty() && deleted.is_empty() {
        Update::None
    } else {
        let chunk_update = EcmascriptChunkUpdate {
            added,
            modified,
            deleted,
        };

        Update::Partial(PartialUpdate {
            to: to_version.into(),
            instruction: JsonValueVc::cell(serde_json::to_value(&chunk_update)?),
        })
    };

    Ok(update.into())
}

#[derive(serde::Serialize)]
struct HmrUpdateEntry<'a> {
    code: &'a Rope,
    url: String,
    map: Option<String>,
}

impl<'a> HmrUpdateEntry<'a> {
    fn new(entry: &'a EcmascriptChunkContentEntry, chunk_path: &str) -> Self {
        /// serde_qs can't serialize a lone enum when it's [serde::untagged].
        #[derive(Serialize)]
        struct Id<'a> {
            id: &'a ModuleId,
        }
        let id = serde_qs::to_string(&Id { id: &entry.id }).unwrap();
        HmrUpdateEntry {
            code: entry.source_code(),
            url: format!("/{}?{}", chunk_path, &id),
            map: entry
                .code
                .has_source_map()
                .then(|| format!("/__turbopack_sourcemap__/{}.map?{}", chunk_path, &id)),
        }
    }
}
