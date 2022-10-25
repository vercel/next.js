use std::{cmp::Ordering, collections::HashSet, mem::take};

use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::FileSystemPathOptionVc;
use turbopack_core::chunk::{
    optimize::{optimize_by_common_parent, ChunkOptimizer, ChunkOptimizerVc},
    ChunkGroupVc, ChunkVc, ChunkingContextVc, ChunksVc,
};

use super::{EcmascriptChunkPlaceablesVc, EcmascriptChunkVc};
use crate::chunk::EcmascriptChunkEvaluate;

#[turbo_tasks::value]
pub struct EcmascriptChunkOptimizer(ChunkingContextVc);

#[turbo_tasks::value_impl]
impl EcmascriptChunkOptimizerVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc) -> Self {
        EcmascriptChunkOptimizer(context).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkOptimizer for EcmascriptChunkOptimizer {
    #[turbo_tasks::function]
    async fn optimize(&self, chunks: ChunksVc, chunk_group: ChunkGroupVc) -> Result<ChunksVc> {
        optimize_by_common_parent(chunks, get_common_parent, |local, children| {
            optimize_ecmascript(local, children, chunk_group)
        })
        .await
    }
}

async fn ecma(chunk: ChunkVc) -> Result<EcmascriptChunkVc> {
    if let Some(chunk) = EcmascriptChunkVc::resolve_from(chunk).await? {
        Ok(chunk)
    } else {
        bail!("EcmascriptChunkOptimizer can only be used on EcmascriptChunks")
    }
}

#[turbo_tasks::function]
async fn get_common_parent(chunk: ChunkVc) -> Result<FileSystemPathOptionVc> {
    Ok(ecma(chunk).await?.common_parent())
}

async fn merge_chunks(
    first: EcmascriptChunkVc,
    chunks: &[EcmascriptChunkVc],
) -> Result<EcmascriptChunkVc> {
    let chunks = chunks.iter().copied().try_join().await?;
    let main_entries = chunks
        .iter()
        .map(|c| c.main_entries)
        .try_join()
        .await?
        .iter()
        .flat_map(|e| e.iter().copied())
        .collect::<IndexSet<_>>();
    let evaluate = chunks.iter().find_map(|e| e.evaluate);
    Ok(EcmascriptChunkVc::new_normalized(
        first.await?.context,
        EcmascriptChunkPlaceablesVc::cell(main_entries.into_iter().collect()),
        None,
        evaluate,
    ))
}

/// Number of chunks to compare with to chunk for duplication.
/// This limit restricts the complexity from O(n²) to O(M * n) = O(n)
const COMPARE_WITH_COUNT: usize = 100;
/// Max percentage of shared chunk items between two chunk before they are
/// merged.
const DUPLICATION_THRESHOLD: f32 = 0.1;
/// Max percentage of unshared chunk items on either side before chunks are
/// merged.
const CONTAINED_THRESHOLD: f32 = 0.05;
/// Max number of local chunks. Will be merged into a single chunk when over the
/// threshold.
const LOCAL_CHUNK_MERGE_THRESHOLD: usize = 10;
/// Max number of total chunks. Will be merged randomly to stay within the
/// limit.
const TOTAL_CHUNK_MERGE_THRESHOLD: usize = 10;

async fn merge_duplicated_and_contained(
    chunks: &mut Vec<EcmascriptChunkVc>,
    mut unoptimized_count: usize,
) -> Result<()> {
    struct Comparison {
        /// Index of chunk in the `chunks` vec
        index: usize,
        other: EcmascriptChunkVc,
        shared: usize,
        left: usize,
        right: usize,
    }

    impl Comparison {
        fn left_contained_factor(&self) -> f32 {
            self.left as f32 / (self.left + self.shared) as f32
        }
        fn right_contained_factor(&self) -> f32 {
            self.right as f32 / (self.right + self.shared) as f32
        }
        fn duplication_factor(&self) -> f32 {
            self.shared as f32 / (self.left + self.right + self.shared) as f32
        }
    }

    // This type assumes that f32 is never in an NaN or invalid state
    struct FloatOrd(f32);

    impl PartialEq for FloatOrd {
        fn eq(&self, other: &Self) -> bool {
            self.0 == other.0
        }
    }
    impl Eq for FloatOrd {}

    impl PartialOrd for FloatOrd {
        fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
            self.0.partial_cmp(&other.0)
        }
    }
    impl Ord for FloatOrd {
        fn cmp(&self, other: &Self) -> Ordering {
            self.partial_cmp(other).unwrap_or(Ordering::Equal)
        }
    }

    // We compare each unoptimized chunk with COMPARE_WITH_COUNT following chunks to
    // find duplication greater than DUPLICATION_THRESHOLD.
    let mut i = 0;
    while i < unoptimized_count {
        let chunk = chunks[i];
        // Compare chunk with following chunks
        let mut comparisons = chunks[i + 1..]
            .iter()
            .enumerate()
            .take(COMPARE_WITH_COUNT)
            .map(|(j, &other)| async move {
                let compare = EcmascriptChunkVc::compare(chunk, other).await?;
                Ok(Comparison {
                    // since enumerate is offset by `i + 1` we need to account for that
                    index: i + j + 1,
                    other,
                    shared: compare.shared_chunk_items,
                    left: compare.left_chunk_items,
                    right: compare.right_chunk_items,
                })
            })
            .try_join()
            .await?;

        // List of planned merges
        let mut merged = vec![chunk];
        let mut merged_indices = Vec::new();
        loop {
            let mut merge = |j, other, correction: Option<(usize, &mut Vec<Comparison>)>| {
                merged.push(other);
                merged_indices.push(j);
                if let Some((correction, comparisons)) = correction {
                    comparisons.retain_mut(
                        |Comparison {
                             other: third_chunk,
                             left: other_left,
                             ..
                         }| {
                            if *third_chunk == other {
                                false
                            } else {
                                // This is not perfect, since we don't know if these chunk items are
                                // actually shared between "other" and "third_chunk". But for
                                // efficiency we assume they are
                                // not. We are doing a second pass on the chunk
                                // anyway.
                                *other_left += correction;
                                true
                            }
                        },
                    );
                }
            };
            // Select the best contained chunk, that is a chunk that has the the most chunk
            // items included in the other chunk relative to the smaller chunk's total
            // number of chunk items
            if let Some((
                &Comparison {
                    index: j,
                    other,
                    right,
                    ..
                },
                left_contained_factor,
                right_contained_factor,
            )) = comparisons
                .iter()
                .map(|cmp| {
                    (
                        cmp,
                        cmp.left_contained_factor(),
                        cmp.right_contained_factor(),
                    )
                })
                .min_by_key(|&(_, left, right)| std::cmp::min(FloatOrd(left), FloatOrd(right)))
            {
                // Merge when right is mostly contained in left or vice versa
                if right_contained_factor < CONTAINED_THRESHOLD {
                    merge(j, other, Some((right, &mut comparisons)));
                    // Continue looking for more candidates
                    continue;
                } else if left_contained_factor < CONTAINED_THRESHOLD {
                    merge(j, other, None);
                    // comparison will be skewed too much, re-compare chunks
                    break;
                }
            }
            // Select the best candidate for merging
            if let Some((
                &Comparison {
                    index: j,
                    other,
                    right,
                    ..
                },
                duplication_factor,
            )) = comparisons
                .iter()
                .map(|cmp| (cmp, cmp.duplication_factor()))
                .max_by_key(|&(_, f)| FloatOrd(f))
            {
                // Merge when there is a lot of duplication
                if duplication_factor > DUPLICATION_THRESHOLD {
                    merge(j, other, Some((right, &mut comparisons)));
                    // Continue looking for more candidates
                    continue;
                }
            }

            // No candidates found, stop it
            break;
        }
        if merged.len() > 1 {
            // Merge selected chunks
            chunks[i] = merge_chunks(chunk, &merged).await?;

            // We need to fix the unoptimized_count when we merge unoptimized chunks
            unoptimized_count -= merged_indices
                .iter()
                .filter(|&&j| j < unoptimized_count)
                .count();

            // Remove merged chunks from chunks list
            let mut remove = merged[1..].iter().collect::<HashSet<_>>();
            chunks.retain(|c| !remove.remove(c));
            // All merged chunks must be removed
            debug_assert!(remove.is_empty());
            // Don't increase i, since we want to re-visit the chunk for more
            // merging
        } else {
            i += 1;
        }
    }
    Ok(())
}

#[turbo_tasks::function]
async fn optimize_ecmascript(
    local: Option<ChunksVc>,
    children: Option<ChunksVc>,
    chunk_group: ChunkGroupVc,
) -> Result<ChunksVc> {
    let mut chunks = Vec::new();
    // TODO optimize
    let mut unoptimized_count = 0;
    if let Some(local) = local {
        // Local chunks have the same common_parent and could be merged into fewer
        // chunks. (We use a pretty large threshold for that.)
        let mut local = local.await?.iter().copied().map(ecma).try_join().await?;
        // Merge all local chunks when they are too many
        if local.len() > LOCAL_CHUNK_MERGE_THRESHOLD {
            let merged = take(&mut local);
            if let Some(first) = merged.first().copied() {
                local.push(merge_chunks(first, &merged).await?);
            }
        }
        for chunk in local.iter_mut() {
            let content = (*chunk).await?;
            if let Some(evaluate) = content.evaluate {
                let evaluate = evaluate.await?;
                *chunk = EcmascriptChunkVc::new_normalized(
                    content.context,
                    content.main_entries,
                    content.omit_entries,
                    Some(
                        EcmascriptChunkEvaluate {
                            evaluate_entries: evaluate.evaluate_entries,
                            chunk_group: Some(chunk_group),
                        }
                        .cell(),
                    ),
                )
            }
        }
        unoptimized_count = local.len();
        chunks.append(&mut local);
    }
    if let Some(children) = children {
        let mut children = children.await?.iter().copied().map(ecma).try_join().await?;
        chunks.append(&mut children);
    }

    // Merge chunks that have a lot duplication between them. children will never
    // have duplication, but there might be duplication within local chunks or
    // between local chunks and children.
    if unoptimized_count > 0 && chunks.len() > 1 {
        merge_duplicated_and_contained(&mut chunks, unoptimized_count).await?;
    }

    // If chunks share chunk items they might be removed from one of them. The
    // bigger chunk should be preferred, to make it smaller.
    // TODO implement that

    // Multiple very small chunks could be merged to avoid requests. (We use a small
    // threshold for that.)
    // TODO implement that

    // When there are too many chunks, try hard to reduce the number of chunks to
    // limit the request count.
    if chunks.len() > TOTAL_CHUNK_MERGE_THRESHOLD {
        let size = chunks.len().div_ceil(TOTAL_CHUNK_MERGE_THRESHOLD);
        // TODO be smarter in selecting the chunks to merge
        for merged in take(&mut chunks).chunks(size) {
            chunks.push(merge_chunks(*merged.first().unwrap(), merged).await?);
        }
    }
    Ok(ChunksVc::cell(
        chunks.into_iter().map(|c| c.as_chunk()).collect(),
    ))
}
