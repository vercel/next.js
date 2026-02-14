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

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptBuildNodeChunkVersion {
    pub(super) chunk_path: String,
    pub(super) chunk_items: Vec<ReadRef<CodeAndIds>>,
    pub(super) minify_type: MinifyType,
    pub(super) entries_hashes: FxIndexMap<ModuleId, u64>,
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

        // Compute per-module hashes for fine-grained HMR tracking
        let mut entries_hashes = FxIndexMap::default();
        for item in &chunk_items {
            for (module_id, code) in item {
                let mut hasher = Xxh3Hash64Hasher::new();
                let source = code.source_code();
                hasher.write_ref(source);
                let hash = hasher.finish();

                entries_hashes.insert(module_id.clone(), hash);
            }
        }

        Ok(EcmascriptBuildNodeChunkVersion {
            chunk_path: chunk_path.to_string(),
            chunk_items,
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
        let hex_hash = encode_hex(hash);
        Vc::cell(hex_hash.into())
    }
}
