use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, Vc};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_hex};
use turbopack_core::version::Version;

use super::super::version::EcmascriptBrowserChunkVersion;

/// The version of a [`super::content::EcmascriptMergedChunkContent`]. This is
/// essentially a composite [`EcmascriptChunkVersion`].
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) struct EcmascriptBrowserMergedChunkVersion {
    #[turbo_tasks(trace_ignore)]
    pub(super) versions: Vec<(ReadRef<EcmascriptBrowserChunkVersion>, RcStr)>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBrowserMergedChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.versions.len());

        let mut sorted_ids = self
            .versions
            .iter()
            .map(|(_, version)| version)
            .collect::<Vec<_>>();
        sorted_ids.sort();
        for id in sorted_ids {
            hasher.write_value(id);
        }

        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Vc::cell(hex_hash.into())
    }
}
