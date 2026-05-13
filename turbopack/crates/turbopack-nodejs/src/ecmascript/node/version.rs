use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{
    chunk::{MinifyType, ModuleId},
    version::Version,
};

use super::content_entry::EcmascriptBuildNodeChunkContentEntries;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkVersion {
    pub(super) chunk_path: RcStr,
    pub(super) minify_type: MinifyType,
    #[bincode(with = "turbo_bincode::indexmap")]
    pub(super) entries_hashes: FxIndexMap<ModuleId, u64>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: FileSystemPath,
        chunk_path: FileSystemPath,
        entries: Vc<EcmascriptBuildNodeChunkContentEntries>,
        minify_type: MinifyType,
    ) -> Result<Vc<Self>> {
        let output_root = output_root.clone();
        let chunk_path = chunk_path.clone();
        let chunk_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            turbobail!("chunk path {chunk_path} is not in client root {output_root}");
        };
        let entries = entries.await?;
        let mut entries_hashes =
            FxIndexMap::with_capacity_and_hasher(entries.len(), Default::default());
        for (id, entry) in entries.iter() {
            entries_hashes.insert(id.clone(), *entry.hash.await?);
        }
        Ok(EcmascriptBuildNodeChunkVersion {
            chunk_path: chunk_path.into(),
            minify_type,
            entries_hashes,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBuildNodeChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_ref(&self.chunk_path);
        hasher.write_ref(&self.minify_type);
        let sorted_hashes = {
            let mut hashes: Vec<_> = self.entries_hashes.values().copied().collect();
            hashes.sort();
            hashes
        };
        for hash in sorted_hashes {
            hasher.write_value(hash);
        }
        let hash = hasher.finish();
        let hash = encode_base64(hash);
        Vc::cell(hash.into())
    }
}
