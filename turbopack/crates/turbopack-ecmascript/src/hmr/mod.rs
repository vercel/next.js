use turbo_tasks::Vc;
use turbopack_core::version::VersionedContent;

use crate::{chunk::EcmascriptChunkContentEntries, hmr::version::EcmascriptChunkVersion};

/// Diffing and merging of Ecmascript chunk contents for hot module replacement.
///
/// Each module covers both the single-chunk and the merged (multi-chunk) case,
/// the latter being what a chunk list produces a single update from.
pub mod content;
pub mod merger;
pub mod update;
pub mod version;

/// An Ecmascript chunk content that participates in HMR.
///
/// Exists so the version/diff/merge machinery can be written once against the
/// trait rather than duplicated per runtime. The turbo-tasks value types cannot
/// be generic, so the runtimes keep their own content structs and implement this
/// to expose the two things the shared machinery needs.
#[turbo_tasks::value_trait]
pub trait EcmascriptHmrChunkContent: VersionedContent {
    /// The per-module code and hashes making up this chunk.
    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<EcmascriptChunkContentEntries>;

    /// The same value as [`VersionedContent::version`], but with the concrete
    /// type the diffing machinery needs instead of `Box<dyn Version>`.
    #[turbo_tasks::function]
    fn ecmascript_chunk_version(self: Vc<Self>) -> Vc<EcmascriptChunkVersion>;
}
