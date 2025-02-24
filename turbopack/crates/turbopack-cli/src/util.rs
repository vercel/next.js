use std::{env::current_dir, path::PathBuf};

use anyhow::{Context, Result};
use dunce::canonicalize;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, TaskInput, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};

#[derive(Clone, Debug, TaskInput, Hash, PartialEq, Eq, NonLocalValue, Serialize, Deserialize)]
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
        .unwrap_or_else(|| vec!["src/entry".into()])
}

#[turbo_tasks::function]
pub async fn project_fs(project_dir: RcStr) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("project".into(), project_dir, vec![]);
    disk_fs.await?.start_watching(None).await?;
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub async fn output_fs(project_dir: RcStr) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("output".into(), project_dir, vec![]);
    Ok(Vc::upcast(disk_fs))
}
