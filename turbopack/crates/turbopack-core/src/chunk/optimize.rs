//! Traits and functions to optimize a list of chunks.
//!
//! Usually chunks are optimized by limiting their total count, restricting
//! their size and eliminating duplicates between them.

use anyhow::Result;
use turbo_tasks::{TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystemPath, FileSystemPathOption};

use crate::chunk::containment_tree::{ContainmentTree, ContainmentTreeKey};

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
struct FileSystemPathKey(FileSystemPath);

impl FileSystemPathKey {
    async fn new(path: FileSystemPath) -> Result<Self> {
        Ok(Self(path))
    }
}

#[async_trait::async_trait]
impl ContainmentTreeKey for FileSystemPathKey {
    async fn parent(&self) -> Result<Self> {
        Ok(FileSystemPathKey::new(self.0.parent()).await?)
    }
}

pub async fn optimize_by_common_parent<T, Acc, GetCommonParent, Optimize>(
    chunks: &[T],
    get_common_parent: GetCommonParent,
    optimize: Optimize,
) -> Result<Acc>
where
    T: Clone,
    GetCommonParent: Fn(T) -> Vc<FileSystemPathOption> + Clone,
    Optimize: Fn(Option<Vec<T>>, Vec<Acc>) -> Acc,
{
    let tree = ContainmentTree::build(
        chunks
            .iter()
            .map(move |chunk| {
                let get_common_parent = get_common_parent.clone();
                async move {
                    let common_parent = get_common_parent(chunk.clone()).await?;

                    Ok((
                        if let Some(common_parent) = &*common_parent {
                            Some(FileSystemPathKey::new(common_parent.clone()).await?)
                        } else {
                            None
                        },
                        chunk.clone(),
                    ))
                }
            })
            .try_join()
            .await?,
    )
    .await?;

    fn optimize_tree<K, V, Acc>(
        tree: ContainmentTree<K, V>,
        optimize: &impl Fn(Option<Vec<V>>, Vec<Acc>) -> Acc,
    ) -> Acc {
        let children = tree
            .children
            .into_iter()
            .map(|tree| optimize_tree(tree, optimize))
            .collect::<Vec<_>>();

        optimize(tree.values, children)
    }

    Ok(optimize_tree(tree, &optimize))
}
