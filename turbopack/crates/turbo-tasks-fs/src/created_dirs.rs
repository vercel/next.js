use std::{
    io::{self, ErrorKind},
    path::Path,
};

/// Tracks the directories that a [`DiskFileSystem`][crate::DiskFileSystem] created itself in the
/// current session.
///
/// A directory that was created by the filesystem was empty when it was created, and files in it
/// are normally only written by the filesystem afterwards. For those files the per-key effect state
/// already knows the content on disk, and an effect with identical content is deduplicated before
/// it is applied. Writes into such a directory therefore skip reading the existing file to compare
/// it with the new content.
///
/// Skipping that comparison matters when many files are created in the same directory (e.g. a
/// fresh output directory): opening a missing file for reading takes the parent directory's lock in
/// the kernel, which contends with the concurrent file creations in the same directory and roughly
/// halves the rate at which files can be created there.
///
/// This is only a hint to skip work. If it's wrong (e.g. another process wrote a file with the same
/// content into a created directory), a write rewrites a file that already has the same content.
/// The written content is always correct.
///
/// To keep the hint accurate, the identity (device, inode and creation time) of every created
/// directory is recorded, and [`CreatedDirs::contains`] checks that the directory currently at the
/// path is still the same directory. So a directory that was removed, replaced, renamed away or
/// re-created by someone else (or that is reached through a symlink that now points elsewhere) is
/// not considered created by the filesystem. A directory that the filesystem re-creates is
/// recorded again. A full invalidation of the filesystem forgets all directories (see
/// [`CreatedDirs::clear`]).
///
/// The identity of a directory is only available on Unix platforms. On other platforms, no
/// directories are recorded and every write compares with the existing file.
#[derive(Default)]
pub(crate) struct CreatedDirs {
    #[cfg(unix)]
    dirs: parking_lot::Mutex<rustc_hash::FxHashMap<u64, unix::DirIdentity>>,
}

#[cfg(unix)]
mod unix {
    use std::{fs::Metadata, os::unix::fs::MetadataExt, path::Path, time::SystemTime};

    use turbo_tasks_hash::hash_xxh3_hash64;

    /// Identifies a directory, so that a different directory at the same path can be detected.
    ///
    /// The creation time distinguishes a new directory that reuses the inode number of a removed
    /// one, where the platform reports it.
    #[derive(Clone, Copy, PartialEq, Eq)]
    pub(super) struct DirIdentity {
        dev: u64,
        ino: u64,
        created: Option<SystemTime>,
    }

    impl DirIdentity {
        pub(super) fn of(metadata: &Metadata) -> Self {
            Self {
                dev: metadata.dev(),
                ino: metadata.ino(),
                created: metadata.created().ok(),
            }
        }
    }

    /// Only a 64-bit hash of each path is stored to keep the memory usage small. On a hash
    /// collision, the identity of the other directory is compared, which doesn't match.
    pub(super) fn path_key(path: &Path) -> u64 {
        hash_xxh3_hash64(path.as_os_str().as_encoded_bytes())
    }
}

impl CreatedDirs {
    /// Returns whether the directory at `dir` was created by the filesystem in the current
    /// session, i.e. it is still the same directory that the filesystem created.
    ///
    /// This reads the metadata of `dir`.
    pub fn contains(&self, dir: &Path) -> bool {
        #[cfg(unix)]
        {
            let key = unix::path_key(dir);
            let Some(identity) = self.dirs.lock().get(&key).copied() else {
                return false;
            };
            let current = std::fs::metadata(dir)
                .ok()
                .filter(|metadata| metadata.is_dir())
                .map(|metadata| unix::DirIdentity::of(&metadata));
            if current == Some(identity) {
                return true;
            }
            // The directory was removed or replaced, forget it (unless it was re-recorded in the
            // meantime).
            let mut dirs = self.dirs.lock();
            if dirs.get(&key) == Some(&identity) {
                dirs.remove(&key);
            }
            false
        }
        #[cfg(not(unix))]
        {
            let _ = dir;
            false
        }
    }

    /// Forgets all directories.
    pub fn clear(&self) {
        #[cfg(unix)]
        {
            *self.dirs.lock() = Default::default();
        }
    }

    /// Records the directory at `dir`, which was just created by the filesystem.
    fn insert(&self, dir: &Path) {
        #[cfg(unix)]
        if let Ok(metadata) = std::fs::metadata(dir) {
            self.dirs
                .lock()
                .insert(unix::path_key(dir), unix::DirIdentity::of(&metadata));
        }
        #[cfg(not(unix))]
        let _ = dir;
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
                self.insert(path);
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
                self.insert(path);
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

    #[cfg(unix)]
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
    }

    #[cfg(unix)]
    #[test]
    fn removed_and_replaced_directories_are_not_contained() {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path();
        let dirs = CreatedDirs::default();

        // Removed.
        dirs.create_dir_all(&root.join("a")).unwrap();
        std::fs::remove_dir(root.join("a")).unwrap();
        assert!(!dirs.contains(&root.join("a")));

        // Re-created by someone else.
        dirs.create_dir_all(&root.join("b")).unwrap();
        std::fs::remove_dir(root.join("b")).unwrap();
        std::fs::create_dir(root.join("b")).unwrap();
        assert!(!dirs.contains(&root.join("b")));

        // Renamed away and replaced by another directory.
        dirs.create_dir_all(&root.join("c")).unwrap();
        std::fs::create_dir(root.join("other")).unwrap();
        std::fs::rename(root.join("c"), root.join("c-old")).unwrap();
        std::fs::rename(root.join("other"), root.join("c")).unwrap();
        assert!(!dirs.contains(&root.join("c")));
        assert!(!dirs.contains(&root.join("c-old")));

        // Replaced by a file.
        dirs.create_dir_all(&root.join("d")).unwrap();
        std::fs::remove_dir(root.join("d")).unwrap();
        std::fs::write(root.join("d"), "").unwrap();
        assert!(!dirs.contains(&root.join("d")));

        // Re-created by the filesystem.
        dirs.create_dir_all(&root.join("a")).unwrap();
        assert!(dirs.contains(&root.join("a")));

        dirs.clear();
        assert!(!dirs.contains(&root.join("a")));
    }
}
