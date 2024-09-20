use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{ReadRef, Vc};
use turbopack_core::{chunk::ModuleId, code_builder::Code};

use super::{content::EcmascriptDevChunkContent, version::EcmascriptDevChunkVersion};

pub(super) enum EcmascriptChunkUpdate {
    None,
    Partial(EcmascriptChunkPartialUpdate),
}

pub(super) struct EcmascriptChunkPartialUpdate {
    pub added: IndexMap<ReadRef<ModuleId>, (u64, Vc<Code>)>,
    pub deleted: IndexMap<ReadRef<ModuleId>, u64>,
    pub modified: IndexMap<ReadRef<ModuleId>, Vc<Code>>,
}

pub(super) async fn update_ecmascript_chunk(
    content: Vc<EcmascriptDevChunkContent>,
    from: &ReadRef<EcmascriptDevChunkVersion>,
) -> Result<EcmascriptChunkUpdate> {
    let to = content.own_version().await?;

    // When to and from point to the same value we can skip comparing them.
    // This will happen since `TraitRef<Vc<Box<dyn Version>>>::cell` will not clone
    // the value, but only make the cell point to the same immutable value
    // (Arc).
    if from.ptr_eq(&to) {
        return Ok(EcmascriptChunkUpdate::None);
    }

    let content = content.await?;

    let entries = content.entries.await?;
    let mut added = IndexMap::default();
    let mut modified = IndexMap::default();
    let mut deleted = IndexMap::default();

    for (id, from_hash) in &from.entries_hashes {
        if let Some(entry) = entries.get(id) {
            if *entry.hash.await? != *from_hash {
                modified.insert(id.clone(), entry.code);
            }
        } else {
            deleted.insert(id.clone(), *from_hash);
        }
    }

    // Remaining entries are added
    for (id, entry) in entries.iter() {
        if !from.entries_hashes.contains_key(id) {
            added.insert(id.clone(), (*entry.hash.await?, entry.code));
        }
    }

    let update = if added.is_empty() && modified.is_empty() && deleted.is_empty() {
        EcmascriptChunkUpdate::None
    } else {
        EcmascriptChunkUpdate::Partial(EcmascriptChunkPartialUpdate {
            added,
            modified,
            deleted,
        })
    };

    Ok(update)
}
