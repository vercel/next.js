//! Removal of the entries of an output directory that were not written in the current session.
//! See [`DiskFileSystem::remove_files_not_written_in_session`].

use std::{
    fs::FileType,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::{Context, Result};
use futures::future::join_all;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::RcStr;

use crate::{DiskFileSystem, retry::retry_blocking};

/// Options for [`DiskFileSystem::remove_files_not_written_in_session`].
#[derive(Debug, Default, Clone)]
pub struct RemoveUnwrittenOptions {
    /// Paths relative to the directory, using `/` as separator, of entries that are kept even
    /// though they were not written by this filesystem in the current session, e.g. because they
    /// were written by another process. Kept directories are left untouched as a whole: they are
    /// neither traversed nor removed.
    pub keep: FxHashSet<RcStr>,
}

/// Statistics of removing the entries not written in the current session.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct RemoveUnwrittenStats {
    /// Number of removed files and symlinks.
    pub removed_files: usize,
    /// Number of removed directories.
    pub removed_directories: usize,
}

/// The result of [`DiskFileSystem::remove_files_not_written_in_session`]: the directories that
/// had no entries left after removing the files not written in the current session.
///
/// They are not removed right away, as concurrent writes might still create files in them (or
/// might have created the directory to write a file into it).
#[must_use]
pub struct UnwrittenDirectories {
    /// The directories in post-order, i.e. children before their parents.
    directories: Vec<PathBuf>,
    removed_files: usize,
}

impl UnwrittenDirectories {
    /// Removes the directories that are (still) empty. Must be called after all writes into the
    /// directory are finished.
    pub async fn remove_empty(self) -> Result<RemoveUnwrittenStats> {
        let count = self.directories.len();
        let mut removed_directories = 0;
        async {
            // Children come before their parents, so this removes nested empty directories.
            for dir in self.directories {
                if remove_empty_dir(&dir).await? {
                    removed_directories += 1;
                }
            }
            anyhow::Ok(())
        }
        .instrument(tracing::info_span!("remove empty directories", count))
        .await?;
        Ok(RemoveUnwrittenStats {
            removed_files: self.removed_files,
            removed_directories,
        })
    }
}

struct SweepState {
    fs: DiskFileSystem,
    options: RemoveUnwrittenOptions,
    removed_files: AtomicUsize,
}

pub(crate) async fn remove_files_not_written_in_session(
    fs: DiskFileSystem,
    dir: PathBuf,
    options: RemoveUnwrittenOptions,
) -> Result<UnwrittenDirectories> {
    let ctx = Arc::new(SweepState {
        fs,
        options,
        removed_files: AtomicUsize::new(0),
    });
    let mut directories = Vec::new();
    // The root directory itself is never removed.
    sweep_dir(ctx.clone(), dir, RcStr::default(), &mut directories).await?;
    Ok(UnwrittenDirectories {
        directories,
        removed_files: ctx.removed_files.load(Ordering::Relaxed),
    })
}

/// Sweeps `dir` (with the relative path `relative`), and returns whether it has no entries left
/// (as far as observed). Appends the subdirectories that have no entries left (and are not
/// kept) to `empty_directories`, in post-order.
///
/// Subdirectories are swept in parallel on separate tasks. All of them are awaited, even when
/// an error occurs, so no removal continues after this returns. File system operations are
/// blocking, but short, like elsewhere in this crate.
async fn sweep_dir(
    ctx: Arc<SweepState>,
    dir: PathBuf,
    relative: RcStr,
    empty_directories: &mut Vec<PathBuf>,
) -> Result<bool> {
    let entries = match read_dir(&dir).await {
        Ok(entries) => entries,
        // The directory may have been removed concurrently, which is fine.
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(true),
        Err(err) => return Err(err).with_context(|| format!("reading directory {dir:?} failed")),
    };

    let mut is_empty = true;
    let mut subdirectories = Vec::new();
    let mut first_error = None;
    for (name, file_type) in entries {
        let path = dir.join(&name);
        let relative = if relative.is_empty() {
            RcStr::from(name)
        } else {
            RcStr::from(format!("{relative}/{name}"))
        };
        if ctx.options.keep.contains(&relative) {
            is_empty = false;
            continue;
        }
        // `file_type` comes from `read_dir`, so it doesn't follow symlinks: links are removed, not
        // their targets.
        if file_type.is_dir() {
            subdirectories.push(tokio::spawn({
                let ctx = ctx.clone();
                async move {
                    let mut empty_directories = Vec::new();
                    let child_is_empty =
                        sweep_dir(ctx, path.clone(), relative, &mut empty_directories).await?;
                    if child_is_empty {
                        empty_directories.push(path);
                    }
                    Ok::<_, anyhow::Error>((child_is_empty, empty_directories))
                }
            }));
        } else if ctx.fs.is_written_in_session(&path) {
            is_empty = false;
        } else if let Err(err) = remove(&path, is_dir_link(&path, file_type)).await {
            // Keep going, so all spawned subdirectory sweeps are awaited below.
            is_empty = false;
            first_error.get_or_insert(err);
        } else {
            ctx.removed_files.fetch_add(1, Ordering::Relaxed);
        }
    }

    for result in join_all(subdirectories).await {
        match result
            .context("sweeping a subdirectory panicked")
            .and_then(|result| result)
        {
            Ok((removable, child_empty_directories)) => {
                if !removable {
                    is_empty = false;
                }
                empty_directories.extend(child_empty_directories);
            }
            Err(err) => {
                is_empty = false;
                first_error.get_or_insert(err);
            }
        }
    }
    if let Some(err) = first_error {
        return Err(err);
    }
    Ok(is_empty)
}

async fn read_dir(dir: &Path) -> io::Result<Vec<(String, FileType)>> {
    retry_blocking(|| {
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().into_string().map_err(|name| {
                io::Error::new(
                    ErrorKind::InvalidData,
                    format!("file name {name:?} is not valid unicode"),
                )
            })?;
            match entry.file_type() {
                Ok(file_type) => entries.push((name, file_type)),
                // The entry may have been removed concurrently.
                Err(err) if err.kind() == ErrorKind::NotFound => {}
                Err(err) => return Err(err),
            }
        }
        Ok(entries)
    })
    .await
}

/// Directory symlinks and junction points need to be removed with `remove_dir` on Windows.
#[cfg(windows)]
fn is_dir_link(path: &Path, file_type: FileType) -> bool {
    use std::os::windows::fs::FileTypeExt;
    file_type.is_symlink_dir()
        || (file_type.is_symlink() && crate::windows::is_link_junction_point(path).unwrap_or(false))
}

#[cfg(not(windows))]
fn is_dir_link(_path: &Path, _file_type: FileType) -> bool {
    false
}

async fn remove(path: &Path, is_dir: bool) -> Result<()> {
    retry_blocking(|| {
        if is_dir {
            std::fs::remove_dir(path)
        } else {
            std::fs::remove_file(path)
        }
    })
    .await
    .or_else(|err| {
        if err.kind() == ErrorKind::NotFound {
            Ok(())
        } else {
            Err(err)
        }
    })
    .with_context(|| format!("removing {path:?} failed"))
}

/// Removes `dir` if it is empty. Returns whether it was removed.
async fn remove_empty_dir(dir: &Path) -> Result<bool> {
    match retry_blocking(|| std::fs::remove_dir(dir)).await {
        Ok(()) => Ok(true),
        // Removed concurrently, or not empty (anymore), e.g. because a file was written into it.
        Err(err)
            if matches!(
                err.kind(),
                ErrorKind::NotFound | ErrorKind::DirectoryNotEmpty
            ) =>
        {
            Ok(false)
        }
        Err(err) => Err(err).with_context(|| format!("removing directory {dir:?} failed")),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use rustc_hash::FxHashSet;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{
        Effects, ReadRef, Vc, read_strongly_consistent_and_apply_effects,
        read_strongly_consistent_and_apply_effects_concurrently_with, take_effects,
    };
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use crate::{
        DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, File, FileContent, FileSystem,
        FileSystemPath, RemoveUnwrittenOptions, RemoveUnwrittenStats,
    };

    /// A turbo-tasks function, so that all callers share the same filesystem instance.
    #[turbo_tasks::function]
    fn test_fs(root: RcStr) -> Vc<DiskFileSystem> {
        DiskFileSystem::new_with_options(
            rcstr!("test"),
            Vc::cell(root),
            Vec::new(),
            DiskWatcherConfig::default(),
            DiskFileSystemMap::empty(),
        )
    }

    /// Writes `content` to `path` in the output directory, or removes it if `content` is empty.
    fn write(out: &FileSystemPath, path: &str, content: &str) -> anyhow::Result<Vc<()>> {
        let content = if content.is_empty() {
            FileContent::NotFound
        } else {
            FileContent::Content(File::from_bytes(content.as_bytes().to_vec()))
        };
        Ok(out.join(path)?.write(content.cell()))
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_outputs_operation(root: RcStr) -> anyhow::Result<()> {
        let out = test_fs(root).root().await?.join("out")?;
        // a new file in an existing directory
        write(&out, "server/new.js", "new")?.await?;
        // a file that already exists with the same content: the write is skipped
        write(&out, "server/unchanged.js", "unchanged")?.await?;
        // a file that already exists with different content
        write(&out, "server/changed.js", "changed")?.await?;
        // a file in a new directory
        write(&out, "static/new-dir/a.js", "a")?.await?;
        // a new file in a directory that only contains stale files
        write(&out, "static/chunks/a.js", "a")?.await?;
        // a file that is removed
        write(&out, "server/removed.js", "")?.await?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_outputs_effects_operation(root: RcStr) -> anyhow::Result<Vc<Effects>> {
        let op = write_outputs_operation(root);
        op.read_strongly_consistent().await?;
        Ok(take_effects(op).await?.cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_file_operation(root: RcStr, path: RcStr, content: RcStr) -> anyhow::Result<()> {
        let out = test_fs(root).root().await?.join("out")?;
        write(&out, &path, &content)?.await?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_file_effects_operation(
        root: RcStr,
        path: RcStr,
        content: RcStr,
    ) -> anyhow::Result<Vc<Effects>> {
        let op = write_file_operation(root, path, content);
        op.read_strongly_consistent().await?;
        Ok(take_effects(op).await?.cell())
    }

    #[turbo_tasks::function(operation, root)]
    fn test_fs_operation(root: RcStr) -> Vc<DiskFileSystem> {
        test_fs(root)
    }

    #[turbo_tasks::function(operation, root)]
    async fn out_dir_operation(root: RcStr) -> anyhow::Result<Vc<FileSystemPath>> {
        Ok(test_fs(root).root().await?.join("out")?.cell())
    }

    fn write_file(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn list(dir: &Path, prefix: &str, result: &mut Vec<String>) {
        let mut entries: Vec<_> = fs::read_dir(dir).unwrap().map(|e| e.unwrap()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = format!("{prefix}{}", entry.file_name().to_str().unwrap());
            if entry.file_type().unwrap().is_dir() {
                result.push(format!("{name}/"));
                list(&entry.path(), &format!("{name}/"), result);
            } else {
                result.push(name);
            }
        }
    }

    fn new_turbo_tasks() -> std::sync::Arc<turbo_tasks::TurboTasks<TurboTasksBackend>> {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
    }

    async fn test_fs_and_out(
        root: RcStr,
    ) -> anyhow::Result<(ReadRef<DiskFileSystem>, ReadRef<FileSystemPath>)> {
        let fs = test_fs_operation(root.clone())
            .read_strongly_consistent()
            .await?;
        let out = out_dir_operation(root).read_strongly_consistent().await?;
        Ok((fs, out))
    }

    /// Removes the stale files concurrently to applying the writes, and the empty directories
    /// afterwards.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn removes_entries_not_written_in_session() {
        let scratch = tempfile::tempdir().unwrap();
        let root_path = scratch.path();
        let out = root_path.join("out");
        // Output of a previous session
        write_file(&out.join("server/unchanged.js"), "unchanged");
        write_file(&out.join("server/changed.js"), "previous");
        write_file(&out.join("server/removed.js"), "removed");
        write_file(&out.join("server/stale.js"), "stale");
        write_file(&out.join("server/stale-dir/nested/stale.js"), "stale");
        write_file(&out.join("static/chunks/stale.js"), "stale");
        write_file(&out.join("stale-top-level.json"), "stale");
        fs::create_dir_all(out.join("stale-empty-dir")).unwrap();
        // Written by someone else during this session
        write_file(&out.join("external.json"), "external");
        fs::create_dir_all(out.join("external-empty-dir")).unwrap();
        // Kept as a whole, including files that were not written in this session
        write_file(&out.join("cache/data"), "cache");
        write_file(&out.join("cache/nested/data"), "cache");
        // A kept nested directory: its unwritten siblings are still removed
        write_file(&out.join("static/kept/data"), "kept");
        write_file(&out.join("static/stale-sibling.js"), "stale");
        // A symlink to a directory outside of the output, which must not be followed
        let outside = root_path.join("outside");
        write_file(&outside.join("keep.txt"), "keep");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, out.join("server/link")).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::junction_point(&outside, out.join("server/link")).unwrap();

        let root = RcStr::from(root_path.to_str().unwrap());
        let unchanged_mtime = fs::metadata(out.join("server/unchanged.js"))
            .unwrap()
            .modified()
            .unwrap();
        let tt = new_turbo_tasks();
        let stats = tt
            .run_once(async move {
                let (fs, out) = test_fs_and_out(root.clone()).await?;
                let (_, unwritten_directories) =
                    read_strongly_consistent_and_apply_effects_concurrently_with(
                        write_outputs_effects_operation(root),
                        |e| e,
                        || async {
                            let out_sys = fs.to_sys_path_raw(&out);
                            // The writes are registered before they are applied, so these are
                            // known as written even when the sweep runs before the writes.
                            for path in [
                                "server/new.js",
                                "server/unchanged.js",
                                "server/changed.js",
                                "static/chunks/a.js",
                            ] {
                                assert!(fs.is_written_in_session(&out_sys.join(path)), "{path}");
                            }
                            assert!(!fs.is_written_in_session(&out_sys.join("server/stale.js")));
                            fs.remove_files_not_written_in_session(
                                &out,
                                RemoveUnwrittenOptions {
                                    keep: FxHashSet::from_iter([
                                        rcstr!("cache"),
                                        rcstr!("static/kept"),
                                        rcstr!("external.json"),
                                        rcstr!("external-empty-dir"),
                                    ]),
                                },
                            )
                            .await
                        },
                    )
                    .await?;
                let out_sys = fs.to_sys_path_raw(&out);
                assert!(fs.is_written_in_session(&out_sys.join("server/new.js")));
                assert!(!fs.is_written_in_session(&out_sys.join("server/removed.js")));
                unwritten_directories.remove_empty().await
            })
            .await
            .unwrap();

        let mut entries = Vec::new();
        list(&out, "", &mut entries);
        assert_eq!(
            entries,
            vec![
                "cache/",
                "cache/data",
                "cache/nested/",
                "cache/nested/data",
                "external-empty-dir/",
                "external.json",
                "server/",
                "server/changed.js",
                "server/new.js",
                "server/unchanged.js",
                "static/",
                "static/chunks/",
                "static/chunks/a.js",
                "static/kept/",
                "static/kept/data",
                "static/new-dir/",
                "static/new-dir/a.js",
            ]
        );
        assert_eq!(
            stats,
            RemoveUnwrittenStats {
                // stale.js, stale-dir/nested/stale.js, static/chunks/stale.js,
                // static/stale-sibling.js, stale-top-level.json, link
                removed_files: 6,
                // stale-dir/nested, stale-dir, stale-empty-dir
                removed_directories: 3,
            }
        );
        assert_eq!(
            fs::read_to_string(out.join("server/changed.js")).unwrap(),
            "changed"
        );
        assert_eq!(
            fs::read_to_string(outside.join("keep.txt")).unwrap(),
            "keep"
        );
        // The unchanged file was not rewritten, but still counts as written.
        assert_eq!(
            fs::metadata(out.join("server/unchanged.js"))
                .unwrap()
                .modified()
                .unwrap(),
            unchanged_mtime
        );
    }

    /// A removal and a write of the same file are never deduplicated against each other, and
    /// whether the file counts as written follows the last applied effect.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn removal_and_write_of_the_same_file() {
        let scratch = tempfile::tempdir().unwrap();
        let root_path = scratch.path();
        let file = root_path.join("out/file.js");
        let root = RcStr::from(root_path.to_str().unwrap());
        let tt = new_turbo_tasks();
        tt.run_once(async move {
            let (fs, out) = test_fs_and_out(root.clone()).await?;
            let file_sys = fs.to_sys_path_raw(&out).join("file.js");
            let apply = |content: &'static str| {
                read_strongly_consistent_and_apply_effects(
                    write_file_effects_operation(
                        root.clone(),
                        rcstr!("file.js"),
                        RcStr::from(content),
                    ),
                    |e| e,
                )
            };

            assert!(!fs.is_written_in_session(&file_sys));
            apply("").await?;
            assert!(!fs.is_written_in_session(&file_sys));
            assert!(!file.exists());

            apply("content").await?;
            assert!(fs.is_written_in_session(&file_sys));
            assert_eq!(fs::read_to_string(&file)?, "content");

            apply("").await?;
            assert!(!fs.is_written_in_session(&file_sys));
            assert!(!file.exists());

            apply("content").await?;
            assert!(fs.is_written_in_session(&file_sys));
            assert_eq!(fs::read_to_string(&file)?, "content");
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Pending writes (registered, but not applied yet) are kept by the sweep, even when the last
    /// applied effect for the path was a removal. Directories that receive a file after the files
    /// were swept are not removed.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn keeps_pending_writes() {
        let scratch = tempfile::tempdir().unwrap();
        let root_path = scratch.path();
        let out = root_path.join("out");
        let root = RcStr::from(root_path.to_str().unwrap());
        let tt = new_turbo_tasks();
        let stats = tt
            .run_once({
                let out = out.clone();
                async move {
                    let (fs, out_path) = test_fs_and_out(root.clone()).await?;
                    let out_sys = fs.to_sys_path_raw(&out_path);
                    // A removal is applied for `removed-then-written.js` in this session...
                    read_strongly_consistent_and_apply_effects(
                        write_file_effects_operation(
                            root.clone(),
                            rcstr!("removed-then-written.js"),
                            rcstr!(""),
                        ),
                        |e| e,
                    )
                    .await?;
                    assert!(!fs.is_written_in_session(&out_sys.join("removed-then-written.js")));
                    // ...and a write of it is pending, while the file still has its previous
                    // content.
                    write_file(&out.join("removed-then-written.js"), "previous");
                    fs.register_write_for_testing(
                        &out_sys.join("removed-then-written.js"),
                        Some(b"new"),
                    );
                    // A pending write of a file in a new directory, which doesn't exist yet.
                    fs.register_write_for_testing(&out_sys.join("new-dir/new.js"), Some(b"new"));
                    // A pending write of a file that exists from a previous session.
                    write_file(&out.join("pending.js"), "previous");
                    fs.register_write_for_testing(&out_sys.join("pending.js"), Some(b"new"));
                    // A pending removal: the effect removes the file, the sweep doesn't need to.
                    write_file(&out.join("pending-removal.js"), "previous");
                    fs.register_write_for_testing(&out_sys.join("pending-removal.js"), None);
                    // Stale files
                    write_file(&out.join("stale.js"), "stale");
                    write_file(&out.join("stale-dir/stale.js"), "stale");
                    write_file(&out.join("receives-file/stale.js"), "stale");

                    for path in [
                        "removed-then-written.js",
                        "pending.js",
                        "pending-removal.js",
                    ] {
                        assert!(fs.is_written_in_session(&out_sys.join(path)), "{path}");
                    }
                    let unwritten_directories = fs
                        .remove_files_not_written_in_session(&out_path, Default::default())
                        .await?;
                    // A file is written into a directory after its files were swept.
                    write_file(&out.join("receives-file/new.js"), "new");
                    unwritten_directories.remove_empty().await
                }
            })
            .await
            .unwrap();

        let mut entries = Vec::new();
        list(&out, "", &mut entries);
        assert_eq!(
            entries,
            vec![
                "pending-removal.js",
                "pending.js",
                "receives-file/",
                "receives-file/new.js",
                "removed-then-written.js",
            ]
        );
        assert_eq!(
            stats,
            RemoveUnwrittenStats {
                // stale.js, stale-dir/stale.js, receives-file/stale.js
                removed_files: 3,
                // stale-dir
                removed_directories: 1,
            }
        );
    }
}
