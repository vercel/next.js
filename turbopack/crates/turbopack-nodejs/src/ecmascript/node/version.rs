use std::hash::{Hash, Hasher};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{DeterministicHasher, Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{chunk::ModuleId, version::Version};
use turbopack_ecmascript::{
    chunk::{CodeAndIds, EcmascriptChunkContent},
    emit_options::EcmascriptEmitOptions,
};

/// Adapts [`Xxh3Hash64Hasher`] to the [`std::hash::Hasher`] trait so that types
/// implementing [`std::hash::Hash`] (such as [`SwcMinifyOptions`]) can be hashed
/// deterministically across platforms and runs (unlike [`DefaultHasher`], which
/// uses a random seed).
struct Xxh3StdHasher(Xxh3Hash64Hasher);

impl Hasher for Xxh3StdHasher {
    fn write(&mut self, bytes: &[u8]) {
        self.0.write_bytes(bytes);
    }

    fn finish(&self) -> u64 {
        self.0.finish()
    }
}

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptBuildNodeChunkVersion {
    pub(super) chunk_path: String,
    pub(super) chunk_items: Vec<ReadRef<CodeAndIds>>,
    pub(super) ecma_opts: ReadRef<EcmascriptEmitOptions>,
    pub(super) entries_hashes: FxIndexMap<ModuleId, u64>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkVersion {
    #[turbo_tasks::function]
    pub async fn new(
        output_root: FileSystemPath,
        chunk_path: FileSystemPath,
        content: Vc<EcmascriptChunkContent>,
        ecma_opts: Vc<EcmascriptEmitOptions>,
    ) -> Result<Vc<Self>> {
        let output_root = output_root.clone();
        let chunk_path = chunk_path.clone();
        let chunk_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            turbobail!("chunk path {chunk_path} is not in client root {output_root}");
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
            ecma_opts: ecma_opts.await?,
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
        // Hash EcmascriptEmitOptions via Xxh3StdHasher for deterministic results
        let mut opts_hasher = Xxh3StdHasher(Xxh3Hash64Hasher::new());
        self.ecma_opts.hash(&mut opts_hasher);
        hasher.write_value(opts_hasher.finish());
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
