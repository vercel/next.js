use std::{cell::RefCell, mem::take, rc::Rc};

use anyhow::Result;
use turbo_tasks::{FxIndexMap, FxIndexSet, TryJoinIterExt};

#[derive(Debug, Default, Clone, Eq, PartialEq)]
pub struct ContainmentTree<K, V> {
    pub key: Option<K>,
    pub values: Option<Vec<V>>,
    pub children: Vec<ContainmentTree<K, V>>,
}

// Temp structure which uses Rc and RefCell
struct Node<K, V> {
    key: K,
    values: Vec<V>,
    children: Vec<Rc<RefCell<Node<K, V>>>>,
}

#[async_trait::async_trait]
pub trait ContainmentTreeKey: Sized {
    async fn parent(&self) -> Result<Self>;
}

impl<K, V> ContainmentTree<K, V>
where
    K: ContainmentTreeKey + std::hash::Hash + Eq + Clone,
{
    pub async fn build<I>(values: I) -> Result<ContainmentTree<K, V>>
    where
        I: IntoIterator<Item = (Option<K>, V)>,
    {
        let values: Vec<_> = values.into_iter().collect();

        // compute all unique common_parents
        let mut common_parents = values
            .iter()
            .filter_map(|(key, _)| key.clone())
            .collect::<FxIndexSet<_>>();

        Self::expand_common_parents(&mut common_parents).await?;

        let relationships = Self::compute_relationships(&common_parents).await?;

        let mut trees = Self::create_node_tree(common_parents);

        let orphan_values = Self::add_values_to_tree(&mut trees, values);

        let roots = Self::treeify(relationships, &trees);

        // optimize tree by removing unnecessary nodes
        Self::skip_unnecessary_nodes(&mut trees);

        // do conversion
        let roots = Self::convert_into_common_parent_tree(roots, orphan_values);

        // top level nesting
        Ok(if roots.len() == 1 {
            roots.into_iter().next().unwrap()
        } else {
            ContainmentTree {
                key: None,
                values: None,
                children: roots,
            }
        })
    }

    /// Expand all common parents to include all their parents.
    async fn expand_common_parents(common_parents: &mut FxIndexSet<K>) -> Result<()> {
        // This is mutated while iterating, so we need to loop with index
        let mut i = 0;
        while i < common_parents.len() {
            let current = &common_parents[i];
            let parent = current.parent().await?;
            common_parents.insert(parent);
            i += 1;
        }
        Ok(())
    }

    /// Compute parent -> child relationships between common_parents.
    async fn compute_relationships(common_parents: &FxIndexSet<K>) -> Result<Vec<(Option<K>, K)>> {
        common_parents
            .iter()
            .map(|key| {
                let common_parents = &common_parents;
                async move {
                    let mut current = key.clone();
                    loop {
                        let parent = current.parent().await?;
                        if parent == current {
                            return Ok((None, key.clone()));
                        }
                        if common_parents.contains(&parent) {
                            // Can't insert here into the parent tree, since we want the order
                            // of children to be deterministic
                            return Ok((Some(parent), key.clone()));
                        }
                        current = parent;
                    }
                }
            })
            .try_join()
            .await
    }

    /// Create the tree nodes.
    fn create_node_tree(common_parents: FxIndexSet<K>) -> FxIndexMap<K, Rc<RefCell<Node<K, V>>>> {
        let mut trees = FxIndexMap::<K, Rc<RefCell<Node<K, V>>>>::default();
        for common_parent in common_parents {
            trees.insert(
                common_parent.clone(),
                Rc::new(RefCell::new(Node {
                    key: common_parent,
                    values: Vec::new(),
                    children: Vec::new(),
                })),
            );
        }
        trees
    }

    /// Add chunks to nodes.
    fn add_values_to_tree(
        trees: &mut FxIndexMap<K, Rc<RefCell<Node<K, V>>>>,
        values: Vec<(Option<K>, V)>,
    ) -> Vec<V> {
        let mut orphan_values = Vec::new();
        for (common_parent, chunk) in values {
            if let Some(common_parent) = common_parent {
                trees
                    .get_mut(&common_parent)
                    .unwrap()
                    .borrow_mut()
                    .values
                    .push(chunk);
            } else {
                orphan_values.push(chunk);
            }
        }
        orphan_values
    }

    /// Nest each tree by relationship, compute the roots
    fn treeify(
        relationships: Vec<(Option<K>, K)>,
        trees: &FxIndexMap<K, Rc<RefCell<Node<K, V>>>>,
    ) -> Vec<Rc<RefCell<Node<K, V>>>> {
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

    /// Optimize tree by removing unnecessary nodes.
    fn skip_unnecessary_nodes(trees: &mut FxIndexMap<K, Rc<RefCell<Node<K, V>>>>) {
        for tree in trees.values_mut() {
            let mut tree = tree.borrow_mut();
            if tree.values.is_empty() && tree.children.len() == 1 {
                let child = tree.children.pop().unwrap();
                let mut child = child.borrow_mut();
                tree.key = child.key.clone();
                tree.values.append(&mut child.values);
                tree.children.append(&mut child.children);
            }
        }
    }

    // Convert function to the real data structure
    fn node_to_common_parent_tree(node: Rc<RefCell<Node<K, V>>>) -> ContainmentTree<K, V> {
        let mut node = node.borrow_mut();
        let children = take(&mut node.children)
            .into_iter()
            .map(Self::node_to_common_parent_tree)
            .collect();
        // TODO keyed cell: this would benefit from keying the cell by node.path
        let values = Some(take(&mut node.values));
        ContainmentTree {
            key: Some(node.key.clone()),
            values,
            children,
        }
    }

    fn convert_into_common_parent_tree(
        roots: Vec<Rc<RefCell<Node<K, V>>>>,
        orphan_values: Vec<V>,
    ) -> Vec<ContainmentTree<K, V>> {
        roots
            .into_iter()
            .map(Self::node_to_common_parent_tree)
            .chain(orphan_values.into_iter().map(|value| ContainmentTree {
                key: None,
                values: Some(vec![value]),
                children: Vec::new(),
            }))
            .collect::<Vec<_>>()
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
    use async_trait::async_trait;

    use super::*;

    #[derive(Clone, Debug, PartialEq, Eq, Hash)]
    struct TestKey(u32, u32);

    #[async_trait]
    impl ContainmentTreeKey for TestKey {
        async fn parent(&self) -> Result<Self> {
            if self.1 == 0 {
                Ok(TestKey(self.0, 0))
            } else {
                Ok(TestKey(self.0, self.1 - 1))
            }
        }
    }

    #[tokio::test]
    async fn test_build_simple_input() -> Result<()> {
        let input = vec![
            (None, "value0"),
            (Some(TestKey(0, 0)), "value1"),
            (Some(TestKey(0, 1)), "value2"),
            (Some(TestKey(0, 2)), "value3"),
            (Some(TestKey(1, 2)), "value4"),
        ];

        let tree = ContainmentTree::<TestKey, &str>::build(input).await?;

        assert_eq!(
            tree,
            ContainmentTree {
                key: None,
                values: None,
                children: vec![
                    ContainmentTree {
                        key: Some(TestKey(0, 0)),
                        values: Some(vec!["value1"]),
                        children: vec![ContainmentTree {
                            key: Some(TestKey(0, 1)),
                            values: Some(vec!["value2"]),
                            children: vec![ContainmentTree {
                                key: Some(TestKey(0, 2)),
                                values: Some(vec!["value3"]),
                                children: vec![]
                            }]
                        }]
                    },
                    ContainmentTree {
                        key: Some(TestKey(1, 2)),
                        values: Some(vec!["value4"]),
                        children: vec![]
                    },
                    ContainmentTree {
                        key: None,
                        values: Some(vec!["value0"]),
                        children: vec![]
                    },
                ]
            }
        );

        Ok(())
    }
}
