use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, RefData},
};

#[turbo_tasks::value(transparent, cell = "keyed")]
#[allow(clippy::type_complexity)]
pub struct CollectedModules(FxHashMap<RcStr, Vec<(ResolvedVc<Box<dyn Module>>, RcStr)>>);

#[tracing::instrument(level = "info", name = "compute emit-collect", skip_all)]
pub async fn collect(module_graph: Vc<ModuleGraph>) -> Result<Vc<CollectedModules>> {
    let module_graph = module_graph.await?;

    let graphs = &module_graph.graphs;

    // Use all entries from all graphs
    let entries = graphs
        .iter()
        .flat_map(|g| g.entries.iter())
        .flat_map(|g| g.entries())
        .collect::<Vec<_>>();

    let mut edges = vec![];

    let mut references: FxHashMap<RcStr, Vec<_>> = FxHashMap::default();
    module_graph.traverse_edges_bfs(entries.iter().copied(), |parent, node| {
        let Some((parent, RefData { chunking_type, .. })) = parent else {
            return Ok(GraphTraversalAction::Continue);
        };

        edges.push((parent, chunking_type.clone(), node));

        if let ChunkingType::Isolated {
            merge_tag: Some(merge_tag),
            ..
        } = chunking_type
        {
            references
                // TODO don't clone
                .entry(merge_tag.clone())
                .or_default()
                // TODO actual data
                .push((node, rcstr!("TODO DATA")));
        }

        Ok(GraphTraversalAction::Continue)
    })?;

    // println!(
    //     "{:#?}",
    //     edges
    //         .into_iter()
    //         .map(async |(parent, chunking_type, node)| {
    //             Ok((
    //                 parent.ident_string().await?,
    //                 chunking_type.clone(),
    //                 node.ident_string().await?,
    //             ))
    //         })
    //         .try_join()
    //         .await?
    // );

    Ok(CollectedModules(references).cell())
}
