use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::{DiskFileSystemVc, File, FileContent, FileContentVc, FileSystemPathVc};

#[turbo_tasks::function]
pub async fn content_from_relative_path(module_path: &str, path: &str) -> Result<FileContentVc> {
    let module_path = PathBuf::from(module_path);
    let root_path = module_path.parent().unwrap();
    let resolved_path = root_path.join(path);
    let resolved_path = std::fs::canonicalize(&resolved_path)
        .context("failed to canonicalize embedded file path")?;
    let disk_fs = DiskFileSystemVc::new(
        resolved_path.to_string_lossy().to_string(),
        root_path.to_string_lossy().to_string(),
    );
    disk_fs.await?.start_watching()?;
    let fs_path = FileSystemPathVc::new(disk_fs.into(), path);
    Ok(fs_path.read())
}

#[turbo_tasks::function]
pub async fn content_from_str(string: &str) -> Result<FileContentVc> {
    Ok(FileContent::Content(File::from_source(string.to_string())).cell())
}

/// Loads a file's content from disk and invalidates on change (debug builds).
///
/// In production, this will embed a file's content into the binary directly.
#[cfg(debug_assertions)]
#[macro_export]
macro_rules! embed_file {
    ($path:expr) => {
        turbo_tasks_fs::embed::content_from_relative_path(
            concat!(env!("CARGO_WORKSPACE_DIR"), file!()),
            $path,
        )
    };
}

/// Embeds a file's content into the binary (production).
#[cfg(not(debug_assertions))]
#[macro_export]
macro_rules! embed_file {
    ($path:expr) => {
        turbo_tasks_fs::embed::content_from_str(include_str!($path))
    };
}
