use std::{
    ops::Bound,
    path::{Path, PathBuf},
};

use turbo_frozenmap::FrozenMap;
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
    roots: FrozenMap<PathBuf, ResolvedVc<DiskFileSystem>>,
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
        let filesystems = FrozenMap::from_iter(iter);
        for pair in filesystems.as_slice().windows(2) {
            let (previous_root, _) = &pair[0];
            let (root, _) = &pair[1];
            assert!(
                !root.starts_with(previous_root),
                "filesystem root {} overlaps another filesystem root",
                root.display()
            );
        }
        DiskFileSystemMap {
            roots: filesystems,
            canonicalized_paths: Default::default(),
        }
    }
}

impl DiskFileSystemMap {
    pub(crate) fn contains(&self, root: &Path, current: ResolvedVc<DiskFileSystem>) -> bool {
        self.roots.get(root).is_some_and(|fs| *fs == current)
    }

    pub fn len(&self) -> usize {
        self.roots.len()
    }

    pub fn is_empty(&self) -> bool {
        self.roots.is_empty()
    }

    /// Finds the containing root; the suffix is empty only when `path` is that root.
    pub(crate) fn lookup_sys_path_suffix<'a>(
        &self,
        path: &'a Path,
    ) -> Option<LookupSysPathSuffix<'a>> {
        let (root, fs) = self
            .roots
            .range::<Path, _>((Bound::Unbounded, Bound::Included(path)))
            .next_back()?;
        Some(LookupSysPathSuffix {
            fs: *fs,
            remaining: path.strip_prefix(root).ok()?,
        })
    }

    /// Converts an absolute system path into a path owned by one of the installed filesystems.
    ///
    /// Returns `None` if the file path does not exist inside any other root, or if the relative
    /// path would not be valid unicode.
    pub fn lookup_fs_path(&self, path: &Path) -> Option<FileSystemPath> {
        let LookupSysPathSuffix {
            fs,
            remaining: relative,
        } = self.lookup_sys_path_suffix(path)?;
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
                roots: FrozenMap::new(),
                canonicalized_paths: Default::default(),
            }
            .cell()
        }
        operation()
    }
}

pub struct LookupSysPathSuffix<'a> {
    pub fs: ResolvedVc<DiskFileSystem>,
    pub remaining: &'a Path,
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
            assert_eq!(map.len(), 1);
            assert!(map.contains(Path::new("/tmp/root"), fs));
            assert_eq!(
                map.lookup_fs_path(Path::new("/tmp/root/file"))
                    .unwrap()
                    .path,
                "file"
            );
            assert!(
                map.lookup_fs_path(Path::new("/tmp/root-other/file"))
                    .is_none()
            );
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
