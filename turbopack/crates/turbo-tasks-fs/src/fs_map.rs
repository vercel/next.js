use std::{
    collections::BTreeMap,
    ops::Bound,
    path::{Path, PathBuf},
};

use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};
use turbo_unix_path::sys_to_unix;

use crate::{DiskFileSystem, FileSystemPath, canonicalized_path_cache::CanonicalizedPathWalkCache};

/// An ordered set of canonical system roots and their owning filesystems.
///
/// The roots must not overlap: no root may be an ancestor of another root. [`Self::lookup`]
/// relies on this invariant when selecting the nearest preceding root in path order.
#[turbo_tasks::value(shared, eq = "manual")]
pub struct DiskFileSystemMap {
    roots: BTreeMap<PathBuf, ResolvedVc<DiskFileSystem>>,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub(crate) canonicalized_paths: CanonicalizedPathWalkCache,
}

impl PartialEq for DiskFileSystemMap {
    fn eq(&self, other: &Self) -> bool {
        self.roots == other.roots
    }
}

impl Eq for DiskFileSystemMap {}

impl FromIterator<(PathBuf, ResolvedVc<DiskFileSystem>)> for DiskFileSystemMap {
    fn from_iter<T: IntoIterator<Item = (PathBuf, ResolvedVc<DiskFileSystem>)>>(iter: T) -> Self {
        let filesystems = BTreeMap::from_iter(iter);
        let mut map = DiskFileSystemMap {
            roots: BTreeMap::new(),
            canonicalized_paths: Default::default(),
        };
        for (root, fs) in filesystems {
            assert!(
                map.lookup(&root).is_none(),
                "filesystem root {} overlaps another filesystem root",
                root.display()
            );
            map.roots.insert(root, fs);
        }
        map
    }
}

impl DiskFileSystemMap {
    pub fn has_file_system_other_than(&self, current: ResolvedVc<DiskFileSystem>) -> bool {
        self.roots
            .values()
            .any(|file_system| *file_system != current)
    }

    /// Finds the containing root; the suffix is empty only when `path` is that root.
    pub(crate) fn lookup_root_prefix<'a>(
        &self,
        path: &'a Path,
    ) -> Option<(&'a Path, ResolvedVc<DiskFileSystem>)> {
        let (root, fs) = self.roots.upper_bound(Bound::Included(path)).peek_prev()?;
        Some((path.strip_prefix(root).ok()?, *fs))
    }

    /// Converts an absolute system path into a path owned by one of the installed filesystems.
    ///
    /// Returns `None` if the file path does not exist inside any other root, or if the relative
    /// path would not be valid unicode.
    pub fn lookup(&self, path: &Path) -> Option<FileSystemPath> {
        let (relative, fs) = self.lookup_root_prefix(path)?;
        let relative = relative.to_str()?;
        Some(FileSystemPath::new_normalized_unchecked(
            ResolvedVc::upcast(fs),
            RcStr::from(sys_to_unix(relative)),
        ))
    }

    /// Creates a new empty `DiskFileSystemMap`, used when constructing a [`DiskFileSystem`] that
    /// cannot traverse to any other roots outside of itself.
    pub fn empty() -> OperationVc<DiskFileSystemMap> {
        #[turbo_tasks::function(operation)]
        pub fn operation() -> Vc<DiskFileSystemMap> {
            DiskFileSystemMap {
                roots: BTreeMap::new(),
                canonicalized_paths: Default::default(),
            }
            .cell()
        }
        operation()
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    #[tokio::test]
    async fn component_safe_lookup() {
        #[turbo_tasks::function(operation, root)]
        async fn assert_component_safe_lookup() -> anyhow::Result<()> {
            let fs = DiskFileSystem::new(rcstr!("root"), Vc::cell(rcstr!("/tmp/root")))
                .to_resolved()
                .await?;
            let map: DiskFileSystemMap = [(PathBuf::from("/tmp/root"), fs)].into_iter().collect();
            assert!(!map.has_file_system_other_than(fs));
            assert_eq!(
                map.lookup(Path::new("/tmp/root/file")).unwrap().path,
                "file"
            );
            assert!(map.lookup(Path::new("/tmp/root-other/file")).is_none());
            Ok(())
        }

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            assert_component_safe_lookup()
                .read_strongly_consistent()
                .await
        })
        .await
        .unwrap();
    }
}
