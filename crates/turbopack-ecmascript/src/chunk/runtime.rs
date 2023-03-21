use turbo_tasks::{ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::ChunkGroupVc,
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
    source_map::{GenerateSourceMap, GenerateSourceMapVc},
    version::{VersionedContent, VersionedContentVc},
};

use super::EcmascriptChunkVc;

/// The runtime for an EcmaScript chunk.
#[turbo_tasks::value_trait]
pub trait EcmascriptChunkRuntime: ValueToString {
    /// Decorates the asset identifiers of the chunk to make it unique for this
    /// runtime.
    fn decorate_asset_ident(&self, chunk: EcmascriptChunkVc, ident: AssetIdentVc) -> AssetIdentVc;

    /// Sets a custom chunk group for this runtime. This is used in the
    /// optimizer.
    fn with_chunk_group(&self, chunk_group: ChunkGroupVc) -> Self;

    /// Returns references from this runtime.
    fn references(&self, chunk: EcmascriptChunkVc) -> AssetReferencesVc;

    /// Returns the content of the given chunk adapted to this runtime.
    fn content(&self, chunk: EcmascriptChunkVc) -> EcmascriptChunkRuntimeContentVc;

    /// Merges this runtime with the given runtimes.
    fn merge(&self, runtimes: Vec<EcmascriptChunkRuntimeVc>) -> EcmascriptChunkRuntimeVc;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkRuntimeContent: VersionedContent + GenerateSourceMap {}
