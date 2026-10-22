use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{File, OpenOptions, TryLockError},
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use tokio_util::sync::CancellationToken;

use crate::artifact::{Artifact, Entry, hash, visit};

#[derive(Debug)]
pub(crate) struct Lease {
    // Shared file lock retained until the last session using this installation ends.
    _file: File,
}

pub fn default_cache_directory() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("TURBOPACK_GO_TOOLCHAIN_CACHE") {
        return Ok(path.into());
    }
    #[cfg(windows)]
    let path = PathBuf::from(
        std::env::var_os("LOCALAPPDATA")
            .context("LOCALAPPDATA is required; set TURBOPACK_GO_TOOLCHAIN_CACHE")?,
    )
    .join("Turbopack");
    #[cfg(target_os = "macos")]
    let path = PathBuf::from(
        std::env::var_os("HOME").context("HOME is required; set TURBOPACK_GO_TOOLCHAIN_CACHE")?,
    )
    .join("Library/Caches/turbopack");
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let path = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".cache")))
        .context("a user cache directory is required; set TURBOPACK_GO_TOOLCHAIN_CACHE")?
        .join("turbopack");
    Ok(path.join("go-toolchains"))
}

fn check(cancel: &CancellationToken) -> Result<()> {
    ensure!(!cancel.is_cancelled(), "Go toolchain preparation cancelled");
    Ok(())
}

fn reject_links(path: &Path) -> Result<()> {
    for ancestor in path.ancestors() {
        if let Ok(metadata) = std::fs::symlink_metadata(ancestor) {
            ensure!(
                !metadata.file_type().is_symlink(),
                "Go toolchain cache contains a symlink: {}",
                ancestor.display()
            );
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                ensure!(
                    metadata.file_attributes() & 0x400 == 0,
                    "Go toolchain cache contains a reparse point"
                );
            }
        }
    }
    Ok(())
}

fn private_directory(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(path)?;
        use std::os::unix::fs::MetadataExt;
        ensure!(
            metadata.uid() == unsafe { libc::geteuid() },
            "Go toolchain cache is owned by another user"
        );
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn wait_lock(file: &File, shared: bool, cancel: &CancellationToken) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        check(cancel)?;
        let result = if shared {
            file.try_lock_shared()
        } else {
            file.try_lock()
        };
        match result {
            Ok(()) => return Ok(()),
            Err(TryLockError::WouldBlock) => {
                ensure!(
                    Instant::now() < deadline,
                    "timed out waiting for Go toolchain cache lock"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(TryLockError::Error(error)) => return Err(error.into()),
        }
    }
}

fn inventory(
    path: &Path,
    prefix: &str,
    names: &mut BTreeSet<String>,
    cancel: &CancellationToken,
) -> Result<()> {
    check(cancel)?;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("non-UTF8 cache entry"))?;
        let relative = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let metadata = std::fs::symlink_metadata(entry.path())?;
        ensure!(
            metadata.is_dir() || metadata.is_file(),
            "unsupported cache entry: {relative}"
        );
        reject_links(&entry.path())?;
        names.insert(relative.clone());
        if metadata.is_dir() {
            inventory(&entry.path(), &relative, names, cancel)?;
        }
    }
    Ok(())
}

fn verify(root: &Path, key: &str, entries: &[Entry], cancel: &CancellationToken) -> Result<()> {
    reject_links(root)?;
    ensure!(
        std::fs::read_to_string(root.join("complete"))? == key,
        "incomplete Go toolchain cache"
    );
    let goroot = root.join("go");
    let mut names = BTreeSet::new();
    inventory(&goroot, "", &mut names, cancel)?;
    let mut expected = BTreeSet::new();
    for entry in entries {
        expected.insert(entry.path.clone());
        for parent in Path::new(&entry.path)
            .ancestors()
            .skip(1)
            .filter(|p| !p.as_os_str().is_empty())
        {
            expected.insert(
                parent
                    .to_str()
                    .context("non-UTF8 cache path")?
                    .replace('\\', "/"),
            );
        }
        check(cancel)?;
        let path = goroot.join(&entry.path);
        let metadata = std::fs::symlink_metadata(&path)?;
        ensure!(
            metadata.is_dir() == entry.directory && (entry.directory || metadata.is_file()),
            "Go toolchain cache entry type mismatch"
        );
        if !entry.directory {
            ensure!(
                metadata.len() == entry.size,
                "Go toolchain cache size mismatch"
            );
            let (_, digest) = hash(&mut File::open(&path)?, || check(cancel))?;
            ensure!(
                digest == entry.sha256,
                "Go toolchain cache hash mismatch: {}",
                entry.path
            );
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = metadata.permissions().mode();
                ensure!(
                    mode & 0o022 == 0 && (mode & 0o111 != 0) == entry.executable,
                    "Go toolchain cache permission mismatch"
                );
            }
        }
    }
    ensure!(names == expected, "unexpected Go toolchain cache entries");
    Ok(())
}

pub(crate) fn prepare(
    artifact: &Artifact,
    bytes: &[u8],
    entries: &[Entry],
    base: &Path,
    cancel: &CancellationToken,
) -> Result<(PathBuf, Arc<Lease>)> {
    // Canonicalize existing user-cache ancestors (macOS /var and /tmp are aliases), then
    // refuse links inside the managed namespace. Never execute through an archive-created link.
    std::fs::create_dir_all(base.parent().context("cache directory has no parent")?)?;
    let base = std::fs::canonicalize(base.parent().unwrap())?
        .join(base.file_name().context("cache directory has no name")?);
    reject_links(&base)?;
    private_directory(&base)?;
    #[cfg(windows)]
    private_windows_cache(&base)?;
    let key = artifact.key();
    let root = base.join(&key);
    let lock_path = base.join(format!("{key}.lock"));
    reject_links(&lock_path)?;
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)?;
    loop {
        wait_lock(&file, true, cancel)?;
        if verify(&root, &key, entries, cancel).is_ok() {
            return Ok((root.join("go"), Arc::new(Lease { _file: file })));
        }
        check(cancel)?;
        let existing = root.exists();
        file.unlock()?;
        // Never wait exclusively: the winning extractor keeps a shared session lease.
        // Recheck under a shared lock so cold-cache contenders can reuse its result.
        match file.try_lock() {
            Ok(()) => break,
            Err(TryLockError::WouldBlock) if existing => {
                wait_lock(&file, true, cancel)?;
                if verify(&root, &key, entries, cancel).is_ok() {
                    return Ok((root.join("go"), Arc::new(Lease { _file: file })));
                }
                anyhow::bail!(
                    "damaged Go toolchain cache is in use; stop other Go sessions and retry"
                );
            }
            Err(TryLockError::WouldBlock) => {
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(TryLockError::Error(error)) => return Err(error.into()),
        }
    }
    if verify(&root, &key, entries, cancel).is_err() {
        check(cancel)?;
        reject_links(&root)?;
        if root.exists() {
            std::fs::remove_dir_all(&root)?;
        }
        for entry in std::fs::read_dir(&base)? {
            let entry = entry?;
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(&format!(".{key}-"))
                && entry.file_type()?.is_dir()
            {
                std::fs::remove_dir_all(entry.path())?;
            }
        }
        let temp = tempfile::Builder::new()
            .prefix(&format!(".{key}-"))
            .tempdir_in(&base)?;
        let goroot = temp.path().join("go");
        private_directory(&goroot)?;
        let expected: BTreeMap<_, _> = entries
            .iter()
            .map(|entry| (entry.path.as_str(), entry))
            .collect();
        visit(
            Cursor::new(bytes),
            artifact.is_zip(),
            |path, directory, size, executable, reader| {
                check(cancel)?;
                let entry = expected
                    .get(path)
                    .context("unexpected embedded archive entry")?;
                ensure!(
                    entry.directory == directory
                        && entry.size == size
                        && entry.executable == executable,
                    "embedded archive metadata mismatch"
                );
                let target = goroot.join(path);
                if directory {
                    private_directory(&target)?;
                } else {
                    std::fs::create_dir_all(target.parent().unwrap())?;
                    let mut file = OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target)?;
                    let mut buffer = [0; 65536];
                    loop {
                        check(cancel)?;
                        let n = reader.read(&mut buffer)?;
                        if n == 0 {
                            break;
                        }
                        file.write_all(&buffer[..n])?;
                    }
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        file.set_permissions(std::fs::Permissions::from_mode(if executable {
                            0o755
                        } else {
                            0o644
                        }))?;
                    }
                    // Persist executable tools before publication. Source files are closed and
                    // fully verified below; startup verification repairs any crash-lost data.
                    // Syncing thousands of tiny source files individually stalls cold startup.
                    if executable {
                        file.sync_all()?;
                    }
                }
                Ok(())
            },
        )?;
        let mut marker = File::create(temp.path().join("complete"))?;
        marker.write_all(key.as_bytes())?;
        marker.sync_all()?;
        // Windows cannot rename a directory while its completion marker is open.
        drop(marker);
        verify(temp.path(), &key, entries, cancel)?;
        check(cancel)?;
        std::fs::rename(temp.path(), &root).context("publishing extracted Go toolchain")?;
        #[cfg(unix)]
        File::open(&base)?.sync_all()?;
    }
    check(cancel)?;
    file.unlock()?;
    wait_lock(&file, true, cancel)?;
    // Another process may have acquired an exclusive lock in the transition.
    verify(&root, &key, entries, cancel)?;
    Ok((root.join("go"), Arc::new(Lease { _file: file })))
}

#[cfg(test)]
mod tests {
    use flate2::{Compression, write::GzEncoder};

    use super::*;
    use crate::artifact::inspect;

    fn payload() -> (Artifact, Vec<u8>, Vec<Entry>) {
        let mut archive = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        for (path, bytes, mode) in [
            ("go/VERSION", b"go1.test".as_slice(), 0o644),
            ("go/bin/go", b"fake executable".as_slice(), 0o755),
            (
                "go/src/runtime/runtime.go",
                b"package runtime".as_slice(),
                0o644,
            ),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(mode);
            header.set_cksum();
            archive.append_data(&mut header, path, bytes).unwrap();
        }
        let bytes = archive.into_inner().unwrap().finish().unwrap();
        let temp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(temp.path(), &bytes).unwrap();
        let (size, sha256) = hash(&mut Cursor::new(&bytes), || Ok(())).unwrap();
        let artifact = Artifact {
            filename: "go.test.tar.gz".into(),
            os: "test".into(),
            arch: "test".into(),
            version: "go1.test".into(),
            size,
            sha256,
        };
        let entries = inspect(&artifact, temp.path()).unwrap();
        (artifact, bytes, entries)
    }

    #[test]
    fn reuses_repairs_and_respects_live_leases() {
        let (artifact, bytes, entries) = payload();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("cache");
        let token = CancellationToken::new();
        let (root, lease) = prepare(&artifact, &bytes, &entries, &base, &token).unwrap();
        let stamp = std::fs::metadata(root.join("VERSION"))
            .unwrap()
            .modified()
            .unwrap();
        let (_, second) = prepare(&artifact, &bytes, &entries, &base, &token).unwrap();
        assert_eq!(
            std::fs::metadata(root.join("VERSION"))
                .unwrap()
                .modified()
                .unwrap(),
            stamp
        );
        std::fs::write(root.join("VERSION"), "broken!").unwrap();
        assert!(
            prepare(&artifact, &bytes, &entries, &base, &token)
                .unwrap_err()
                .to_string()
                .contains("in use")
        );
        drop(lease);
        drop(second);
        let (repaired, lease) = prepare(&artifact, &bytes, &entries, &base, &token).unwrap();
        assert_eq!(
            std::fs::read(repaired.join("VERSION")).unwrap(),
            b"go1.test"
        );
        drop(lease);
        std::fs::remove_file(repaired.join("src/runtime/runtime.go")).unwrap();
        assert!(prepare(&artifact, &bytes, &entries, &base, &token).is_ok());
    }

    #[test]
    fn concurrent_extractors_publish_one_complete_installation() {
        let (artifact, bytes, entries) = payload();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("cache");
        let barrier = std::sync::Barrier::new(4);
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        prepare(
                            &artifact,
                            &bytes,
                            &entries,
                            &base,
                            &CancellationToken::new(),
                        )
                        .unwrap()
                    })
                })
                .collect();
            let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
            assert!(results.iter().all(|(root, _)| root == &results[0].0));
        });
        assert_eq!(std::fs::read_dir(base).unwrap().count(), 2);
    }

    #[test]
    fn cancellation_interrupts_lock_waits() {
        let (artifact, bytes, entries) = payload();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("cache");
        std::fs::create_dir(&base).unwrap();
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(base.join(format!("{}.lock", artifact.key())))
            .unwrap();
        lock.lock().unwrap();
        let token = CancellationToken::new();
        std::thread::scope(|scope| {
            let task = scope.spawn(|| prepare(&artifact, &bytes, &entries, &base, &token));
            std::thread::sleep(Duration::from_millis(30));
            token.cancel();
            assert!(
                task.join()
                    .unwrap()
                    .unwrap_err()
                    .to_string()
                    .contains("cancelled")
            );
        });
        assert!(!base.join(artifact.key()).exists());
    }

    #[test]
    fn cancellation_and_failed_extraction_never_publish() {
        let (artifact, bytes, mut entries) = payload();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("cache");
        let token = CancellationToken::new();
        token.cancel();
        assert!(prepare(&artifact, &bytes, &entries, &base, &token).is_err());
        entries[0].sha256 = "wrong".into();
        assert!(
            prepare(
                &artifact,
                &bytes,
                &entries,
                &base,
                &CancellationToken::new()
            )
            .is_err()
        );
        assert!(!base.join(artifact.key()).exists());
        assert_eq!(std::fs::read_dir(&base).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn cache_links_never_redirect_writes() {
        let (artifact, bytes, entries) = payload();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("cache");
        std::fs::create_dir(&base).unwrap();
        let outside = temp.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("sentinel"), "keep").unwrap();
        std::os::unix::fs::symlink(&outside, base.join(artifact.key())).unwrap();
        assert!(
            prepare(
                &artifact,
                &bytes,
                &entries,
                &base,
                &CancellationToken::new()
            )
            .is_err()
        );
        assert_eq!(
            std::fs::read_to_string(outside.join("sentinel")).unwrap(),
            "keep"
        );
    }
}

#[cfg(windows)]
fn private_windows_cache(path: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::{
            Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW,
            DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION, SetFileSecurityW,
        },
    };
    // Protected, inheritable ACL: only the owner and SYSTEM may access tools.
    let sddl: Vec<u16> = "D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut descriptor = std::ptr::null_mut();
    unsafe {
        ensure!(
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                1,
                &mut descriptor,
                std::ptr::null_mut()
            ) != 0,
            "creating private Go cache ACL: {}",
            std::io::Error::last_os_error()
        );
        let result = SetFileSecurityW(
            path.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        );
        let error = std::io::Error::last_os_error();
        LocalFree(descriptor);
        ensure!(result != 0, "setting private Go cache ACL: {error}");
    }
    Ok(())
}
