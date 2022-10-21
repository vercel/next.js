pub use ::include_dir::{self, include_dir};
use anyhow::Result;
use turbo_tasks::TransientInstance;

use crate::{embed::EmbeddedFileSystemVc, DiskFileSystemVc, FileSystemVc};

#[turbo_tasks::function]
pub async fn directory_from_relative_path(name: &str, path: String) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new(name.to_string(), path);
    disk_fs.await?.start_watching()?;

    Ok(disk_fs.into())
}

#[turbo_tasks::function]
pub async fn directory_from_include_dir(
    name: &str,
    dir: TransientInstance<&'static include_dir::Dir<'static>>,
) -> Result<FileSystemVc> {
    Ok(EmbeddedFileSystemVc::new(name.to_string(), dir).into())
}

/// Returns an embedded filesystem for the given path.
///
/// In debug builds, this will create a [DiskFileSystemVc].
///
/// In release builds, this will embed a directory's content into the binary and
/// create an [EmbeddedFileSystemVc].
#[macro_export]
macro_rules! embed_directory {
    ($name:tt, $path:tt) => {{
        // make sure the path contains `$CARGO_MANIFEST_DIR`
        assert!($path.contains("$CARGO_MANIFEST_DIR"));
        // make sure `CARGO_MANIFEST_DIR` is the only env variable in the path
        assert!(!$path.replace("$CARGO_MANIFEST_DIR", "").contains('$'));

        // make sure the types the `include_dir!` proc macro refers to are in scope
        use turbo_tasks_fs::embed::include_dir;
        if cfg!(debug_assertions) {
            let path = $path.replace("$CARGO_MANIFEST_DIR", env!("CARGO_MANIFEST_DIR"));
            turbo_tasks_fs::embed::directory_from_relative_path($name, path)
        } else {
            // check that the directory exists at compile time even for debug builds
            static dir: include_dir::Dir<'static> = turbo_tasks_fs::embed::include_dir!($path);

            turbo_tasks_fs::embed::directory_from_include_dir(
                $name,
                turbo_tasks::TransientInstance::new(&dir),
            )
        }
    }};
}
