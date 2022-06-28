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

#[turbo_tasks::value]
pub enum ModuleId {
    Number(i32),
    String(String),
}

#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn as_chunk_path(&self, path: FileSystemPathVc) -> FileSystemPathVc;
}

impl ChunkingContextVc {
    pub fn as_chunk_group(self, asset: ChunkableAssetVc) -> ChunkGroupVc {
        ChunkGroupVc::slot(ChunkGroup {
            entry: asset.as_chunk(self),
        })
    }
}

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

#[turbo_tasks::value_trait]
pub trait Chunk: Asset + ValueToString {}

#[turbo_tasks::value_trait]
pub trait ParallelChunkReference: AssetReference {
    fn is_loaded_in_parallel(&self) -> BoolVc;
}

#[turbo_tasks::value_trait]
pub trait ChunkableAssetReference: AssetReference {
    fn is_chunkable(&self) -> BoolVc;
}

#[turbo_tasks::value_trait]
pub trait AsyncLoadableReference: AssetReference {
    fn is_loaded_async(&self) -> BoolVc;
}

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
