use anyhow::Result;
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{FxIndexMap, Vc, turbobail};
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
        let entries = turbo_tasks::read!(EcmascriptChunkContentEntries::new(content))?;
        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work runs concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let entries_hashes: FxIndexMap<ModuleId, u64> = entries
            .iter()
            .map(async |(id, entry)| Ok((id.clone(), *turbo_tasks::read!(entry.hash)?)))
            .try_join()
            .await?
            .into_iter()
            .collect();
        #[cfg(feature = "sync")]
        let entries_hashes: FxIndexMap<ModuleId, u64> = {
            let mut entries_hashes = FxIndexMap::default();
            for (id, entry) in entries.iter() {
                entries_hashes.insert(id.clone(), *turbo_tasks::read!(entry.hash)?);
            }
            entries_hashes
        };
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
