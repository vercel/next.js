use std::{
    collections::{BTreeMap, btree_map::CursorMut},
    ops::Bound,
    path::{Path, PathBuf},
};

/// A thin wrapper around [`BTreeMap<PathBuf, V>`] that provides efficient extraction of child
/// paths.
///
/// In the future, this may use a more efficient representation, like a radix tree or trie.
pub trait OrderedPathMapExt<V> {
    fn extract_path_with_children<'a>(&'a mut self, path: &'a Path) -> ExtractWithChildren<'a, V>;
}

impl<V> OrderedPathMapExt<V> for BTreeMap<PathBuf, V> {
    fn extract_path_with_children<'a>(&'a mut self, path: &'a Path) -> ExtractWithChildren<'a, V> {
        ExtractWithChildren {
            cursor: self.lower_bound_mut(Bound::Included(path)),
            parent_path: path,
        }
    }
}

pub struct ExtractWithChildren<'a, V> {
    cursor: CursorMut<'a, PathBuf, V>,
    parent_path: &'a Path,
}

impl<V> Iterator for ExtractWithChildren<'_, V> {
    type Item = (PathBuf, V);

    fn next(&mut self) -> Option<Self::Item> {
        // this simple implementation works because `Path` implements `Ord` (and `starts_with`)
        // using path component comparision, rather than raw byte comparisions. The parent path is
        // always guaranteed to be placed immediately before its children (pre-order traversal).
        if self
            .cursor
            .peek_next()
            .is_none_or(|(k, _v)| !k.starts_with(self.parent_path))
        {
            return None;
        }
        self.cursor.remove_next()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_with_children() {
        let mut map = BTreeMap::default();
        map.insert(PathBuf::from("a"), 1);
        map.insert(PathBuf::from("a/b"), 2);
        map.insert(PathBuf::from("a/b/c"), 3);
        map.insert(PathBuf::from("a/b/d"), 4);
        map.insert(PathBuf::from("a/c"), 5);
        map.insert(PathBuf::from("x/y/z"), 6);
        map.insert(PathBuf::from("z/a/b"), 7);

        let parent_path = PathBuf::from("a/b");
        let extracted: Vec<_> = map.extract_path_with_children(&parent_path).collect();

        let expected_extracted = vec![
            (PathBuf::from("a/b"), 2),
            (PathBuf::from("a/b/c"), 3),
            (PathBuf::from("a/b/d"), 4),
        ];
        assert_eq!(extracted, expected_extracted);

        let mut expected_remaining = BTreeMap::new();
        expected_remaining.insert(PathBuf::from("a"), 1);
        expected_remaining.insert(PathBuf::from("a/c"), 5);
        expected_remaining.insert(PathBuf::from("x/y/z"), 6);
        expected_remaining.insert(PathBuf::from("z/a/b"), 7);

        assert_eq!(map, expected_remaining);
    }
}
