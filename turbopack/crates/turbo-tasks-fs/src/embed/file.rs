use std::path::PathBuf;

use anyhow::{Context, Result};
use dunce::canonicalize;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{DiskFileSystem, File, FileContent, FileSystem};

#[turbo_tasks::function]
pub async fn content_from_relative_path(
    package_path: RcStr,
    path: RcStr,
) -> Result<Vc<FileContent>> {
    let package_path = PathBuf::from(package_path);
    let resolved_path = package_path.join(path);
    let resolved_path =
        canonicalize(&resolved_path).context("failed to canonicalize embedded file path")?;
    let root_path = resolved_path.parent().unwrap();
    let path = resolved_path.file_name().unwrap().to_str().unwrap();

    let disk_fs = DiskFileSystem::new(
        root_path.to_string_lossy().into(),
        root_path.to_string_lossy().into(),
        vec![],
    );
    disk_fs.await?.start_watching(None).await?;

    let fs_path = disk_fs.root().join(path.into());
    Ok(fs_path.read())
}

#[turbo_tasks::function]
pub fn content_from_str(string: RcStr) -> Vc<FileContent> {
    File::from(string).into()
}

/// Loads a file's content from disk and invalidates on change (debug builds).
///
/// In production, this will embed a file's content into the binary directly.
#[cfg(feature = "dynamic_embed_contents")]
#[macro_export]
macro_rules! embed_file {
    ($path:expr) => {{
        // check that the file exists at compile time
        let _ = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/", $path));

        turbo_tasks_fs::embed::content_from_relative_path(
            env!("CARGO_MANIFEST_DIR").into(),
            $path.into(),
        )
    }};
}

/// Embeds a file's content into the binary (production).
#[cfg(not(feature = "dynamic_embed_contents"))]
#[macro_export]
macro_rules! embed_file {
    ($path:expr) => {
        turbo_tasks_fs::embed::content_from_str(
            include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/", $path)).into(),
        )
    };
}
