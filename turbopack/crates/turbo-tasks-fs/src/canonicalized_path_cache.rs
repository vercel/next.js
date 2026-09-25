use std::{
    collections::BTreeMap,
    fs::canonicalize,
    ops::{Bound, ControlFlow},
    path::{Path, PathBuf},
    sync::Arc,
};

use parking_lot::RwLock;
use smallvec::SmallVec;
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_unix_path::{normalize_path, sys_to_unix};

use crate::{DiskFileSystem, FileSystemPath, retry::retry_blocking};

/// Cached canonicalization information about paths outside of the project root for the sake
/// of converting absolute paths into root-relative ones. These canonicalization operations are
/// potentially expensive, hence why we cache them.
///
/// These paths are unwatched (we only watch inside of roots), but we do not persist them, so if
/// there is stale data here, restarting the process will resolve the issue.
#[derive(Default)]
pub(crate) struct CanonicalizedPathWalkCache(RwLock<BTreeMap<PathBuf, CheckedPrefix>>);

enum CheckedPrefix {
    /// The prefix is non-UTF-8, canonicalization failed or produced a non-UTF-8 path, or `visit`
    /// rejected the canonical path.
    Invalid,
    /// The canonical path is outside the tracked roots; use it to check the next prefix.
    Unmatched(Arc<PathBuf>),
    /// The prefix reached a tracked root; append the untouched suffix in that filesystem.
    Matched(ResolvedVc<DiskFileSystem>),
}

fn strip_longest_prefix<'a, 'p, T>(
    prefixes: &'a BTreeMap<PathBuf, T>,
    path: &'p Path,
) -> Option<(&'p Path, &'a T)> {
    let mut upper = path;
    loop {
        let (prefix, value) = prefixes.upper_bound(Bound::Included(upper)).peek_prev()?;
        if let Ok(rest) = path.strip_prefix(prefix) {
            return Some((rest, value));
        }
        // Find the longest common ancestor before doing another lookup in the map
        upper = prefix
            .ancestors()
            .find(|ancestor| path.starts_with(ancestor))?;
    }
}

impl CanonicalizedPathWalkCache {
    /// Performs untracked canonicalization on successive prefixes of `target_sys_path`, from the
    /// system root toward the full path. Passes each canonical prefix to `visit`, until `visit`
    /// finds a filesystem root.
    ///
    /// This is different than canonicalizing the full path because we want to avoid untracked
    /// canonicalization inside of the watched filesystem root. We only want to canonicalize and
    /// cache paths leading up to the root. This can be useful when translating an absolute system
    /// path to a filesystem-relative path if cheaper lexical prefix-stripping has failed.
    ///
    /// This operation is cached, so it starts looking from the longest known canonicalized prefix.
    ///
    /// The result of `visit` is cached for each prefix, so every call on this cache must use a
    /// visitor with the same behavior for a given canonical path.
    ///
    /// This is a helper for [`DiskFileSystem::resolve_path_ancestry_slow_path`] and
    /// [`DiskFileSystem::lookup_in_file_system_map`].
    pub(crate) async fn walk_canonicalized_ancestry(
        &self,
        target: &Path,
        visit: impl Fn(&Path) -> ControlFlow<Option<ResolvedVc<DiskFileSystem>>>,
    ) -> Option<FileSystemPath> {
        let unmatched_checkpoint = {
            let cache = self.0.read();
            match strip_longest_prefix(&cache, target) {
                Some((_, CheckedPrefix::Invalid)) => return None,
                Some((rest, CheckedPrefix::Matched(found))) => {
                    return path_from_root(*found, rest);
                }
                Some((rest, CheckedPrefix::Unmatched(canonical))) => {
                    Some((rest.ancestors().count() - 1, canonical.clone()))
                }
                None => None,
            }
        };

        let ancestors: SmallVec<[&Path; 8]> = target.ancestors().collect();
        let (remaining, mut canonical_parent) =
            if let Some((remaining, canonical)) = unmatched_checkpoint {
                (remaining, Some(canonical))
            } else {
                (ancestors.len() - 1, None)
            };

        for prefix in ancestors[..remaining].iter().rev() {
            let canonical = if prefix.to_str().is_some() {
                let path = if let Some(parent) = &canonical_parent {
                    let suffix = prefix
                        .strip_prefix(prefix.parent().expect("prefix has a parent"))
                        .expect("parent is an ancestor");
                    parent.join(suffix)
                } else {
                    prefix.to_path_buf()
                };
                retry_blocking(|| canonicalize(&path))
                    .await
                    .ok()
                    .filter(|path| path.to_str().is_some())
                    .map(Arc::new)
            } else {
                None
            };
            let Some(canonical) = canonical else {
                self.0
                    .write()
                    .insert(prefix.to_path_buf(), CheckedPrefix::Invalid);
                return None;
            };

            let mut cache = self.0.write();
            match visit(canonical.as_path()) {
                ControlFlow::Continue(()) => {
                    // `visit` has found a partial match
                    cache.insert(
                        prefix.to_path_buf(),
                        CheckedPrefix::Unmatched(canonical.clone()),
                    );
                    canonical_parent = Some(canonical);
                }
                ControlFlow::Break(Some(found)) => {
                    // `visit` has found an exact match for a filesystem root
                    cache.insert(prefix.to_path_buf(), CheckedPrefix::Matched(found));
                    let rest = target.strip_prefix(prefix).expect("prefix is an ancestor");
                    return path_from_root(found, rest);
                }
                // `visit` has found a path it considers invalid (e.g. the canonicalization read
                // gave us a path inside of the root)
                ControlFlow::Break(None) => {
                    cache.insert(prefix.to_path_buf(), CheckedPrefix::Invalid);
                    return None;
                }
            }
        }
        None
    }
}

fn path_from_root(root: ResolvedVc<DiskFileSystem>, rest: &Path) -> Option<FileSystemPath> {
    let rest = rest.to_str()?;
    // The walk preserves the original path until it finds a root: removing `link/..` earlier
    // could skip a symlink and select a different root. Normalize only the suffix here, without
    // reading paths inside the watched root.
    let path = if rest.is_empty() {
        RcStr::default()
    } else {
        RcStr::from(normalize_path(&sys_to_unix(rest))?)
    };
    Some(FileSystemPath::new_normalized_unchecked(
        ResolvedVc::upcast(root),
        path,
    ))
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    #[tokio::test]
    async fn walk_caches_invalid_prefix() {
        let cache = CanonicalizedPathWalkCache::default();
        let target = canonicalize(".").unwrap();
        let calls = Cell::new(0);
        let visit = |_: &Path| {
            calls.set(calls.get() + 1);
            ControlFlow::Break(None)
        };

        assert!(
            cache
                .walk_canonicalized_ancestry(&target, &visit)
                .await
                .is_none()
        );
        assert_eq!(calls.get(), 1);
        assert!(
            cache
                .walk_canonicalized_ancestry(&target, &visit)
                .await
                .is_none()
        );
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn strip_longest_prefix_matches_path_ancestors() {
        #[cfg(unix)]
        let paths = ["/a/b/c", "/a/../b", "/a//b", "/a/./b"];
        #[cfg(windows)]
        let paths = [r"C:\a\b", r"\\?\C:\a\b", r"\\server\share\a\b", r"C:/a/b"];

        for path in paths {
            let path = Path::new(path);
            for prefix in path.ancestors() {
                let prefixes = BTreeMap::from([(prefix.to_path_buf(), ())]);
                let (rest, _) = strip_longest_prefix(&prefixes, path).unwrap();
                assert_eq!(rest, path.strip_prefix(prefix).unwrap());
                assert_eq!(
                    rest.ancestors().count() - 1,
                    path.ancestors()
                        .position(|ancestor| ancestor == prefix)
                        .unwrap()
                );
            }
        }

        let mut prefixes = BTreeMap::from([
            (PathBuf::from("/a/b"), ()),
            (PathBuf::from("/a/b/earlier-sibling"), ()),
            (PathBuf::from("/a/bc/sibling"), ()),
        ]);
        assert_eq!(
            strip_longest_prefix(&prefixes, Path::new("/a/b/later-sibling")).map(|(rest, _)| rest),
            Some(Path::new("later-sibling"))
        );
        assert!(strip_longest_prefix(&prefixes, Path::new("/a/bc/file")).is_none());

        prefixes.insert(PathBuf::from("/a"), ());
        prefixes.insert(PathBuf::from("/a/bc/earlier-sibling"), ());
        assert_eq!(
            strip_longest_prefix(&prefixes, Path::new("/a/bc/later-sibling")).map(|(rest, _)| rest),
            Some(Path::new("bc/later-sibling"))
        );
    }
}
