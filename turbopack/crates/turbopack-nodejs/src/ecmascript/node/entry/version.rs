use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, Vc};
use turbopack_core::version::Version;

use crate::ecmascript::node::version::EcmascriptBuildNodeChunkVersion;

/// Version for entry chunks that tracks the versions of all child chunks.
#[turbo_tasks::value(serialization = "none", shared)]
pub(crate) struct EcmascriptBuildNodeEntryChunkVersion {
    /// Versions of all child chunks
    pub(crate) chunk_versions: Vec<ReadRef<EcmascriptBuildNodeChunkVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for EcmascriptBuildNodeEntryChunkVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        // Combine all chunk version IDs
        let mut combined = String::new();
        for version in &self.chunk_versions {
            if !combined.is_empty() {
                combined.push(':');
            }
            combined.push_str(&version.chunk_path);
        }
        Vc::cell(combined.into())
    }
}
