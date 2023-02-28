use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::{
    chunk::ModuleIdReadRef,
    version::{Version, VersionVc},
};

#[turbo_tasks::value(shared, serialization = "none")]
pub(super) struct EcmascriptChunkVersion {
    pub(super) chunk_server_path: String,
    pub(super) module_factories_hashes: IndexMap<ModuleIdReadRef, u64>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> StringVc {
        let mut hasher = Xxh3Hash64Hasher::new();
        let sorted_hashes = {
            let mut hashes: Vec<_> = self.module_factories_hashes.values().copied().collect();
            hashes.sort();
            hashes
        };
        for hash in sorted_hashes {
            hasher.write_value(hash);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        StringVc::cell(hex_hash)
    }
}
