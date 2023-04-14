use std::{cell::RefCell, mem::take, rc::Rc};

use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::{FileSystemPathOptionVc, FileSystemPathVc};

#[derive(Default)]
pub struct ContainmentTree<T> {
    pub path: Option<FileSystemPathVc>,
    pub chunks: Option<Vec<T>>,
    pub children: Vec<ContainmentTree<T>>,
}

impl<T> ContainmentTree<T> {
    pub async fn build(
        chunks: impl Iterator<Item = (FileSystemPathOptionVc, T)>,
    ) -> Result<ContainmentTree<T>> {
        async fn resolve<T>(
            chunks: impl Iterator<Item = (FileSystemPathOptionVc, T)>,
        ) -> Result<Vec<(Option<FileSystemPathVc>, T)>> {
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

        async fn expand_common_parents(
            common_parents: &mut IndexSet<FileSystemPathVc>,
        ) -> Result<()> {
            // This is mutated while iterating, so we need to loop with index
            let mut i = 0;
            while i < common_parents.len() {
                let current = common_parents[i];
                let parent = current.parent().resolve().await?;
                common_parents.insert(parent);
                i += 1;
            }
            Ok(())
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
        struct Node<T> {
            path: FileSystemPathVc,
            chunks: Vec<T>,
            children: Vec<Rc<RefCell<Node<T>>>>,
        }

        fn create_node_tree<T>(
            common_parents: IndexSet<FileSystemPathVc>,
        ) -> IndexMap<FileSystemPathVc, Rc<RefCell<Node<T>>>> {
            let mut trees = IndexMap::<FileSystemPathVc, Rc<RefCell<Node<T>>>>::new();
            for common_parent in common_parents {
                trees.insert(
                    common_parent,
                    Rc::new(RefCell::new(Node {
                        path: common_parent,
                        chunks: Vec::new(),
                        children: Vec::new(),
                    })),
                );
            }
            trees
        }

        fn add_chunks_to_tree<T>(
            trees: &mut IndexMap<FileSystemPathVc, Rc<RefCell<Node<T>>>>,
            chunks: Vec<(Option<FileSystemPathVc>, T)>,
        ) -> Vec<T> {
            let mut orphan_chunks = Vec::new();
            for (common_parent, chunk) in chunks {
                if let Some(common_parent) = common_parent {
                    trees
                        .get_mut(&common_parent)
                        .unwrap()
                        .borrow_mut()
                        .chunks
                        .push(chunk);
                } else {
                    orphan_chunks.push(chunk);
                }
            }
            orphan_chunks
        }

        fn treeify<T>(
            relationships: Vec<(Option<FileSystemPathVc>, FileSystemPathVc)>,
            trees: &mut IndexMap<FileSystemPathVc, Rc<RefCell<Node<T>>>>,
        ) -> Vec<Rc<RefCell<Node<T>>>> {
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

        fn skip_unnessary_nodes<T>(trees: &mut IndexMap<FileSystemPathVc, Rc<RefCell<Node<T>>>>) {
            for tree in trees.values_mut() {
                let mut tree = tree.borrow_mut();
                if tree.chunks.is_empty() && tree.children.len() == 1 {
                    let child = tree.children.pop().unwrap();
                    let mut child = child.borrow_mut();
                    tree.path = child.path;
                    tree.chunks.append(&mut child.chunks);
                    tree.children.append(&mut child.children);
                }
            }
        }

        // Convert function to the real data structure
        fn node_to_common_parent_tree<T>(node: Rc<RefCell<Node<T>>>) -> ContainmentTree<T> {
            let mut node = node.borrow_mut();
            let children = take(&mut node.children)
                .into_iter()
                .map(node_to_common_parent_tree)
                .collect();
            // TODO keyed cell: this would benefit from keying the cell by node.path
            let chunks = Some(take(&mut node.chunks));
            ContainmentTree {
                path: Some(node.path),
                chunks,
                children,
            }
        }

        fn convert_into_common_parent_tree<T>(
            roots: Vec<Rc<RefCell<Node<T>>>>,
            orphan_chunks: Vec<T>,
        ) -> Vec<ContainmentTree<T>> {
            roots
                .into_iter()
                .map(node_to_common_parent_tree)
                .chain(orphan_chunks.into_iter().map(|chunk| ContainmentTree {
                    path: None,
                    chunks: Some(vec![chunk]),
                    children: Vec::new(),
                }))
                .collect::<Vec<_>>()
        }

        // resolve all paths
        let chunks = resolve(chunks).await?;
        // compute all unique common_parents
        let mut common_parents = chunks
            .iter()
            .filter_map(|&(path, _)| path)
            .collect::<IndexSet<_>>();
        // expand all common parents to include all their parents
        expand_common_parents(&mut common_parents).await?;
        // compute parent -> child relationships between common_parents
        let relationships = compute_relationships(&common_parents).await?;

        // create the tree nodes
        let mut trees = create_node_tree(common_parents);

        // add chunks to nodes
        let orphan_chunks = add_chunks_to_tree(&mut trees, chunks);

        // nest each tree by relationship, compute the roots
        let roots = treeify(relationships, &mut trees);

        // optimize tree by removing unnecessary nodes
        skip_unnessary_nodes(&mut trees);

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
