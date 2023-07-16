use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbopack_css::chunk::{CssChunk, CssChunks};

#[turbo_tasks::function]
pub async fn optimize_css_chunks(chunks: Vc<CssChunks>) -> Result<Vc<CssChunks>> {
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

async fn merge_chunks(
    first: Vc<CssChunk>,
    chunks: impl IntoIterator<Item = &Vc<CssChunk>>,
) -> Result<Vc<CssChunk>> {
    let chunks = chunks.into_iter().copied().try_join().await?;
    let main_entries = chunks
        .iter()
        .map(|c| c.main_entries)
        .try_join()
        .await?
        .iter()
        .flat_map(|e| e.iter().copied())
        .collect::<IndexSet<_>>();
    Ok(CssChunk::new_normalized(
        first.await?.context,
        Vc::cell(main_entries.into_iter().collect()),
        Value::new(first.await?.availability_info),
    ))
}

/// The maximum number of chunks to exist in a single chunk group. The optimizer
/// will merge chunks into groups until it has at most this number of chunks.
const MAX_CHUNK_COUNT: usize = 20;

/// Groups adjacent chunks into at most `MAX_CHUNK_COUNT` groups.
fn aggregate_adjacent_chunks(chunks: &[Vc<CssChunk>]) -> Vec<Vec<Vc<CssChunk>>> {
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
async fn merge_adjacent_chunks(chunks_vc: Vc<CssChunks>) -> Result<Vc<CssChunks>> {
    let chunks = chunks_vc.await?;

    if chunks.len() <= MAX_CHUNK_COUNT {
        return Ok(chunks_vc);
    }

    let chunks = aggregate_adjacent_chunks(&chunks);

    let chunks = chunks
        .into_iter()
        .map(|chunks| async move { merge_chunks(*chunks.first().unwrap(), &chunks).await })
        .try_join()
        .await?;

    Ok(Vc::cell(chunks))
}
