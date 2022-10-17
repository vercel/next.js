use std::mem::take;

use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::FileSystemPathOptionVc;
use turbopack_core::chunk::{
    optimize::{optimize_by_common_parent, ChunkOptimizer, ChunkOptimizerVc},
    ChunkGroupVc, ChunkVc, ChunksVc,
};

use super::{CssChunkPlaceablesVc, CssChunkVc};

#[turbo_tasks::value]
pub struct CssChunkOptimizer;

#[turbo_tasks::value_impl]
impl CssChunkOptimizerVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        CssChunkOptimizer.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkOptimizer for CssChunkOptimizer {
    #[turbo_tasks::function]
    async fn optimize(&self, chunks: ChunksVc, _chunk_group: ChunkGroupVc) -> Result<ChunksVc> {
        optimize_by_common_parent(chunks, get_common_parent, optimize_css).await
    }
}

async fn css(chunk: ChunkVc) -> Result<CssChunkVc> {
    if let Some(chunk) = CssChunkVc::resolve_from(chunk).await? {
        Ok(chunk)
    } else {
        bail!("CssChunkOptimizer can only be used on CssChunks")
    }
}

#[turbo_tasks::function]
async fn get_common_parent(chunk: ChunkVc) -> Result<FileSystemPathOptionVc> {
    Ok(css(chunk).await?.common_parent())
}

async fn merge_chunks(first: CssChunkVc, chunks: &[CssChunkVc]) -> Result<CssChunkVc> {
    let chunks = chunks.iter().copied().try_join().await?;
    let main_entries = chunks
        .iter()
        .map(|c| c.main_entries)
        .try_join()
        .await?
        .iter()
        .flat_map(|e| e.iter().copied())
        .collect::<IndexSet<_>>();
    Ok(CssChunkVc::new_normalized(
        first.await?.context,
        CssChunkPlaceablesVc::cell(main_entries.into_iter().collect()),
    ))
}

#[turbo_tasks::function]
async fn optimize_css(local: Option<ChunksVc>, children: Option<ChunksVc>) -> Result<ChunksVc> {
    let mut chunks = Vec::new();
    // TODO optimize
    if let Some(local) = local {
        // Local chunks have the same common_parent and could be merged into fewer
        // chunks. (We use a pretty large threshold for that.)
        let mut local = local.await?.iter().copied().map(css).try_join().await?;
        // TODO decide what to merge (threshold)
        let merged = take(&mut local);
        if let Some(first) = merged.first().copied() {
            local.push(merge_chunks(first, &merged).await?);
        }
        chunks.append(&mut local);
    }
    if let Some(children) = children {
        let mut children = children.await?.iter().copied().map(css).try_join().await?;
        chunks.append(&mut children);
    }
    // Multiple very small chunks could be merged to avoid requests. (We use a small
    // threshold for that.)
    // TODO implement that

    // When there are too many chunks, try hard to reduce the number of chunks to
    // limit the request count.
    if chunks.len() > 50 {
        let size = (chunks.len() + 9) / 10;
        // TODO be smarter in selecting the chunks to merge
        for merged in take(&mut chunks).chunks(size) {
            chunks.push(merge_chunks(*merged.first().unwrap(), merged).await?);
        }
    }
    Ok(ChunksVc::cell(
        chunks.into_iter().map(|c| c.as_chunk()).collect(),
    ))
}
