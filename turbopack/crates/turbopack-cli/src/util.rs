use std::{env::current_dir, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadConsistency, TaskId, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, FileSystem, canonicalize_to_rcstr,
};
use turbopack_trace_utils::exit::ExitHandler;

use crate::go::GoBuild;

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub enum EntryRequest {
    Relative(RcStr),
    Module(RcStr, RcStr),
}

pub struct NormalizedDirs {
    /// Normalized project directory path as an absolute path
    pub project_dir: RcStr,
    /// Normalized root directory path as an absolute path
    pub root_dir: RcStr,
}

/// Normalizes (canonicalizes and represents as an absolute path in a String)
/// the project and root directories.
pub fn normalize_dirs(
    project_dir: &Option<PathBuf>,
    root_dir: &Option<PathBuf>,
) -> Result<NormalizedDirs> {
    let project_dir = match project_dir.as_ref() {
        Some(dir) => canonicalize_to_rcstr(dir),
        None => canonicalize_to_rcstr(&current_dir().context("current directory can't be found")?),
    }
    .context("project directory can't be found")?;

    let root_dir = match root_dir.as_ref() {
        Some(root) => canonicalize_to_rcstr(root).context("root directory can't be found")?,
        None => project_dir.clone(),
    };

    Ok(NormalizedDirs {
        project_dir,
        root_dir,
    })
}

pub fn normalize_entries(entries: &Option<Vec<String>>) -> Vec<RcStr> {
    entries
        .as_ref()
        .map(|v| v.iter().map(|v| RcStr::from(&**v)).collect())
        .unwrap_or_else(|| vec![rcstr!("src/entry")])
}

#[turbo_tasks::function]
pub async fn project_fs(
    project_dir: RcStr,
    watch: bool,
    denied_root_path: RcStr,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new_with_options(
        rcstr!("project"),
        Vc::cell(project_dir),
        vec![denied_root_path],
        DiskWatcherConfig::default(),
        DiskFileSystemMap::empty(),
    );
    if watch {
        disk_fs.await?.start_watching().await?;
    }
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub fn output_fs(project_dir: RcStr) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(rcstr!("output"), Vc::cell(project_dir));
    Ok(Vc::upcast(disk_fs))
}

/// Own ordered shutdown while the command future is suspended after a signal.
/// Registration happens before the command awaits its compilation root.
pub(crate) fn register_shutdown(
    exit: &ExitHandler,
    tasks: Arc<TurboTasks<TurboTasksBackend>>,
    go_entries: Option<Arc<GoBuild>>,
    compilation: Option<TaskId>,
) {
    exit.on_exit(async move {
        if let Some(entries) = &go_entries {
            entries.context.cancel();
        }
        // The cleanup task needs its own engine handle because run_once owns a 'static
        // future. Keep the outer handle for disposal and engine shutdown afterward.
        let cleanup_tasks = tasks.clone();
        let cleanup = tasks
            .run_once(async move {
                let watchers = match go_entries {
                    Some(entries) => entries.stop_watching().await,
                    None => Ok(()),
                };
                if let Some(task) = compilation {
                    // The command already reports compilation errors. An error output still
                    // means the root has settled and is safe to dispose.
                    let _ = cleanup_tasks
                        .wait_task_completion(task, ReadConsistency::Strong)
                        .await;
                }
                watchers
            })
            .await;
        if let Some(task) = compilation {
            tasks.dispose_root_task(task);
        }
        // Stopping first would prevent the draining graph from scheduling its remaining work.
        tasks.stop_and_wait().await;
        if let Err(error) = cleanup {
            eprintln!("error during compiler shutdown: {error:#}");
        }
    });
}
