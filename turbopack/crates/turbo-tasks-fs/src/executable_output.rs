//! Executable publication relative to opened directories, without following output symlinks.

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
                    match parent.create_dir(name) {
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
        self.parent
            .rename(temporary.name.as_ref().unwrap(), &self.parent, &self.name)?;
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
            let _ = self.parent.remove_file(name);
        }
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
