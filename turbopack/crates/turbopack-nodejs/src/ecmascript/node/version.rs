use anyhow::{Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_hex};
use turbopack_core::{
    chunk::{MinifyType, ModuleId},
    version::Version,
};
use turbopack_ecmascript::chunk::{CodeAndIds, EcmascriptChunkContent};

use super::content_entry::EcmascriptBuildNodeChunkContentEntries;

#[turbo_tasks::value(serialization = "none")]
pub(crate) struct EcmascriptBuildNodeChunkVersion {
    pub(crate) chunk_path: String,
    pub(crate) entries_hashes: FxIndexMap<ModuleId, u64>,
    chunk_items: Vec<ReadRef<CodeAndIds>>,
    minify_type: MinifyType,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: FileSystemPath,
        chunk_path: FileSystemPath,
        content: Vc<EcmascriptChunkContent>,
        minify_type: MinifyType,
    ) -> Result<Vc<Self>> {
        let output_root = output_root.clone();
        let chunk_path = chunk_path.clone();
        let chunk_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!("chunk path {chunk_path} is not in client root {output_root}");
        };
        let chunk_items = content.await?.chunk_item_code_and_ids().await?;

        // Build entries_hashes for HMR update diffing
        let entries = EcmascriptBuildNodeChunkContentEntries::new(content).await?;
        let mut entries_hashes =
            FxIndexMap::with_capacity_and_hasher(entries.len(), Default::default());
        for (id, entry) in entries.iter() {
            entries_hashes.insert(id.clone(), *entry.hash.await?);
        }

        Ok(EcmascriptBuildNodeChunkVersion {
            chunk_path: chunk_path.to_string(),
            entries_hashes,
            chunk_items,
            minify_type,
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
        hasher.write_value(self.chunk_items.len());
        for item in &self.chunk_items {
            for (module_id, code) in item {
                hasher.write_value((module_id, code.source_code()));
            }
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Vc::cell(hex_hash.into())
    }
}
