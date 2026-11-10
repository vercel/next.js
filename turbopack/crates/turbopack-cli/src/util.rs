use std::{
    env::current_dir,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{TaskId, TurboTasks, Vc};
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

/// Own compiler cancellation and cache persistence during command shutdown.
pub(crate) struct CompilerShutdown {
    tasks: Arc<TurboTasks<TurboTasksBackend>>,
    go_entries: Option<Arc<GoBuild>>,
    compilation: Option<TaskId>,
    cleaned_up: AtomicBool,
    persist_on_exit: AtomicBool,
}

impl CompilerShutdown {
    /// Errors should exit promptly; successful one-shot builds persist explicitly instead.
    pub(crate) fn skip_persistence(&self) {
        self.persist_on_exit.store(false, Ordering::Release);
    }

    pub(crate) async fn cleanup(&self) {
        // A successful build cleans up before stopping the engine. Its exit callback must
        // not enqueue another run_once after stop_and_wait has stopped accepting work.
        if self.cleaned_up.load(Ordering::Acquire) {
            return;
        }
        if let Some(entries) = &self.go_entries {
            entries.go_context.cancel();
            let entries = entries.clone();
            if let Err(error) = self
                .tasks
                .run_once(async move { entries.stop_watching().await })
                .await
            {
                eprintln!("error during compiler shutdown: {error:#}");
            }
        }
        if let Some(task) = self.compilation {
            self.tasks.dispose_root_task(task);
        }
        self.cleaned_up.store(true, Ordering::Release);
    }
}

/// Register cancellation before the command awaits its compilation root.
pub(crate) fn register_shutdown(
    exit: &ExitHandler,
    tasks: Arc<TurboTasks<TurboTasksBackend>>,
    go_entries: Option<Arc<GoBuild>>,
    compilation: Option<TaskId>,
) -> Arc<CompilerShutdown> {
    let shutdown = Arc::new(CompilerShutdown {
        tasks,
        go_entries,
        compilation,
        cleaned_up: AtomicBool::new(false),
        persist_on_exit: AtomicBool::new(true),
    });
    let on_exit = shutdown.clone();
    exit.on_exit(async move {
        on_exit.cleanup().await;
        if on_exit.persist_on_exit.load(Ordering::Acquire) {
            on_exit.tasks.stop_and_wait().await;
        }
    });
    shutdown
}
