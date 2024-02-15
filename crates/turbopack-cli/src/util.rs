use std::{env::current_dir, path::PathBuf};

use anyhow::{Context, Result};
use dunce::canonicalize;
use turbo_tasks::Vc;
use turbo_tasks_fs::{DiskFileSystem, FileSystem};

#[turbo_tasks::value(transparent)]
pub struct EntryRequests(pub Vec<Vc<EntryRequest>>);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum EntryRequest {
    Relative(String),
    Module(String, String),
}

pub struct NormalizedDirs {
    /// Normalized project directory path as an absolute path
    pub project_dir: String,
    /// Normalized root directory path as an absolute path
    pub root_dir: String,
}

/// Normalizes (canonicalizes and represents as an absolute path in a String)
/// the project and root directories.
pub fn normalize_dirs(
    project_dir: &Option<PathBuf>,
    root_dir: &Option<PathBuf>,
) -> Result<NormalizedDirs> {
    let project_dir = project_dir
        .as_ref()
        .map(canonicalize)
        .unwrap_or_else(current_dir)
        .context("project directory can't be found")?
        .to_str()
        .context("project directory contains invalid characters")?
        .to_string();

    let root_dir = match root_dir.as_ref() {
        Some(root) => canonicalize(root)
            .context("root directory can't be found")?
            .to_str()
            .context("root directory contains invalid characters")?
            .to_string(),
        None => project_dir.clone(),
    };

    Ok(NormalizedDirs {
        project_dir,
        root_dir,
    })
}

pub fn normalize_entries(entries: &Option<Vec<String>>) -> Vec<String> {
    entries
        .as_ref()
        .cloned()
        .unwrap_or_else(|| vec!["src/entry".to_owned()])
}

#[turbo_tasks::function]
pub async fn project_fs(project_dir: String) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("project".to_string(), project_dir.to_string(), vec![]);
    disk_fs.await?.start_watching()?;
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub async fn output_fs(project_dir: String) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("output".to_string(), project_dir.to_string(), vec![]);
    disk_fs.await?.start_watching()?;
    Ok(Vc::upcast(disk_fs))
}
