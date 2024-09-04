pub use ::include_dir::{
    include_dir, {self},
};
use anyhow::Result;
use turbo_tasks::{RcStr, TransientInstance, Vc};

use crate::{embed::EmbeddedFileSystem, DiskFileSystem, FileSystem};

#[turbo_tasks::function]
pub async fn directory_from_relative_path(
    name: RcStr,
    path: RcStr,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(name, path, vec![]);
    disk_fs.await?.start_watching()?;

    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub async fn directory_from_include_dir(
    name: RcStr,
    dir: TransientInstance<&'static include_dir::Dir<'static>>,
) -> Result<Vc<Box<dyn FileSystem>>> {
    Ok(Vc::upcast(EmbeddedFileSystem::new(name, dir)))
}

/// Returns an embedded [Vc<Box<dyn FileSystem>>] for the given path.
///
/// This will embed a directory's content into the binary and
/// create an [Vc<EmbeddedFileSystem>].
///
/// If you enable the `dynamic_embed_contents` feature, calling
/// the macro will return a [Vc<DiskFileSystem>].
///
/// This enables dynamic linking (and hot reloading) of embedded files/dirs.
/// A binary built with `dynamic_embed_contents` enabled is **is not portable**,
/// only the directory path will be embedded into the binary.
#[macro_export]
macro_rules! embed_directory {
    ($name:tt, $path:tt) => {{        // make sure the path contains `$CARGO_MANIFEST_DIR`
        assert!($path.contains("$CARGO_MANIFEST_DIR"));
        // make sure `CARGO_MANIFEST_DIR` is the only env variable in the path
        assert!(!$path.replace("$CARGO_MANIFEST_DIR", "").contains('$'));

        turbo_tasks_fs::embed_directory_internal!($name, $path)
    }};
}

#[cfg(feature = "dynamic_embed_contents")]
#[macro_export]
#[doc(hidden)]
macro_rules! embed_directory_internal {
    ($name:tt, $path:tt) => {{
        // make sure the types the `include_dir!` proc macro refers to are in scope
        use turbo_tasks_fs::embed::include_dir;

        let path = $path.replace("$CARGO_MANIFEST_DIR", env!("CARGO_MANIFEST_DIR"));

        turbo_tasks_fs::embed::directory_from_relative_path($name.to_string(), path)
    }};
}

#[cfg(not(feature = "dynamic_embed_contents"))]
#[macro_export]
#[doc(hidden)]
macro_rules! embed_directory_internal {
    ($name:tt, $path:tt) => {{
        // make sure the types the `include_dir!` proc macro refers to are in scope
        use turbo_tasks_fs::embed::include_dir;

        static dir: include_dir::Dir<'static> = turbo_tasks_fs::embed::include_dir!($path);

        turbo_tasks_fs::embed::directory_from_include_dir(
            $name.into(),
            turbo_tasks::TransientInstance::new(&dir),
        )
    }};
}
