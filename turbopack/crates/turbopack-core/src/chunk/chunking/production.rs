use std::{collections::BinaryHeap, hash::BuildHasherDefault};

use anyhow::{bail, Result};
use rustc_hash::FxHasher;
use tracing::{field::Empty, Instrument};
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};

use crate::{
    chunk::{
        chunking::{make_chunk, ChunkItemWithInfo, SplitContext},
        ChunkingConfig,
    },
    module::Module,
    module_graph::ModuleGraph,
};

pub async fn make_production_chunks(
    chunk_items: Vec<ChunkItemWithInfo>,
    module_graph: Vc<ModuleGraph>,
    chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let span_outer = tracing::trace_span!(
        "make production chunks",
        chunk_items = chunk_items.len(),
        chunks_before_min_chunk_size = Empty,
        chunks = Empty,
        total_size = Empty
    );
    let span = span_outer.clone();
    async move {
        let chunk_group_info = module_graph.chunk_group_info().await?;

        let mut grouped_chunk_items = FxIndexMap::<_, Vec<ChunkItemWithInfo>>::default();

        for chunk_item in chunk_items {
            let ChunkItemWithInfo { module, .. } = chunk_item;
            let chunk_groups = if let Some(module) = module {
                match chunk_group_info.get(&ResolvedVc::upcast(module)) {
                    Some(chunk_group) => Some(chunk_group),
                    None => {
                        bail!(
                            "Module {:?} has no chunk group info",
                            module.ident().to_string().await?,
                        );
                    }
                }
            } else {
                None
            };
            let key = BuildHasherDefault::<FxHasher>::default().prehash(chunk_groups);
            grouped_chunk_items.entry(key).or_default().push(chunk_item);
        }

        let &ChunkingConfig { min_chunk_size, .. } = chunking_config;

        if min_chunk_size == 0 {
            span.record("chunks", grouped_chunk_items.len());
            for chunk_items in grouped_chunk_items.into_values() {
                make_chunk(chunk_items, &mut String::new(), &mut split_context).await?;
            }
        } else {
            let mut heap = BinaryHeap::new();

            span.record("chunks_before_min_chunk_size", heap.len());

            for chunk_items in grouped_chunk_items.into_values() {
                let size = chunk_items
                    .iter()
                    .map(|chunk_item| chunk_item.size)
                    .sum::<usize>();
                heap.push(ChunkCandidate { size, chunk_items });
            }

            loop {
                if let Some(smallest) = heap.peek() {
                    if smallest.size < min_chunk_size {
                        let ChunkCandidate { size, chunk_items } = heap.pop().unwrap();
                        if let Some(mut item) = heap.peek_mut() {
                            if item.size < min_chunk_size {
                                // Merge them
                                item.size += size;
                                item.chunk_items.extend(chunk_items);
                                continue;
                            }
                        }
                        // Couldn't be merged, reinsert
                        heap.push(ChunkCandidate { size, chunk_items });
                    }
                }
                break;
            }

            span.record("chunks", heap.len());

            let mut total_size = 0;
            for ChunkCandidate { chunk_items, size } in heap.into_iter() {
                total_size += size;
                make_chunk(chunk_items, &mut String::new(), &mut split_context).await?;
            }
            span.record("total_size", total_size);
        }

        Ok(())
    }
    .instrument(span_outer)
    .await
}

struct ChunkCandidate {
    size: usize,
    chunk_items: Vec<ChunkItemWithInfo>,
}

impl Ord for ChunkCandidate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.size.cmp(&other.size).reverse()
    }
}

impl PartialOrd for ChunkCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for ChunkCandidate {}

impl PartialEq for ChunkCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}
