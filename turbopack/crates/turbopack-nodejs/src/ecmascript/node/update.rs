use anyhow::Result;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, Vc};
use turbopack_core::{chunk::ModuleId, code_builder::Code};

use super::{content::EcmascriptBuildNodeChunkContent, version::EcmascriptBuildNodeChunkVersion};

#[allow(clippy::large_enum_variant)]
pub(crate) enum EcmascriptNodeChunkUpdate {
    None,
    Partial(EcmascriptNodeChunkPartialUpdate),
}

pub(crate) struct EcmascriptNodeChunkPartialUpdate {
    pub added: FxIndexMap<ModuleId, (u64, ResolvedVc<Code>)>,
    pub deleted: FxIndexMap<ModuleId, u64>,
    pub modified: FxIndexMap<ModuleId, ResolvedVc<Code>>,
}

pub(crate) async fn update_ecmascript_node_chunk(
    content: Vc<EcmascriptBuildNodeChunkContent>,
    from: &ReadRef<EcmascriptBuildNodeChunkVersion>,
) -> Result<EcmascriptNodeChunkUpdate> {
    let to = content.own_version().await?;

    // When to and from point to the same value we can skip comparing them.
    if from.ptr_eq(&to) {
        return Ok(EcmascriptNodeChunkUpdate::None);
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
        EcmascriptNodeChunkUpdate::None
    } else {
        EcmascriptNodeChunkUpdate::Partial(EcmascriptNodeChunkPartialUpdate {
            added,
            modified,
            deleted,
        })
    };

    Ok(update)
}
