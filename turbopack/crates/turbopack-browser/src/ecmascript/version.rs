use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::{chunk::ModuleId, version::Version};

use super::content_entry::EcmascriptDevChunkContentEntries;

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptDevChunkVersion {
    pub(super) chunk_path: String,
    pub(super) entries_hashes: FxIndexMap<ReadRef<ModuleId>, u64>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: Vc<FileSystemPath>,
        chunk_path: Vc<FileSystemPath>,
        entries: Vc<EcmascriptDevChunkContentEntries>,
    ) -> Result<Vc<Self>> {
        let output_root = output_root.await?;
        let chunk_path = chunk_path.await?;
        let chunk_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in client root {}",
                chunk_path.to_string(),
                output_root.to_string()
            );
        };
        let entries = entries.await?;
        let mut entries_hashes =
            FxIndexMap::with_capacity_and_hasher(entries.len(), Default::default());
        for (id, entry) in entries.iter() {
            entries_hashes.insert(id.clone(), *entry.hash.await?);
        }
        Ok(EcmascriptDevChunkVersion {
            chunk_path: chunk_path.to_string(),
            entries_hashes,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptDevChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_ref(&self.chunk_path);
        let sorted_hashes = {
            let mut hashes: Vec<_> = self.entries_hashes.values().copied().collect();
            hashes.sort();
            hashes
        };
        for hash in sorted_hashes {
            hasher.write_value(hash);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Vc::cell(hex_hash.into())
    }
}
