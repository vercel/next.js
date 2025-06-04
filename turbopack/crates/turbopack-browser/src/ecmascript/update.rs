use anyhow::Result;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, Vc};
use turbopack_core::{chunk::ModuleId, code_builder::Code};

use super::{content::EcmascriptBrowserChunkContent, version::EcmascriptBrowserChunkVersion};

#[allow(clippy::large_enum_variant)]
pub(super) enum EcmascriptChunkUpdate {
    None,
    Partial(EcmascriptChunkPartialUpdate),
}

pub(super) struct EcmascriptChunkPartialUpdate {
    pub added: FxIndexMap<ReadRef<ModuleId>, (u64, ResolvedVc<Code>)>,
    pub deleted: FxIndexMap<ReadRef<ModuleId>, u64>,
    pub modified: FxIndexMap<ReadRef<ModuleId>, ResolvedVc<Code>>,
}

pub(super) async fn update_ecmascript_chunk(
    content: Vc<EcmascriptBrowserChunkContent>,
    from: &ReadRef<EcmascriptBrowserChunkVersion>,
) -> Result<EcmascriptChunkUpdate> {
    let to = content.own_version().await?;

    // When to and from point to the same value we can skip comparing them. This will happen since
    // `TraitRef::<Box<dyn Version>>::cell` will not clone the value, but only make the cell point
    // to the same immutable value (`Arc`).
    if from.ptr_eq(&to) {
        return Ok(EcmascriptChunkUpdate::None);
    }

    let entries = content.entries().await?;
    let mut added = FxIndexMap::default();
    let mut modified = FxIndexMap::default();
    let mut deleted = FxIndexMap::default();

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
