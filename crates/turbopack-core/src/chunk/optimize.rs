//! Traits and functions to optimize a list of chunks.
//!
//! Usually chunks are optimized by limiting their total count, restricting
//! their size and eliminating duplicates between them.

use anyhow::Result;
use turbo_tasks_fs::FileSystemPathOptionVc;

use crate::chunk::containment_tree::ContainmentTree;

pub async fn optimize_by_common_parent<T, Acc>(
    chunks: &[T],
    get_common_parent: impl Fn(T) -> FileSystemPathOptionVc,
    optimize: impl Fn(Option<Vec<T>>, Vec<Acc>) -> Acc,
) -> Result<Acc>
where
    T: Clone,
{
    let tree = ContainmentTree::build(
        chunks
            .iter()
            .map(|chunk| (get_common_parent(chunk.clone()), chunk.clone())),
    )
    .await?;

    fn optimize_tree<T, Acc>(
        tree: ContainmentTree<T>,
        optimize: &impl Fn(Option<Vec<T>>, Vec<Acc>) -> Acc,
    ) -> Acc {
        let children = tree
            .children
            .into_iter()
            .map(|tree| optimize_tree(tree, optimize))
            .collect::<Vec<_>>();
        optimize(tree.chunks, children)
    }

    Ok(optimize_tree(tree, &optimize))
}
