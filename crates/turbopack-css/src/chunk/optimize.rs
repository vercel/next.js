use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::TryJoinIterExt;
use turbopack_core::chunk::{
    optimize::{ChunkOptimizer, ChunkOptimizerVc},
    ChunkGroupVc, ChunkVc, ChunkingContextVc, ChunksVc,
};

use super::{CssChunkPlaceablesVc, CssChunkVc};

#[turbo_tasks::value]
pub struct CssChunkOptimizer(ChunkingContextVc);

#[turbo_tasks::value_impl]
impl CssChunkOptimizerVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc) -> Self {
        CssChunkOptimizer(context).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkOptimizer for CssChunkOptimizer {
    #[turbo_tasks::function]
    async fn optimize(&self, chunks: ChunksVc, _chunk_group: ChunkGroupVc) -> Result<ChunksVc> {
        // The CSS optimizer works under the constraint that the order in which
        // CSS chunks are loaded must be preserved, as CSS rules
        // precedence is determined by the order in which they are
        // loaded. This means that we may not merge chunks that are not
        // adjacent to each other in a valid reverse topological order.

        // TODO(alexkirsz) It might be more interesting to only merge adjacent
        // chunks when they are part of the same chunk subgraph.
        // However, the optimizer currently does not have access to this
        // information, as chunks are already fully flattened by the
        // time they reach the optimizer.

        merge_adjacent_chunks(chunks).await
    }
}

async fn css(chunk: ChunkVc) -> Result<CssChunkVc> {
    if let Some(chunk) = CssChunkVc::resolve_from(chunk).await? {
        Ok(chunk)
    } else {
        bail!("CssChunkOptimizer can only be used on CssChunks")
    }
}

async fn merge_chunks(
    first: CssChunkVc,
    chunks: impl IntoIterator<Item = &CssChunkVc>,
) -> Result<CssChunkVc> {
    let chunks = chunks.into_iter().copied().try_join().await?;
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

/// The maximum number of chunks to exist in a single chunk group. The optimizer
/// will merge chunks into groups until it has at most this number of chunks.
const MAX_CHUNK_COUNT: usize = 20;

/// Groups adjacent chunks into at most `MAX_CHUNK_COUNT` groups.
fn aggregate_adjacent_chunks(chunks: &[ChunkVc]) -> Vec<Vec<ChunkVc>> {
    // Each of the resulting merged chunks will have `chunks_per_merged_chunk`
    // chunks in them, except for the first `chunks_mod` chunks, which will have
    // one more chunk.
    let chunks_per_merged_chunk = chunks.len() / MAX_CHUNK_COUNT;
    let mut chunks_mod = chunks.len() % MAX_CHUNK_COUNT;

    let mut chunks_vecs = vec![];
    let mut current_chunks = vec![];

    for chunk in chunks.iter().copied() {
        if current_chunks.len() < chunks_per_merged_chunk {
            current_chunks.push(chunk);
        } else if current_chunks.len() == chunks_per_merged_chunk && chunks_mod > 0 {
            current_chunks.push(chunk);
            chunks_mod -= 1;
            chunks_vecs.push(std::mem::take(&mut current_chunks));
        } else {
            chunks_vecs.push(std::mem::take(&mut current_chunks));
            current_chunks.push(chunk);
        }
    }

    if !current_chunks.is_empty() {
        chunks_vecs.push(current_chunks);
    }

    chunks_vecs
}

/// Merges adjacent chunks into at most `MAX_CHUNK_COUNT` chunks.
async fn merge_adjacent_chunks(chunks_vc: ChunksVc) -> Result<ChunksVc> {
    let chunks = chunks_vc.await?;

    if chunks.len() <= MAX_CHUNK_COUNT {
        return Ok(chunks_vc);
    }

    let chunks = aggregate_adjacent_chunks(&chunks);

    let chunks = chunks
        .into_iter()
        .map(|chunks| async move {
            let chunks = chunks.iter().copied().map(css).try_join().await?;
            merge_chunks(*chunks.first().unwrap(), &chunks).await
        })
        .try_join()
        .await?
        .into_iter()
        .map(|chunk| chunk.as_chunk())
        .collect();

    Ok(ChunksVc::cell(chunks))
}
