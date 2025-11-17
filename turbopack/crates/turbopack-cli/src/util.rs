use std::{env::current_dir, path::PathBuf};

use anyhow::{Context, Result};
use dunce::canonicalize;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};

#[derive(
    Clone, Debug, TaskInput, Hash, PartialEq, Eq, NonLocalValue, Serialize, Deserialize, TraceRawVcs,
)]
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
    let project_dir: RcStr = project_dir
        .as_ref()
        .map(canonicalize)
        .unwrap_or_else(current_dir)
        .context("project directory can't be found")?
        .to_str()
        .context("project directory contains invalid characters")?
        .into();

    let root_dir = match root_dir.as_ref() {
        Some(root) => canonicalize(root)
            .context("root directory can't be found")?
            .to_str()
            .context("root directory contains invalid characters")?
            .into(),
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
    let disk_fs =
        DiskFileSystem::new_with_denied_path(rcstr!("project"), project_dir, denied_root_path);
    if watch {
        disk_fs.await?.start_watching(None).await?;
    }
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub fn output_fs(project_dir: RcStr) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(rcstr!("output"), project_dir);
    Ok(Vc::upcast(disk_fs))
}
