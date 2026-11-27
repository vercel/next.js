//! An effect that removes the entries of a directory that a list of effects doesn't write. See
//! [`DiskFileSystem::with_clear_effect`].

use std::{
    any::Any,
    fs::FileType,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::{Context, Result};
use async_trait::async_trait;
use futures::future::join_all;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ApplyError, CapturedEffect, CapturedEffects, Effects, NonLocalValue};

use crate::{
    DiskFileSystem, FileSystemPath,
    disk::{CapturedWriteEffect, CapturedWriteLinkEffect, DiskFileSystemInner},
    error::AnyhowWrapper,
    retry::retry_blocking,
};

impl DiskFileSystem {
    /// Returns `effects` plus an effect that removes all entries in `dir` that the effects don't
    /// write (e.g. output of a previous session), which is applied together with (and
    /// concurrently to) the effects.
    ///
    /// Kept are:
    /// - the paths written (or removed) by the write and link effects of this filesystem in
    ///   `effects`, including writes that are skipped because the file already has the content,
    /// - `keep`: paths relative to `dir`, using `/` as separator, of entries that are left
    ///   untouched as a whole (directories are neither traversed nor removed),
    /// - the ancestor directories of both, which are traversed.
    ///
    /// Everything else is removed: files and links (which are never followed), and directories
    /// as a whole. As the ancestor directories of written paths are never removed, this can run
    /// concurrently to the writes. `dir` itself is never removed.
    ///
    /// The paths are only collected when the effect is applied, and are not retained afterwards.
    pub fn with_clear_effect(
        &self,
        effects: &Effects,
        dir: &FileSystemPath,
        keep: impl IntoIterator<Item = RcStr>,
    ) -> Effects {
        effects.with_additional_effect(Box::new(ClearEffect {
            inner: self.inner.clone(),
            dir: Arc::new(self.to_sys_path_raw(dir)),
            keep: Arc::new(keep.into_iter().collect()),
            effects: effects.captured(),
        }))
    }
}

/// See [`DiskFileSystem::with_clear_effect`].
#[derive(NonLocalValue)]
struct ClearEffect {
    inner: Arc<DiskFileSystemInner>,
    dir: Arc<PathBuf>,
    keep: Arc<FxHashSet<RcStr>>,
    /// The effects applied together with this one.
    effects: CapturedEffects,
}

#[async_trait]
impl CapturedEffect for ClearEffect {
    fn key(&self) -> Box<[u8]> {
        // File effects use the absolute path as key, which never contains a NUL byte.
        let mut key = b"\0clear\0".to_vec();
        key.extend_from_slice(self.dir.as_os_str().as_encoded_bytes());
        key.into_boxed_slice()
    }

    fn value_hash(&self) -> u128 {
        // Never deduplicated against an earlier application: other entries might have been
        // created in the meantime.
        0
    }

    async fn apply(&self) -> Result<(), ApplyError> {
        let span = tracing::info_span!(
            "remove unwritten entries",
            removed_files = tracing::field::Empty,
            removed_directories = tracing::field::Empty
        );
        async {
            let state = Arc::new(self.state());
            let result = clear_dir(state.clone(), (*self.dir).clone(), RcStr::default()).await;
            span.record("removed_files", state.removed_files.load(Ordering::Relaxed));
            span.record(
                "removed_directories",
                state.removed_directories.load(Ordering::Relaxed),
            );
            result
        }
        .instrument(span.clone())
        .await
        .map_err(|err| ApplyError::Failed(Arc::new(AnyhowWrapper::from(err))))
    }
}

impl ClearEffect {
    /// Collects the written paths of the effects. The paths are shared with the effects, not
    /// copied.
    fn state(&self) -> ClearState {
        let mut written = Vec::new();
        for effect in self.effects.iter() {
            let effect: &dyn Any = effect;
            let (full_path, inner) =
                if let Some(effect) = effect.downcast_ref::<CapturedWriteEffect>() {
                    (&effect.full_path, &effect.inner)
                } else if let Some(effect) = effect.downcast_ref::<CapturedWriteLinkEffect>() {
                    (&effect.full_path, &effect.inner)
                } else {
                    continue;
                };
            if Arc::ptr_eq(inner, &self.inner)
                && full_path.starts_with(&*self.dir)
                && **full_path != *self.dir
            {
                written.push(full_path.clone());
            }
        }
        // `Path`s are ordered by their components, so the descendants of a path directly follow
        // it.
        written.sort_unstable();
        written.dedup();
        let mut keep_ancestors = FxHashSet::default();
        for path in self.keep.iter() {
            let mut end = path.len();
            while let Some(pos) = path[..end].rfind('/') {
                if !keep_ancestors.insert(RcStr::from(&path[..pos])) {
                    break;
                }
                end = pos;
            }
        }
        ClearState {
            written,
            keep: self.keep.clone(),
            keep_ancestors,
            removed_files: AtomicUsize::new(0),
            removed_directories: AtomicUsize::new(0),
        }
    }
}

struct ClearState {
    /// The written (or removed) paths, sorted.
    written: Vec<Arc<PathBuf>>,
    /// The kept paths, relative to the cleared directory.
    keep: Arc<FxHashSet<RcStr>>,
    /// The ancestor directories of `keep`, relative to the cleared directory.
    keep_ancestors: FxHashSet<RcStr>,
    removed_files: AtomicUsize,
    removed_directories: AtomicUsize,
}

/// How a path relates to the written paths.
#[derive(PartialEq, Eq)]
enum Written {
    /// The path is written.
    Path,
    /// Paths below the path are written.
    Ancestor,
    No,
}

impl ClearState {
    fn written(&self, path: &Path) -> Written {
        match self
            .written
            .binary_search_by(|written| written.as_path().cmp(path))
        {
            Ok(_) => Written::Path,
            // The first path after `path` is below it, if any path is.
            Err(idx) => match self.written.get(idx) {
                Some(next) if next.starts_with(path) => Written::Ancestor,
                _ => Written::No,
            },
        }
    }
}

/// Clears `dir` (with the path `relative` relative to the cleared directory).
///
/// Directories that are traversed are cleared in parallel on separate tasks. All of them are
/// awaited, even when an error occurs, so no removal continues after this returns. File system
/// operations are blocking, but short, like elsewhere in this crate.
async fn clear_dir(state: Arc<ClearState>, dir: PathBuf, relative: RcStr) -> Result<()> {
    let entries = match read_dir(&dir).await {
        Ok(entries) => entries,
        // Nothing to clear.
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err).with_context(|| format!("reading directory {dir:?} failed")),
    };

    let mut subdirectories = Vec::new();
    let mut first_error = None;
    for (name, file_type) in entries {
        let path = dir.join(&name);
        let relative = if relative.is_empty() {
            RcStr::from(name)
        } else {
            RcStr::from(format!("{relative}/{name}"))
        };
        let written = state.written(&path);
        if state.keep.contains(&relative) || written == Written::Path {
            // When a written file is in the way of a written directory or the other way around,
            // the write replaces it.
            continue;
        }
        // `file_type` comes from `read_dir`, so it doesn't follow links: links are removed, not
        // their targets.
        let is_ancestor = written == Written::Ancestor || state.keep_ancestors.contains(&relative);
        let result = if is_ancestor {
            if file_type.is_dir() {
                subdirectories.push(tokio::spawn(clear_dir(state.clone(), path, relative)));
            }
            continue;
        } else if file_type.is_dir() {
            remove_dir_all(&path).await.map(|()| {
                state.removed_directories.fetch_add(1, Ordering::Relaxed);
            })
        } else {
            remove(&path, is_dir_link(&path, file_type))
                .await
                .map(|()| {
                    state.removed_files.fetch_add(1, Ordering::Relaxed);
                })
        };
        if let Err(err) = result {
            // Keep going, so all spawned subdirectory clears are awaited below.
            first_error.get_or_insert(err);
        }
    }

    for result in join_all(subdirectories).await {
        if let Err(err) = result
            .context("clearing a subdirectory panicked")
            .and_then(|result| result)
        {
            first_error.get_or_insert(err);
        }
    }
    match first_error {
        Some(err) => Err(err),
        None => Ok(()),
    }
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

async fn remove(path: &Path, is_dir_link: bool) -> Result<()> {
    retry_blocking(|| {
        if is_dir_link {
            std::fs::remove_dir(path)
        } else {
            std::fs::remove_file(path)
        }
    })
    .await
    .or_else(ignore_not_found)
    .with_context(|| format!("removing {path:?} failed"))
}

/// Removes a directory with its content. Links inside of it are removed, not followed.
async fn remove_dir_all(path: &Path) -> Result<()> {
    retry_blocking(|| std::fs::remove_dir_all(path))
        .await
        .or_else(ignore_not_found)
        .with_context(|| format!("removing directory {path:?} failed"))
}

fn ignore_not_found(err: io::Error) -> io::Result<()> {
    if err.kind() == ErrorKind::NotFound {
        Ok(())
    } else {
        Err(err)
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{Effects, Vc, read_strongly_consistent_and_apply_effects, take_effects};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use crate::{
        DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, File, FileContent, FileSystem,
        FileSystemPath,
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
    async fn write_outputs_operation(root: RcStr, conflicting: bool) -> anyhow::Result<()> {
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
        if conflicting {
            write(&out, "server/new.js", "conflicting")?.await?;
        }
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_outputs_with_clear_effect_operation(
        root: RcStr,
        keep: Vec<RcStr>,
        conflicting: bool,
    ) -> anyhow::Result<Vc<Effects>> {
        let op = write_outputs_operation(root.clone(), conflicting);
        op.read_strongly_consistent().await?;
        let effects = take_effects(op).await?;
        let fs = test_fs(root.clone()).await?;
        let out = test_fs(root).root().await?.join("out")?;
        Ok(fs.with_clear_effect(&effects, &out, keep).cell())
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

    fn list_out(out: &Path) -> Vec<String> {
        let mut entries = Vec::new();
        list(out, "", &mut entries);
        entries
    }

    fn new_turbo_tasks() -> std::sync::Arc<turbo_tasks::TurboTasks<TurboTasksBackend>> {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
    }

    /// Removes everything that is not written, kept, or an ancestor of either, concurrently to
    /// applying the writes.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn removes_unwritten_entries() {
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
        // Entries whose names start with the name of a written entry
        write_file(&out.join("server/new.js.map"), "stale");
        write_file(&out.join("static/new-dir-stale/a.js"), "stale");
        write_file(&out.join("static/new-dir.js"), "stale");
        fs::create_dir_all(out.join("stale-empty-dir")).unwrap();
        // Kept as a whole, including files that are not written
        write_file(&out.join("cache/data"), "cache");
        write_file(&out.join("cache/nested/data"), "cache");
        fs::create_dir_all(out.join("kept-empty-dir")).unwrap();
        // A kept nested directory: its unwritten siblings are still removed
        write_file(&out.join("static/kept/data"), "kept");
        write_file(&out.join("static/stale-sibling.js"), "stale");
        // A kept entry in a directory without any written files
        write_file(&out.join("deep/kept/data"), "kept");
        write_file(&out.join("deep/stale.js"), "stale");
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
        let expected = vec![
            "cache/",
            "cache/data",
            "cache/nested/",
            "cache/nested/data",
            "deep/",
            "deep/kept/",
            "deep/kept/data",
            "kept-empty-dir/",
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
        ];
        let tt = new_turbo_tasks();
        tt.run_once({
            let out = out.clone();
            async move {
                let keep = vec![
                    rcstr!("cache"),
                    rcstr!("kept-empty-dir"),
                    rcstr!("static/kept"),
                    rcstr!("deep/kept"),
                ];
                read_strongly_consistent_and_apply_effects(
                    write_outputs_with_clear_effect_operation(root.clone(), keep.clone(), false),
                    |e| e,
                )
                .await?;
                assert_eq!(list_out(&out), expected);

                // Applying again changes nothing.
                write_file(&out.join("server/stale-again.js"), "stale");
                read_strongly_consistent_and_apply_effects(
                    write_outputs_with_clear_effect_operation(root, keep, false),
                    |e| e,
                )
                .await?;
                assert_eq!(list_out(&out), expected);
                anyhow::Ok(())
            }
        })
        .await
        .unwrap();

        assert_eq!(
            fs::read_to_string(out.join("server/changed.js")).unwrap(),
            "changed"
        );
        assert_eq!(
            fs::read_to_string(outside.join("keep.txt")).unwrap(),
            "keep"
        );
        // The unchanged file was not rewritten.
        assert_eq!(
            fs::metadata(out.join("server/unchanged.js"))
                .unwrap()
                .modified()
                .unwrap(),
            unchanged_mtime
        );
    }

    /// Conflicting effects fail before anything is applied, including the clear effect.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn conflicting_effects_are_not_applied() {
        let scratch = tempfile::tempdir().unwrap();
        let root_path = scratch.path();
        let out = root_path.join("out");
        write_file(&out.join("stale.js"), "stale");
        let root = RcStr::from(root_path.to_str().unwrap());
        let tt = new_turbo_tasks();
        let result = tt
            .run_once(async move {
                read_strongly_consistent_and_apply_effects(
                    write_outputs_with_clear_effect_operation(root, Vec::new(), true),
                    |e| e,
                )
                .await?;
                anyhow::Ok(())
            })
            .await;
        assert!(
            format!("{:#}", result.unwrap_err()).contains("conflicting effects"),
            "expected a conflict error"
        );
        assert_eq!(list_out(&out), vec!["stale.js"]);
    }
}
