use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, TryJoinIterExt, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{chunk::ModuleId, version::Version};
use turbopack_ecmascript::chunk::{EcmascriptChunkContent, EcmascriptChunkContentEntries};

#[turbo_tasks::value(serialization = "skip")]
pub(super) struct EcmascriptBrowserChunkVersion {
    pub(super) chunk_path: String,
    pub(super) entries_hashes: FxIndexMap<ModuleId, u64>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: FileSystemPath,
        chunk_path: FileSystemPath,
        content: Vc<EcmascriptChunkContent>,
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
        Ok(EcmascriptBrowserChunkVersion {
            chunk_path: chunk_path.to_string(),
            entries_hashes,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBrowserChunkVersion {
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
        let hash = encode_base64(hash);
        Vc::cell(hash.into())
    }
}
