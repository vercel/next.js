use std::{env::current_dir, path::PathBuf};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, FileSystem, canonicalize_to_rcstr,
};

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
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
