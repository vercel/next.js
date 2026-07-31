use std::{
    fs::{canonicalize, metadata},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
};

use rustc_hash::FxHashMap;
use tempfile::TempDir;
use tokio::{runtime::Handle, sync::RwLock};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    InvalidationReason, NonLocalValue, TransientInstance, TurboTasksApi,
    trace::{TraceRawVcs, TraceRawVcsContext},
};

use crate::{
    invalidator_map::InvalidatorMap,
    watcher::{DiskFileSystemWatcherApi, DiskWatcher, DiskWatcherConfig},
};

/// A stand-in for [`DiskFileSystemInner`], carrying only the state [`DiskWatcher`] touches.
pub struct MockFileSystem {
    pub name: RcStr,
    pub root_path: PathBuf,
    pub watcher: DiskWatcher,
    pub turbo_tasks: Weak<dyn TurboTasksApi>,
    pub tokio_handle: Handle,
    pub invalidator_map: InvalidatorMap,
    pub dir_invalidator_map: InvalidatorMap,
    pub invalidation_lock: RwLock<()>,
    pub run_counts: Mutex<FxHashMap<Arc<PathBuf>, u64>>,
    transient_handle: TransientInstance<MockFsHandle>,
    _temp_dir: TempDir,
}

struct MockFsHandle(Weak<MockFileSystem>);

unsafe impl NonLocalValue for MockFsHandle {}
impl TraceRawVcs for MockFsHandle {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
}

impl MockFileSystem {
    pub fn new(config: DiskWatcherConfig) -> Arc<MockFileSystem> {
        let temp_dir = TempDir::new().unwrap();
        let root_path = canonicalize(temp_dir.path()).unwrap();
        Arc::new_cyclic(|weak| MockFileSystem {
            name: rcstr!("mock"),
            root_path,
            watcher: DiskWatcher::new(config),
            turbo_tasks: turbo_tasks::turbo_tasks_weak(),
            tokio_handle: Handle::current(),
            invalidator_map: InvalidatorMap::new(),
            dir_invalidator_map: InvalidatorMap::new(),
            invalidation_lock: RwLock::new(()),
            run_counts: Mutex::new(FxHashMap::default()),
            transient_handle: TransientInstance::new(MockFsHandle(weak.clone())),
            _temp_dir: temp_dir,
        })
    }

    pub async fn tracked_read_strongly_consistent(self: &Arc<Self>, path: &Path) -> u64 {
        #[turbo_tasks::function(operation, root)]
        async fn tracked_read_operation(fs: TransientInstance<MockFsHandle>, path: RcStr) {
            let fs = fs.0.upgrade().unwrap();
            let path = Arc::new(PathBuf::from(&*path));

            if metadata(&*path).unwrap().is_dir() {
                fs.dir_invalidator_map
                    .insert(path.clone(), turbo_tasks::get_invalidator().unwrap());
                fs.watcher
                    .ensure_watched_dir(&path, &fs.root_path)
                    .await
                    .unwrap();
            } else {
                fs.invalidator_map
                    .insert(path.clone(), turbo_tasks::get_invalidator().unwrap());
                fs.watcher
                    .ensure_watched_file(&path, &fs.root_path)
                    .await
                    .unwrap();
            };

            let mut run_counts = fs.run_counts.lock().unwrap();
            let count = run_counts.entry(path).or_default();
            *count += 1;
        }

        tracked_read_operation(
            self.transient_handle.clone(),
            RcStr::from(path.to_str().unwrap()),
        )
        .read_strongly_consistent()
        .await
        .unwrap();
        *self
            .run_counts
            .lock()
            .unwrap()
            .get(&Arc::new(path.to_owned()))
            .unwrap()
    }
}

impl DiskFileSystemWatcherApi for MockFileSystem {
    fn name(&self) -> &RcStr {
        &self.name
    }

    fn root_path(&self) -> &Path {
        &self.root_path
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

    fn invalidate_all(&self) {}

    fn invalidate_all_with_reason<R: InvalidationReason + Clone>(
        &self,
        _reason: impl Fn(&Path) -> R + Sync,
    ) {
    }
}
