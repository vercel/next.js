use std::{path::Path, sync::Arc};

use tokio::{runtime::Handle, sync::RwLock};
use turbo_rcstr::RcStr;
use turbo_tasks::{InvalidationReason, TurboTasksApi};

use crate::{DiskFileSystemInner, invalidator_map::InvalidatorMap, watcher::DiskWatcher};

/// The subset of [`DiskFileSystemInner`] that [`DiskWatcher`] needs in order to invalidate tasks
/// when the filesystem changes.
///
/// The watcher goes through this trait rather than through [`DiskFileSystemInner`] directly so that
/// it can be exercised in unit tests without building a whole
/// [`DiskFileSystem`][crate::DiskFileSystem], which can only be constructed from inside a
/// turbo-tasks task.
pub(crate) trait DiskFileSystemWatcherApi: Send + Sync + 'static {
    fn name(&self) -> &RcStr;
    fn root_path(&self) -> &Path;
    fn watcher(&self) -> &DiskWatcher
    where
        Self: Sized;
    fn turbo_tasks(&self) -> Option<Arc<dyn TurboTasksApi>>;
    fn tokio_handle(&self) -> &Handle;
    fn invalidator_map(&self) -> &InvalidatorMap;
    fn dir_invalidator_map(&self) -> &InvalidatorMap;
    fn invalidation_lock(&self) -> &RwLock<()>;
    fn invalidate_all(&self);
    fn invalidate_all_with_reason<R: InvalidationReason + Clone>(
        &self,
        reason: impl Fn(&Path) -> R + Sync,
    );
}

impl DiskFileSystemWatcherApi for DiskFileSystemInner {
    fn name(&self) -> &RcStr {
        &self.name
    }

    fn root_path(&self) -> &Path {
        self.root_path()
    }

    fn watcher(&self) -> &DiskWatcher {
        &self.watcher
    }

    fn turbo_tasks(&self) -> Option<Arc<dyn TurboTasksApi>> {
        self.turbo_tasks.upgrade()
    }

    fn tokio_handle(&self) -> &Handle {
        &self.tokio_handle
    }

    fn invalidator_map(&self) -> &InvalidatorMap {
        &self.invalidator_map
    }

    fn dir_invalidator_map(&self) -> &InvalidatorMap {
        &self.dir_invalidator_map
    }

    fn invalidation_lock(&self) -> &RwLock<()> {
        &self.invalidation_lock
    }

    fn invalidate_all(&self) {
        self.invalidate();
    }

    fn invalidate_all_with_reason<R: InvalidationReason + Clone>(
        &self,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        self.invalidate_with_reason(reason);
    }
}
