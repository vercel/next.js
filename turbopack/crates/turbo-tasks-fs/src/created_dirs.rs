use std::{
    io::{self, ErrorKind},
    path::{Path, PathBuf},
};

use dashmap::DashSet;
use rustc_hash::FxBuildHasher;

/// Tracks the directories that a [`DiskFileSystem`][crate::DiskFileSystem] created itself in the
/// current session.
///
/// A directory that was created by the filesystem was empty when it was created, and files in it
/// are only written by the filesystem afterwards. For those files the per-key effect state already
/// knows the content on disk, and an effect with identical content is deduplicated before it is
/// applied. Writes into such a directory therefore skip reading the existing file to compare it
/// with the new content.
///
/// Skipping that comparison matters when many files are created in the same directory (e.g. a
/// fresh output directory): opening a missing file for reading takes the parent directory's lock in
/// the kernel, which contends with the concurrent file creations in the same directory and roughly
/// halves the rate at which files can be created there.
///
/// This is only a hint to skip work, not something correctness depends on. It assumes that nobody
/// else modifies these directories while the filesystem is attached. If someone does (e.g. replaces
/// a created directory with another one containing files), the directory stays recorded and a write
/// may rewrite a file that already has the same content. The written content is always correct.
///
/// A directory that is removed is created again (and recorded again) by the next write into it. A
/// full invalidation of the filesystem forgets all directories (see [`CreatedDirs::clear`]).
#[derive(Default)]
pub(crate) struct CreatedDirs {
    dirs: DashSet<PathBuf, FxBuildHasher>,
}

impl CreatedDirs {
    /// Returns whether the directory at `dir` was created by the filesystem in the current
    /// session.
    pub fn contains(&self, dir: &Path) -> bool {
        self.dirs.contains(dir)
    }

    /// Forgets all directories.
    pub fn clear(&self) {
        self.dirs.clear();
    }

    /// Like [`std::fs::create_dir_all`], but records every directory that this call created.
    /// Directories that already existed (or that were created concurrently by someone else) are
    /// not recorded.
    pub fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        if path.as_os_str().is_empty() {
            return Ok(());
        }
        match std::fs::create_dir(path) {
            Ok(()) => {
                self.dirs.insert(path.to_owned());
                return Ok(());
            }
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(_) if path.is_dir() => return Ok(()),
            Err(err) => return Err(err),
        }
        match path.parent() {
            Some(parent) => self.create_dir_all(parent)?,
            None => {
                return Err(io::Error::other("failed to create whole tree"));
            }
        }
        match std::fs::create_dir(path) {
            Ok(()) => {
                self.dirs.insert(path.to_owned());
                Ok(())
            }
            Err(_) if path.is_dir() => Ok(()),
            Err(err) => Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::CreatedDirs;

    #[test]
    fn create_dir_all_creates_directories() {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path();
        std::fs::create_dir(root.join("existing")).unwrap();

        let dirs = CreatedDirs::default();
        dirs.create_dir_all(&root.join("existing/a/b")).unwrap();
        assert!(root.join("existing/a/b").is_dir());
        // Creating existing directories succeeds.
        dirs.create_dir_all(&root.join("existing/a/b")).unwrap();
    }

    #[test]
    fn create_dir_all_fails_on_files() {
        let scratch = tempfile::tempdir().unwrap();
        let file = scratch.path().join("file");
        std::fs::write(&file, "").unwrap();

        let dirs = CreatedDirs::default();
        assert!(dirs.create_dir_all(&file).is_err());
        assert!(dirs.create_dir_all(&file.join("child")).is_err());
        assert!(!dirs.contains(&file));
    }

    #[test]
    fn records_only_created_directories() {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path();
        std::fs::create_dir(root.join("existing")).unwrap();

        let dirs = CreatedDirs::default();
        dirs.create_dir_all(&root.join("existing/a/b")).unwrap();
        assert!(!dirs.contains(root));
        assert!(!dirs.contains(&root.join("existing")));
        assert!(dirs.contains(&root.join("existing/a")));
        assert!(dirs.contains(&root.join("existing/a/b")));

        // Already existing directories are not recorded.
        let other = CreatedDirs::default();
        other.create_dir_all(&root.join("existing/a/b")).unwrap();
        assert!(!other.contains(&root.join("existing/a/b")));

        dirs.clear();
        assert!(!dirs.contains(&root.join("existing/a")));
        assert!(!dirs.contains(&root.join("existing/a/b")));
    }
}
