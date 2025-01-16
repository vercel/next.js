use std::hash::BuildHasherDefault;

use anyhow::{bail, Result};
use rustc_hash::FxHasher;
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};

use crate::{
    chunk::chunking::{make_chunk, ChunkItemWithInfo, SplitContext},
    module::Module,
    module_graph::ModuleGraph,
};

pub async fn make_production_chunks(
    chunk_items: Vec<ChunkItemWithInfo>,
    module_graph: Vc<ModuleGraph>,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
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

    for (prehashed_chunk_groups, chunk_items) in grouped_chunk_items {
        let (hash, _) = prehashed_chunk_groups.into_parts();
        let mut key = format!("{:016x}", hash);

        make_chunk(chunk_items, &mut key, &mut split_context).await?;
    }

    Ok(())
}
