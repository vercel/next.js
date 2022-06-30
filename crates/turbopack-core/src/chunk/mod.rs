pub mod dev;

use std::collections::HashSet;

use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A module id, which can be a number or string
#[turbo_tasks::value]
pub enum ModuleId {
    Number(i32),
    String(String),
}

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn as_chunk_path(&self, path: FileSystemPathVc) -> FileSystemPathVc;
}

/// An [Asset] that can be converted into a [Chunk].
#[turbo_tasks::value_trait]
pub trait ChunkableAsset: Asset {
    fn as_chunk(&self, context: ChunkingContextVc) -> ChunkVc;
}

#[turbo_tasks::value(ValueToString)]
pub struct ChunkGroup {
    entry: ChunkVc,
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ChunkVc>);

#[turbo_tasks::value_impl]
impl ChunkGroupVc {
    /// Creates a chunk group from an asset as entrypoint
    #[turbo_tasks::function]
    pub fn from_asset(asset: ChunkableAssetVc, context: ChunkingContextVc) -> Self {
        Self::slot(ChunkGroup {
            entry: asset.as_chunk(context),
        })
    }

    /// Lists all chunks that are in this chunk group.
    /// These chunks need to be loaded to fulfill that chunk group.
    /// All chunks should be loaded in parallel.
    #[turbo_tasks::function]
    pub async fn chunks(self) -> Result<ChunksVc> {
        let mut chunks = HashSet::new();

        let mut queue = vec![self.await?.entry];
        while let Some(chunk) = queue.pop() {
            let chunk = chunk.resolve().await?;
            if chunks.insert(chunk) {
                for r in chunk.references().await?.iter() {
                    if let Some(pc) = ParallelChunkReferenceVc::resolve_from(r).await? {
                        if *pc.is_loaded_in_parallel().await? {
                            let result = r.resolve_reference();
                            for a in result.primary_assets().await?.iter() {
                                if let Some(chunk) = ChunkVc::resolve_from(a).await? {
                                    queue.push(chunk);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(ChunksVc::slot(chunks.into_iter().collect()))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroup {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::slot(format!(
            "group for {}",
            self.entry.to_string().await?
        )))
    }
}

/// A chunk is one type of asset.
/// It usually contains multiple chunk items.
/// There is an optional trait [ParallelChunkReference] that
/// [AssetReference]s from a [Chunk] can implement.
/// If they implement that and [ParallelChunkReference::is_loaded_in_parallel]
/// returns true, all referenced assets (if they are [Chunk]s) are placed in the
/// same chunk group.
#[turbo_tasks::value_trait]
pub trait Chunk: Asset + ValueToString {}

/// see [Chunk] for explanation
#[turbo_tasks::value_trait]
pub trait ParallelChunkReference: AssetReference {
    fn is_loaded_in_parallel(&self) -> BoolVc;
}

/// An [AssetReference] implementing this trait and returning true for
/// [ChunkableAssetReference::is_chunkable] are considered as potentially
/// chunkable references. When all [Asset]s of such a reference implement
/// [ChunkableAsset] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableAssetReference: AssetReference {
    fn is_chunkable(&self) -> BoolVc;
}

/// When this trait is implemented by an [AssetReference] the chunks needed are
/// potentially loaded async, as a separate chunk group. If it's not implemented
/// chunks are loaded within the current chunk group
#[turbo_tasks::value_trait]
pub trait AsyncLoadableReference: AssetReference {
    fn is_loaded_async(&self) -> BoolVc;
}

/// A reference to a [Chunk]. Can be loaded in parallel, see [Chunk].
#[turbo_tasks::value(AssetReference, ParallelChunkReference)]
pub struct ChunkReference {
    chunk: ChunkVc,
    parallel: bool,
}

#[turbo_tasks::value_impl]
impl ChunkReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk: ChunkVc) -> Self {
        Self::slot(ChunkReference {
            chunk,
            parallel: false,
        })
    }

    #[turbo_tasks::function]
    pub fn new_parallel(chunk: ChunkVc) -> Self {
        Self::slot(ChunkReference {
            chunk,
            parallel: true,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.chunk.into(), Vec::new()).into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::slot(format!(
            "chunk {}",
            self.chunk.to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ParallelChunkReference for ChunkReference {
    #[turbo_tasks::function]
    fn is_loaded_in_parallel(&self) -> BoolVc {
        BoolVc::slot(self.parallel)
    }
}

/// A reference to multiple chunks from a [ChunkGroup]
#[turbo_tasks::value(AssetReference)]
pub struct ChunkGroupReference {
    chunk_group: ChunkGroupVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk_group: ChunkGroupVc) -> Self {
        Self::slot(ChunkGroupReference { chunk_group })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkGroupReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let set = self
            .chunk_group
            .chunks()
            .await?
            .iter()
            .map(|c| c.as_asset())
            .collect();
        Ok(ResolveResult::Alternatives(set, Vec::new()).into())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::slot(format!(
            "chunk group {}",
            self.chunk_group.to_string().await?
        )))
    }
}
