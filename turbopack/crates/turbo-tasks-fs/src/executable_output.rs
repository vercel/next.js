//! Publish executables without allowing checkout-controlled output paths to redirect writes.
//!
//! A source checkout can contain a `dist` symlink pointing outside the checkout. Following
//! that link could replace a command owned by the user running the build, before the compiled
//! program has ever been executed. Reject symlinks and Windows reparse points in every output
//! component below the trusted filesystem root, including the destination filename.
//!
//! Checking a path and then writing through its absolute name would leave a directory-swap
//! race. Instead, open parents one component at a time without following links, then retain
//! the final parent handle for temporary-file creation, publication and cleanup. Unix uses
//! handle-relative operations; Windows pins the directory against rename/deletion and uses
//! its handle's absolute path, preserving verbatim drive and UNC prefixes.
//!
//! Write a sibling temporary file, finish its contents and permissions, close it, then rename
//! it over the destination. This preserves the previous executable on failure and permits
//! rebuilding while the previous Unix executable is still running.
//!
//! These OS operations run while applying a DiskFileSystem write effect, not while declaring
//! a memoized task. Output directories must be checked against current disk state at apply
//! time; making them tracked inputs would let publishing an output invalidate its producer.

use std::{
    ffi::{OsStr, OsString},
    fs::File as OsFile,
    io::{self, Write},
    path::{Component, Path},
};

use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, Metadata, OpenOptions},
};

use crate::File;

const SYMLINK_ERROR: &str = "executable output path must not contain symlinks";

fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

        // Reject junctions and other reparse points as well as ordinary symlinks.
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    metadata.file_type().is_symlink()
}

fn reject_link(directory: &Dir, name: &OsStr) -> io::Result<()> {
    match directory.symlink_metadata(name) {
        Ok(metadata) if is_link(&metadata) => {
            Err(io::Error::new(io::ErrorKind::InvalidInput, SYMLINK_ERROR))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn pinned_path(directory: &Dir, name: &OsStr) -> io::Result<std::path::PathBuf> {
    // cap-std pins Windows directories by withholding FILE_SHARE_DELETE. Keep that handle
    // alive while using its path, but preserve the verbatim UNC prefix that cap-std's
    // path-based mkdir, rename and unlink implementations currently strip incorrectly.
    Ok(crate::windows::handle_path(directory)?.join(name))
}

fn create_directory(directory: &Dir, name: &OsStr) -> io::Result<()> {
    #[cfg(unix)]
    return directory.create_dir(name);
    #[cfg(windows)]
    return std::fs::create_dir(pinned_path(directory, name)?);
}

fn rename_file(directory: &Dir, from: &OsStr, to: &OsStr) -> io::Result<()> {
    #[cfg(unix)]
    return directory.rename(from, directory, to);
    #[cfg(windows)]
    return std::fs::rename(pinned_path(directory, from)?, pinned_path(directory, to)?);
}

fn remove_file(directory: &Dir, name: &OsStr) -> io::Result<()> {
    #[cfg(unix)]
    return directory.remove_file(name);
    #[cfg(windows)]
    return std::fs::remove_file(pinned_path(directory, name)?);
}

/// The configured filesystem root is trusted and canonical. Every path below it is opened
/// one component at a time without following symlinks, including directories created here.
pub(crate) struct ExecutableOutput {
    parent: Dir,
    name: OsString,
}

impl ExecutableOutput {
    pub(crate) fn open(root: &Path, path: &Path) -> io::Result<Self> {
        let relative = path.strip_prefix(root).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "executable output is outside its filesystem",
            )
        })?;
        if !relative
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "executable output must have a relative file path",
            ));
        }
        let name = relative.file_name().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "executable output has no filename",
            )
        })?;
        let mut parent = Dir::open_ambient_dir(root, ambient_authority())?;
        for component in relative.parent().unwrap_or(Path::new("")).components() {
            let name = component.as_os_str();
            reject_link(&parent, name)?;
            parent = match parent.open_dir_nofollow(name) {
                Ok(directory) => directory,
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    match create_directory(&parent, name) {
                        Ok(()) => {}
                        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                        Err(error) => return Err(error),
                    }
                    reject_link(&parent, name)?;
                    parent.open_dir_nofollow(name)?
                }
                Err(error) => return Err(error),
            };
            // On Windows this also excludes reparse-point kinds that are not symlinks.
            if is_link(&parent.dir_metadata()?) {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, SYMLINK_ERROR));
            }
        }
        reject_link(&parent, name)?;
        Ok(Self {
            parent,
            name: name.to_owned(),
        })
    }

    pub(crate) fn write(&self, content: &File) -> io::Result<()> {
        reject_link(&self.parent, &self.name)?;
        // Builder chooses a random basename only. Creation, publication and cleanup all use
        // the held directory capability; its ambient TempPath cleanup is disabled.
        let temporary = tempfile::Builder::new()
            .prefix(".turbopack-")
            .rand_bytes(12)
            .disable_cleanup(true)
            .make_in(".", |path| {
                let mut options = OpenOptions::new();
                options
                    .write(true)
                    .create_new(true)
                    .follow(FollowSymlinks::No);
                #[cfg(unix)]
                {
                    use cap_std::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                self.parent
                    .open_with(path.file_name().unwrap(), &options)
                    .map(|file| file.into_std())
            })?;
        let (file, path) = temporary.into_parts();
        let mut temporary = TemporaryOutput {
            parent: &self.parent,
            name: Some(path.file_name().unwrap().to_owned()),
            file: Some(file),
        };
        let file = temporary.file.as_mut().unwrap();
        io::copy(&mut content.read(), file)?;
        #[cfg(unix)]
        file.set_permissions(content.meta.permissions.into())?;
        file.flush()?;
        drop(temporary.file.take());

        reject_link(&self.parent, &self.name)?;
        rename_file(&self.parent, temporary.name.as_ref().unwrap(), &self.name)?;
        temporary.name = None;
        Ok(())
    }
}

struct TemporaryOutput<'a> {
    parent: &'a Dir,
    name: Option<OsString>,
    file: Option<OsFile>,
}

impl Drop for TemporaryOutput<'_> {
    fn drop(&mut self) {
        drop(self.file.take());
        if let Some(name) = &self.name {
            let _ = remove_file(self.parent, name);
        }
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use std::fs;

    use crate::{File, Permissions, executable_output::ExecutableOutput};

    #[test]
    fn publication_creates_directories_replaces_files_and_cleans_up_on_error() {
        let project = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(project.path()).unwrap();
        let directory = root.join("dist/nested");
        let target = directory.join("main.exe");
        let output = ExecutableOutput::open(&root, &target).unwrap();
        let file =
            |bytes: &[u8]| File::from(bytes.to_vec()).with_permissions(Permissions::Executable);
        output.write(&file(b"old executable")).unwrap();
        output.write(&file(b"new executable")).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"new executable");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);

        let blocked = directory.join("directory.exe");
        fs::create_dir(&blocked).unwrap();
        let output = ExecutableOutput::open(&root, &blocked).unwrap();
        assert!(output.write(&file(b"unpublished executable")).is_err());
        assert!(blocked.is_dir());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::{fs, os::unix::fs::symlink};

    use crate::{File, Permissions, executable_output::ExecutableOutput};

    #[test]
    fn publication_stays_in_the_opened_directory_after_a_symlink_swap() {
        let project = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(project.path()).unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("main"), b"existing user executable").unwrap();
        let output = ExecutableOutput::open(&root, &root.join("dist/main")).unwrap();

        fs::rename(root.join("dist"), root.join("retained")).unwrap();
        symlink(outside.path(), root.join("dist")).unwrap();
        output
            .write(
                &File::from(b"new executable".to_vec()).with_permissions(Permissions::Executable),
            )
            .unwrap();

        assert_eq!(
            fs::read(root.join("retained/main")).unwrap(),
            b"new executable"
        );
        assert_eq!(
            fs::read(outside.path().join("main")).unwrap(),
            b"existing user executable"
        );
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 1);
        assert_eq!(fs::read_dir(root.join("retained")).unwrap().count(), 1);
    }
}
