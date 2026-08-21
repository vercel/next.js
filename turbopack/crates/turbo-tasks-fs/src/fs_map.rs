use std::{
    collections::BTreeMap,
    ops::Bound,
    path::{Path, PathBuf},
};

use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};
use turbo_unix_path::sys_to_unix;

use crate::{DiskFileSystem, FileSystemPath};

/// An ordered set of canonical system roots and their owning filesystems.
#[turbo_tasks::value(shared)]
pub struct DiskFileSystemMap(pub BTreeMap<PathBuf, ResolvedVc<DiskFileSystem>>);

impl DiskFileSystemMap {
    /// Converts an absolute system path into a path owned by one of the installed filesystems.
    ///
    /// Returns `None` if the file path does not exist inside any other root, or if the relative
    /// path would not be valid unicode.
    pub fn lookup(&self, path: &Path) -> Option<FileSystemPath> {
        let (root, fs) = self.0.upper_bound(Bound::Included(path)).peek_prev()?;
        let relative = path.strip_prefix(root).ok()?.to_str()?;
        Some(FileSystemPath::new_normalized_unchecked(
            ResolvedVc::upcast(*fs),
            RcStr::from(sys_to_unix(relative)),
        ))
    }

    /// Creates a new empty `DiskFileSystemMap`, used when constructing a [`DiskFileSystem`] that
    /// cannot traverse to any other roots outside of itself.
    pub fn empty() -> OperationVc<DiskFileSystemMap> {
        #[turbo_tasks::function(operation)]
        pub fn operation() -> Vc<DiskFileSystemMap> {
            DiskFileSystemMap(BTreeMap::new()).cell()
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
            let map = DiskFileSystemMap(BTreeMap::from([(PathBuf::from("/tmp/root"), fs)]));
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
