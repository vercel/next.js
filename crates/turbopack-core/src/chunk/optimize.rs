use std::{cell::RefCell, mem::take, rc::Rc};

use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::{FileSystemPathOptionVc, FileSystemPathVc};

use super::{ChunkGroupVc, ChunkVc, ChunksVc};

#[turbo_tasks::value_trait]
pub trait ChunkOptimizer {
    fn optimize(&self, chunks: ChunksVc, chunk_group: ChunkGroupVc) -> ChunksVc;
}

#[turbo_tasks::value_trait]
pub trait OptimizableChunk {
    fn get_optimizer(&self) -> ChunkOptimizerVc;
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash)]
struct OptimizerKey(Option<ChunkOptimizerVc>);

#[turbo_tasks::function]
pub async fn optimize(chunks: ChunksVc, chunk_group: ChunkGroupVc) -> Result<ChunksVc> {
    let chunks = chunks.await?;
    let mut by_optimizer = IndexMap::<_, Vec<_>>::new();
    for (chunk, optimizer) in chunks
        .iter()
        .map(|chunk| async move {
            Ok((
                chunk,
                if let Some(optimizable) = OptimizableChunkVc::resolve_from(chunk).await? {
                    Some(optimizable.get_optimizer().resolve().await?)
                } else {
                    None
                },
            ))
        })
        .try_join()
        .await?
    {
        by_optimizer.entry(optimizer).or_default().push(*chunk);
    }

    let optimized_chunks = by_optimizer
        .into_iter()
        .map(|(optimizer, chunks)| async move {
            let chunks = ChunksVc::keyed_cell(OptimizerKey(optimizer), chunks);
            Ok(if let Some(optimizer) = optimizer {
                optimizer.optimize(chunks, chunk_group).await?
            } else {
                chunks.await?
            })
        })
        .try_join()
        .await?;
    let optimized_chunks = optimized_chunks
        .iter()
        .flat_map(|c| c.iter().copied())
        .collect();
    Ok(ChunksVc::cell(optimized_chunks))
}

#[derive(Default)]
pub struct ContainmentTree {
    pub path: Option<FileSystemPathVc>,
    pub chunks: Option<ChunksVc>,
    pub children: Vec<ContainmentTree>,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash)]
struct ChunksKey(FileSystemPathVc);

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash)]
struct OrphanChunkKey(ChunkVc);

impl ContainmentTree {
    async fn build(
        chunks: impl Iterator<Item = (FileSystemPathOptionVc, ChunkVc)>,
    ) -> Result<ContainmentTree> {
        async fn resolve(
            chunks: impl Iterator<Item = (FileSystemPathOptionVc, ChunkVc)>,
        ) -> Result<Vec<(Option<FileSystemPathVc>, ChunkVc)>> {
            chunks
                .map(|(common_parent, chunk)| async move {
                    let common_parent = if let Some(common_parent) = *common_parent.await? {
                        Some(common_parent.resolve().await?)
                    } else {
                        None
                    };
                    Ok((common_parent, chunk))
                })
                .try_join()
                .await
        }

        async fn compute_relationships(
            common_parents: &IndexSet<FileSystemPathVc>,
        ) -> Result<Vec<(Option<FileSystemPathVc>, FileSystemPathVc)>> {
            common_parents
                .iter()
                .map(|&key| {
                    let common_parents = &common_parents;
                    async move {
                        let mut current = key;
                        loop {
                            let parent = current.parent().resolve().await?;
                            if parent == current {
                                return Ok((None, key));
                            }
                            if common_parents.contains(&parent) {
                                // Can't insert here into the parent tree, since we want the order
                                // of children to be deterministic
                                return Ok((Some(parent), key));
                            }
                            current = parent;
                        }
                    }
                })
                .try_join()
                .await
        }

        // Temp structure which uses Rc and RefCell
        struct Node {
            path: FileSystemPathVc,
            chunks: Vec<ChunkVc>,
            children: Vec<Rc<RefCell<Node>>>,
        }

        async fn build_node_tree(
            chunks: Vec<(Option<FileSystemPathVc>, ChunkVc)>,
        ) -> Result<(IndexMap<FileSystemPathVc, Rc<RefCell<Node>>>, Vec<ChunkVc>)> {
            let mut orphan_chunks = Vec::new();
            let mut trees = IndexMap::<FileSystemPathVc, Rc<RefCell<Node>>>::new();
            for (common_parent, chunk) in chunks {
                if let Some(common_parent) = common_parent {
                    trees
                        .entry(common_parent)
                        .or_insert_with(|| {
                            Rc::new(RefCell::new(Node {
                                path: common_parent,
                                chunks: Vec::new(),
                                children: Vec::new(),
                            }))
                        })
                        .borrow_mut()
                        .chunks
                        .push(chunk);
                } else {
                    orphan_chunks.push(chunk);
                }
            }
            Ok((trees, orphan_chunks))
        }

        fn treeify(
            relationships: Vec<(Option<FileSystemPathVc>, FileSystemPathVc)>,
            trees: &mut IndexMap<FileSystemPathVc, Rc<RefCell<Node>>>,
        ) -> Vec<Rc<RefCell<Node>>> {
            relationships
                .into_iter()
                .flat_map(|(parent, key)| {
                    let tree = trees.get(&key).unwrap().clone();
                    if let Some(parent) = parent {
                        trees.get(&parent).unwrap().borrow_mut().children.push(tree);
                        None
                    } else {
                        Some(tree)
                    }
                })
                .collect::<Vec<_>>()
        }

        // Convert function to the real data structure
        fn node_to_common_parent_tree(node: Rc<RefCell<Node>>) -> ContainmentTree {
            let mut node = node.borrow_mut();
            let children = take(&mut node.children)
                .into_iter()
                .map(node_to_common_parent_tree)
                .collect();
            let chunks = Some(ChunksVc::keyed_cell(
                ChunksKey(node.path),
                take(&mut node.chunks),
            ));
            ContainmentTree {
                path: Some(node.path),
                chunks,
                children,
            }
        }

        fn convert_into_common_parent_tree(
            roots: Vec<Rc<RefCell<Node>>>,
            orphan_chunks: Vec<ChunkVc>,
        ) -> Vec<ContainmentTree> {
            roots
                .into_iter()
                .map(node_to_common_parent_tree)
                .chain(orphan_chunks.into_iter().map(|chunk| ContainmentTree {
                    path: None,
                    chunks: Some(ChunksVc::keyed_cell(OrphanChunkKey(chunk), vec![chunk])),
                    children: Vec::new(),
                }))
                .collect::<Vec<_>>()
        }

        // resolve all paths
        let chunks = resolve(chunks).await?;
        // compute all unique common_parents
        let common_parents = chunks
            .iter()
            .filter_map(|&(path, _)| path)
            .collect::<IndexSet<_>>();
        // compute parent -> child relationships between common_parents
        let relationships = compute_relationships(&common_parents).await?;

        // all the tree by common_parent
        let (mut trees, orphan_chunks) = build_node_tree(chunks).await?;

        // nest each tree by relationship, compute the roots
        let roots = treeify(relationships, &mut trees);

        // do conversion
        let roots = convert_into_common_parent_tree(roots, orphan_chunks);

        // top level nesting
        Ok(if roots.len() == 1 {
            roots.into_iter().next().unwrap()
        } else {
            ContainmentTree {
                path: None,
                chunks: None,
                children: roots,
            }
        })
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash)]
struct ChunksFlattenKey(Option<FileSystemPathVc>);

#[turbo_tasks::value(transparent)]
struct ListsOfChunks(Vec<ChunksVc>);

#[turbo_tasks::function]
async fn flatten_chunks(chunks: ListsOfChunksVc) -> Result<ChunksVc> {
    Ok(ChunksVc::cell(
        chunks
            .await?
            .iter()
            .copied()
            .try_join()
            .await?
            .iter()
            .flat_map(|c| c.iter().copied())
            .collect(),
    ))
}

pub async fn optimize_by_common_parent(
    chunks: ChunksVc,
    get_common_parent: impl Fn(ChunkVc) -> FileSystemPathOptionVc,
    optimize: impl Fn(Option<ChunksVc>, Option<ChunksVc>) -> ChunksVc,
) -> Result<ChunksVc> {
    let tree = ContainmentTree::build(
        chunks
            .await?
            .iter()
            .map(|&chunk| (get_common_parent(chunk), chunk)),
    )
    .await?;

    fn optimize_tree(
        tree: ContainmentTree,
        optimize: &impl Fn(Option<ChunksVc>, Option<ChunksVc>) -> ChunksVc,
    ) -> ChunksVc {
        let children = tree
            .children
            .into_iter()
            .map(|tree| optimize_tree(tree, optimize))
            .collect::<Vec<_>>();
        let children = if !children.is_empty() {
            let lists = ListsOfChunksVc::keyed_cell(ChunksFlattenKey(tree.path), children);
            Some(flatten_chunks(lists))
        } else {
            None
        };
        optimize(tree.chunks, children)
    }

    Ok(optimize_tree(tree, &optimize))
}
