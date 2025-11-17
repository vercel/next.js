use std::{
    collections::{BTreeMap, BTreeSet, btree_map, btree_set},
    ops::Bound,
    path::{Path, PathBuf},
};

/// A thin wrapper around [`BTreeMap<PathBuf, V>`] that provides efficient extraction of child
/// paths.
///
/// In the future, this may use a more efficient representation, like a radix tree or trie.
pub trait OrderedPathMapExt<V> {
    fn extract_path_with_children<'a>(
        &'a mut self,
        path: &'a Path,
    ) -> PathMapExtractPathWithChildren<'a, V>;
}

impl<V> OrderedPathMapExt<V> for BTreeMap<PathBuf, V> {
    /// Iterates over and removes `path` and all of its children.
    fn extract_path_with_children<'a>(
        &'a mut self,
        path: &'a Path,
    ) -> PathMapExtractPathWithChildren<'a, V> {
        PathMapExtractPathWithChildren {
            cursor: self.lower_bound_mut(Bound::Included(path)),
            parent_path: path,
        }
    }
}

pub struct PathMapExtractPathWithChildren<'a, V> {
    cursor: btree_map::CursorMut<'a, PathBuf, V>,
    parent_path: &'a Path,
}

impl<V> Iterator for PathMapExtractPathWithChildren<'_, V> {
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

/// A thin wrapper around [`BTreeSet<PathBuf>`] that provides efficient iteration of child paths.
///
/// In the future, this may use a more efficient representation, like a radix tree or trie.
pub trait OrderedPathSetExt {
    /// Iterates over the children of `path`, excluding `path` itself.
    fn iter_path_children<'a>(&'a mut self, path: &'a Path) -> PathSetIterPathChildren<'a>;
}

impl OrderedPathSetExt for BTreeSet<PathBuf> {
    fn iter_path_children<'a>(&'a mut self, path: &'a Path) -> PathSetIterPathChildren<'a> {
        PathSetIterPathChildren {
            // this is range written weirdly due to type inference limitations:
            // https://stackoverflow.com/a/66130898
            range: self.range::<Path, _>((Bound::Excluded(path), Bound::Unbounded)),
            parent_path: path,
        }
    }
}

pub struct PathSetIterPathChildren<'a> {
    // we don't need the nightly cursors API for this, the `Range` type is sufficient.
    range: btree_set::Range<'a, PathBuf>,
    parent_path: &'a Path,
}

impl<'a> Iterator for PathSetIterPathChildren<'a> {
    type Item = &'a Path;

    fn next(&mut self) -> Option<Self::Item> {
        // this simple implementation works because `Path` implements `Ord` (and `starts_with`)
        // using path component comparision, rather than raw byte comparisions. The parent path is
        // always guaranteed to be placed immediately before its children (pre-order traversal).
        let current_path = self.range.next()?;
        if !current_path.starts_with(self.parent_path) {
            return None;
        }
        Some(&**current_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_extract_path_with_children() {
        let mut map = BTreeMap::default();
        map.insert(PathBuf::from("a"), 1);
        map.insert(PathBuf::from("a/b"), 2);
        map.insert(PathBuf::from("a/b/c"), 3);
        map.insert(PathBuf::from("a/b/d"), 4);
        map.insert(PathBuf::from("a/b/d/e"), 5);
        map.insert(PathBuf::from("a/c"), 6);
        map.insert(PathBuf::from("x/y/z"), 7);
        map.insert(PathBuf::from("z/a/b"), 8);

        let parent_path = PathBuf::from("a/b");
        let extracted: Vec<_> = map.extract_path_with_children(&parent_path).collect();

        let expected_extracted = vec![
            (PathBuf::from("a/b"), 2),
            (PathBuf::from("a/b/c"), 3),
            (PathBuf::from("a/b/d"), 4),
            (PathBuf::from("a/b/d/e"), 5),
        ];
        assert_eq!(extracted, expected_extracted);

        let mut expected_remaining = BTreeMap::new();
        expected_remaining.insert(PathBuf::from("a"), 1);
        expected_remaining.insert(PathBuf::from("a/c"), 6);
        expected_remaining.insert(PathBuf::from("x/y/z"), 7);
        expected_remaining.insert(PathBuf::from("z/a/b"), 8);

        assert_eq!(map, expected_remaining);
    }

    #[test]
    fn test_set_iter_path_children() {
        let mut set = BTreeSet::default();
        set.insert(PathBuf::from("a"));
        set.insert(PathBuf::from("a/b"));
        set.insert(PathBuf::from("a/b/c"));
        set.insert(PathBuf::from("a/b/d"));
        set.insert(PathBuf::from("a/b/d/e"));
        set.insert(PathBuf::from("a/c"));
        set.insert(PathBuf::from("x/y/z"));
        set.insert(PathBuf::from("z/a/b"));

        let parent_path = PathBuf::from("a/b");
        let iterated: Vec<_> = set.iter_path_children(&parent_path).collect();

        let expected_iterated = vec![
            PathBuf::from("a/b/c"),
            PathBuf::from("a/b/d"),
            PathBuf::from("a/b/d/e"),
        ];
        assert_eq!(iterated, expected_iterated);
    }
}
