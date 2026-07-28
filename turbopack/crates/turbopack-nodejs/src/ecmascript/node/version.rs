use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, TryJoinIterExt, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{
    chunk::{MinifyType, ModuleId},
    version::{Version, VersionIdCache},
};
use turbopack_ecmascript::chunk::{EcmascriptChunkContent, EcmascriptChunkContentEntries};

#[turbo_tasks::value(serialization = "skip")]
pub(super) struct EcmascriptBuildNodeChunkVersion {
    pub(super) chunk_path: RcStr,
    pub(super) minify_type: MinifyType,
    pub(super) entries_hashes: FxIndexMap<ModuleId, u128>,
    id_cache: VersionIdCache,
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
            turbobail!("chunk path {chunk_path} is not in client root {output_root}");
        };
        let entries_hashes = EcmascriptChunkContentEntries::new(content)
            .await?
            .iter()
            .map(async |(id, entry)| Ok((id.clone(), *entry.hash.await?)))
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(EcmascriptBuildNodeChunkVersion {
            chunk_path: chunk_path.into(),
            minify_type,
            entries_hashes,
            id_cache: VersionIdCache::default(),
        }
        .cell())
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Version for EcmascriptBuildNodeChunkVersion {
    async fn id(&self) -> Result<RcStr> {
        self.id_cache
            .get_or_init(async || {
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
                Ok(encode_base64(hash).into())
            })
            .await
    }
}
