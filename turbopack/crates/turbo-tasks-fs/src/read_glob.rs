use anyhow::{Result, bail};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, Vc, turbobail};

use crate::{
    DirectoryContent, DirectoryEntry, FileSystem, FileSystemPath, LinkContent, LinkType, glob::Glob,
};

#[turbo_tasks::value]
#[derive(Default, Debug)]
pub struct ReadGlobResult {
    pub results: FxHashMap<RcStr, DirectoryEntry>,
    pub inner: FxHashMap<RcStr, ResolvedVc<ReadGlobResult>>,
}

/// Reads matches of a glob pattern. Symlinks are not resolved (and returned as-is)
///
/// DETERMINISM: Result is in random order. Either sort result or do not depend
/// on the order.
#[turbo_tasks::function(fs)]
pub async fn read_glob(directory: FileSystemPath, glob: Vc<Glob>) -> Result<Vc<ReadGlobResult>> {
    turbo_tasks::read!(read_glob_internal("", directory, glob))
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vc<ReadGlobResult>> {
    turbo_tasks::read!(read_glob_internal(&prefix, directory, glob))
}

turbo_tasks::dual_fn! {
    // The `prefix` represents the relative directory path where symlinks are not resolve.
    fn read_glob_internal(
        prefix: &str,
        directory: FileSystemPath,
        glob: Vc<Glob>,
    ) -> Result<Vc<ReadGlobResult>> {
        let dir = turbo_tasks::read!(directory.read_dir())?;
        let mut result = ReadGlobResult::default();
        let glob_value = turbo_tasks::read!(glob)?;
        let handle_file = |result: &mut ReadGlobResult,
                           entry_path: &RcStr,
                           segment: &RcStr,
                           entry: &DirectoryEntry| {
            if glob_value.matches(entry_path) {
                result.results.insert(segment.clone(), entry.clone());
            }
        };
        // Returns the recursive read to register under the entry's segment (a plain
        // closure — creating the task-call `Vc` is synchronous; the caller `read!`s
        // it, which is the mode-dependent part).
        let handle_dir = |entry_path: RcStr, path: &FileSystemPath| {
            glob_value
                .can_match_in_directory(&entry_path)
                .then(|| read_glob_inner(entry_path, path.clone(), glob))
        };

        match &*dir {
            DirectoryContent::Entries(entries) => {
                for (segment, entry) in entries.iter() {
                    let entry_path: RcStr = if prefix.is_empty() {
                        segment.clone()
                    } else {
                        format!("{prefix}/{segment}").into()
                    };

                    match entry {
                        DirectoryEntry::File(_) => {
                            handle_file(&mut result, &entry_path, segment, entry);
                        }
                        DirectoryEntry::Directory(path) => {
                            // Add the directory to `results` if it is a whole match of the glob
                            handle_file(&mut result, &entry_path, segment, entry);
                            // Recursively handle the directory
                            if let Some(inner) = handle_dir(entry_path, path) {
                                result.inner.insert(
                                    segment.clone(),
                                    turbo_tasks::read!(inner.to_resolved())?,
                                );
                            }
                        }
                        DirectoryEntry::Symlink(path) => {
                            if let LinkContent::Link { link_type, .. } = &*turbo_tasks::read!(path.read_link())? {
                                if link_type.contains(LinkType::DIRECTORY) {
                                    // Ensure that there are no infinite link loops, but don't
                                    // resolve
                                    turbo_tasks::read!(resolve_symlink_safely(entry.clone()))?;

                                    // Add the directory to `results` if it is a whole match of
                                    // the glob
                                    handle_file(&mut result, &entry_path, segment, entry);
                                    // Recursively handle the directory
                                    if let Some(inner) = handle_dir(entry_path, path) {
                                        result.inner.insert(
                                            segment.clone(),
                                            turbo_tasks::read!(inner.to_resolved())?,
                                        );
                                    }
                                } else {
                                    handle_file(&mut result, &entry_path, segment, entry);
                                }
                            }
                        }
                        DirectoryEntry::Other(_) | DirectoryEntry::Error(_) => continue,
                    }
                }
            }
            DirectoryContent::NotFound => {}
        }
        Ok(ReadGlobResult::cell(result))
    }
}

turbo_tasks::dual_fn! {
/// Resolve a symlink checking for recursion.
fn resolve_symlink_safely(entry: DirectoryEntry) -> Result<DirectoryEntry> {
    let resolved_entry = turbo_tasks::read!(entry.clone().resolve_symlink())?;
    if resolved_entry != entry && matches!(&resolved_entry, DirectoryEntry::Directory(_)) {
        // We followed a symlink to a directory
        // To prevent an infinite loop, which in the case of turbo-tasks would simply
        // exhaust RAM or go into an infinite loop with the GC we need to check for a
        // recursive symlink, we need to check for recursion.

        // Recursion can only occur if the symlink is a directory and points to an
        // ancestor of the current path, which can be detected via a simple prefix
        // match.
        let source_path = entry.path().unwrap();
        if source_path.is_inside_or_equal(&resolved_entry.clone().path().unwrap()) {
            bail!("'{source_path}' is a symlink causes that causes an infinite loop!",)
        }
    }
    Ok(resolved_entry)
}
}

/// Traverses all directories that match the given `glob`.
///
/// This ensures that the calling task will be invalidated
/// whenever the directories or contents of the directories change,
///  but unlike read_glob doesn't accumulate data.
#[turbo_tasks::function(fs)]
pub async fn track_glob(
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    turbo_tasks::read!(track_glob_internal("", directory, glob, include_dot_files))
}

#[turbo_tasks::function(fs)]
async fn track_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    turbo_tasks::read!(track_glob_internal(
        &prefix,
        directory,
        glob,
        include_dot_files
    ))
}

turbo_tasks::dual_fn! {
fn track_glob_internal(
    prefix: &str,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    let dir = turbo_tasks::read!(directory.read_dir())?;
    let glob_value = turbo_tasks::read!(glob)?;
    let fs = turbo_tasks::read!(directory.fs().to_resolved())?;
    let mut reads = Vec::new();
    let mut completions = Vec::new();
    let mut types = Vec::new();
    match &*dir {
        DirectoryContent::Entries(entries) => {
            for (segment, entry) in entries.iter() {
                if !include_dot_files && segment.starts_with('.') {
                    continue;
                }
                // This is redundant with logic inside of `read_dir` but here we track it separately
                // so we don't follow symlinks.
                let entry_path = if prefix.is_empty() {
                    segment.clone()
                } else {
                    format!("{prefix}/{segment}").into()
                };

                match turbo_tasks::read!(resolve_symlink_safely(entry.clone()))? {
                    DirectoryEntry::Directory(path) => {
                        if glob_value.can_match_in_directory(&entry_path) {
                            completions.push(track_glob_inner(
                                entry_path,
                                path.clone(),
                                glob,
                                include_dot_files,
                            ));
                        }
                    }
                    DirectoryEntry::File(path) => {
                        if glob_value.matches(&entry_path) {
                            reads.push(fs.read(path.clone()))
                        }
                    }
                    DirectoryEntry::Symlink(symlink_path) => turbobail!(
                        "resolve_symlink_safely() should have resolved all symlinks or returned \
                         an error, but found unresolved symlink at path: '{entry_path}'. Found \
                         path: '{symlink_path}'. Please report this as a bug.",
                    ),
                    DirectoryEntry::Other(path) => {
                        if glob_value.matches(&entry_path) {
                            types.push(path.get_type())
                        }
                    }
                    // The most likely case of this is actually a symlink resolution error, it is
                    // fine to ignore since the mere act of attempting to resolve it has triggered
                    // the ncecessary dependencies.  If this file is actually a dependency we should
                    // get an error in the actual webpack loader when it reads it.
                    DirectoryEntry::Error(_) => {}
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    // Read all tracked entries (results discarded — this only propagates errors
    // and establishes dependencies). The three groups have distinct item types,
    // so they can't share one iterator; run them as three dual-mode fan-outs.
    turbo_tasks::parallel!(reads.iter())?;
    turbo_tasks::parallel!(types.iter())?;
    turbo_tasks::parallel!(completions.iter())?;
    Ok(Completion::new())
}
}

#[cfg(test)]
pub mod tests {

    use std::{
        collections::HashMap,
        fs::{File, create_dir},
        io::prelude::*,
    };

    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{
        Completion, Effects, OperationVc, ReadRef, Vc, read_strongly_consistent_and_apply_effects,
        take_effects,
    };
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use crate::{
        DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath,
        glob::{Glob, GlobOptions},
    };

    fn symlink<P: AsRef<std::path::Path>, Q: AsRef<std::path::Path>>(
        target: Q,
        path: P,
    ) -> std::io::Result<()> {
        assert!(target.as_ref().is_absolute());
        let _ = std::fs::remove_dir(&path);
        let _ = std::fs::remove_file(&path);

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(target, path)
        }
        #[cfg(windows)]
        {
            let metadata = std::fs::metadata(&target).ok();
            if metadata.is_none_or(|m| m.is_file()) {
                std::os::windows::fs::symlink_file(target, path)
            } else {
                std::os::windows::fs::junction_point(target, path)
            }
        }
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_read_glob_basic_operation(path: RcStr) -> anyhow::Result<()> {
        let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(path));
        let root = turbo_tasks::read!(fs.root())?;
        let read_dir =
            turbo_tasks::read!(root.read_glob(Glob::new(rcstr!("**"), GlobOptions::default())))
                .unwrap();
        assert_eq!(read_dir.results.len(), 2);
        assert_eq!(
            read_dir.results.get("foo"),
            Some(&DirectoryEntry::File(
                turbo_tasks::read!(fs.root())?.join("foo")?
            ))
        );
        assert_eq!(
            read_dir.results.get("sub"),
            Some(&DirectoryEntry::Directory(
                turbo_tasks::read!(fs.root())?.join("sub")?
            ))
        );
        assert_eq!(read_dir.inner.len(), 1);
        let inner = &*turbo_tasks::read!(read_dir.inner.get("sub").unwrap())?;
        assert_eq!(inner.results.len(), 1);
        assert_eq!(
            inner.results.get("bar"),
            Some(&DirectoryEntry::File(
                turbo_tasks::read!(fs.root())?.join("sub/bar")?
            ))
        );
        assert_eq!(inner.inner.len(), 0);

        let read_dir =
            turbo_tasks::read!(root.read_glob(Glob::new(rcstr!("**/bar"), GlobOptions::default())))
                .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        assert_eq!(read_dir.inner.len(), 1);
        let inner = &*turbo_tasks::read!(read_dir.inner.get("sub").unwrap())?;
        assert_eq!(inner.results.len(), 1);
        assert_eq!(
            inner.results.get("bar"),
            Some(&DirectoryEntry::File(
                turbo_tasks::read!(fs.root())?.join("sub/bar")?
            ))
        );
        assert_eq!(inner.inner.len(), 0);

        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_read_glob_symlinks_operation(path: RcStr) -> anyhow::Result<()> {
        let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(path));
        let root = turbo_tasks::read!(fs.root())?;
        // Symlinked files
        let read_dir = turbo_tasks::read!(
            root.read_glob(Glob::new(rcstr!("sub/*.js"), GlobOptions::default()))
        )
        .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        let inner = &*turbo_tasks::read!(read_dir.inner.get("sub").unwrap())?;
        assert_eq!(
            inner.results,
            HashMap::from_iter([
                (
                    "link-foo.js".into(),
                    DirectoryEntry::Symlink(root.join("sub/link-foo.js")?),
                ),
                (
                    "link-root.js".into(),
                    DirectoryEntry::Symlink(root.join("sub/link-root.js")?),
                ),
                (
                    "foo.js".into(),
                    DirectoryEntry::File(root.join("sub/foo.js")?),
                ),
            ])
        );
        assert_eq!(inner.inner.len(), 0);

        // A symlinked folder
        let read_dir = turbo_tasks::read!(
            root.read_glob(Glob::new(rcstr!("sub/dir/*"), GlobOptions::default()))
        )
        .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        let inner_sub = &*turbo_tasks::read!(read_dir.inner.get("sub").unwrap())?;
        assert_eq!(inner_sub.results.len(), 0);
        let inner_sub_dir = &*turbo_tasks::read!(inner_sub.inner.get("dir").unwrap())?;
        assert_eq!(
            inner_sub_dir.results,
            HashMap::from_iter([(
                "index.js".into(),
                DirectoryEntry::File(root.join("sub/dir/index.js")?),
            )])
        );
        assert_eq!(inner_sub_dir.inner.len(), 0);

        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_dead_symlink_read_glob_operation(path: RcStr) -> anyhow::Result<()> {
        let fs =
            Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), Vc::cell(path)));
        let root = turbo_tasks::read!(fs.root().owned())?;
        let read_dir = turbo_tasks::read!(
            root.read_glob(Glob::new(rcstr!("sub/*.js"), GlobOptions::default()))
        )?;
        assert_eq!(read_dir.results.len(), 0);
        assert_eq!(read_dir.inner.len(), 1);
        let inner_sub = &*turbo_tasks::read!(read_dir.inner.get("sub").unwrap())?;
        assert_eq!(inner_sub.inner.len(), 0);
        assert_eq!(
            inner_sub.results,
            HashMap::from_iter([
                (
                    "foo.js".into(),
                    DirectoryEntry::File(root.join("sub/foo.js")?),
                ),
                (
                    "dead_link.js".into(),
                    DirectoryEntry::Symlink(root.join("sub/dead_link.js")?),
                )
            ])
        );

        Ok(())
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_basic() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a simple directory with 2 files, a subdirectory and a dotfile
            let path = scratch.path();
            File::create_new(path.join("foo"))
                .unwrap()
                .write_all(b"foo")
                .unwrap();
            create_dir(path.join("sub")).unwrap();
            File::create_new(path.join("sub/bar"))
                .unwrap()
                .write_all(b"bar")
                .unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            assert_read_glob_basic_operation(path)
                .read_strongly_consistent()
                .await?;

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_symlinks() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // root.js
            // sub/foo.js
            // sub/link-foo.js -> ./foo.js
            // sub/link-root.js -> ../root.js
            let path = scratch.path();
            create_dir(path.join("sub")).unwrap();
            let foo = path.join("sub/foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            symlink(&foo, path.join("sub/link-foo.js")).unwrap();

            let root = path.join("root.js");
            File::create_new(&root).unwrap().write_all(b"root").unwrap();
            symlink(&root, path.join("sub/link-root.js")).unwrap();

            let dir = path.join("dir");
            create_dir(&dir).unwrap();
            File::create_new(dir.join("index.js"))
                .unwrap()
                .write_all(b"dir index")
                .unwrap();
            symlink(&dir, path.join("sub/dir")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            assert_read_glob_symlinks_operation(path)
                .read_strongly_consistent()
                .await?;

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function(operation, root)]
    pub async fn delete(path: FileSystemPath) -> anyhow::Result<()> {
        turbo_tasks::read!(path.write(FileContent::NotFound.cell()))?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    pub async fn write(path: FileSystemPath, contents: RcStr) -> anyhow::Result<()> {
        turbo_tasks::read!(path.write(
            FileContent::Content(crate::File::from_bytes(contents.to_string().into_bytes())).cell(),
        ))?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    pub fn track_star_star_glob(path: FileSystemPath) -> Vc<Completion> {
        path.track_glob(Glob::new(rcstr!("**"), GlobOptions::default()), false)
    }

    #[turbo_tasks::function(operation, root)]
    fn disk_file_system_root_operation(path: RcStr) -> Vc<FileSystemPath> {
        let fs =
            Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), Vc::cell(path)));
        fs.root()
    }

    #[turbo_tasks::function(operation, root)]
    async fn extract_effects_operation(op: OperationVc<()>) -> anyhow::Result<Vc<Effects>> {
        let _ = turbo_tasks::read!(op.resolve().strongly_consistent())?;
        Ok(turbo_tasks::read!(take_effects(op))?.cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn track_glob_operation(path: RcStr, glob: RcStr) -> anyhow::Result<()> {
        let root =
            turbo_tasks::read!(disk_file_system_root_operation(path).read_strongly_consistent())?;
        turbo_tasks::read!(root.track_glob(Glob::new(glob, GlobOptions::default()), false))?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_glob_operation(path: RcStr, glob: RcStr) -> anyhow::Result<()> {
        let root =
            turbo_tasks::read!(disk_file_system_root_operation(path).read_strongly_consistent())?;
        turbo_tasks::read!(root.read_glob(Glob::new(glob, GlobOptions::default())))?;
        Ok(())
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn track_glob_invalidations() {
        let scratch = tempfile::tempdir().unwrap();

        // Create a simple directory with 2 files, a subdirectory and a dotfile
        let path = scratch.path();
        let dir = path.join("dir");
        create_dir(&dir).unwrap();
        File::create_new(dir.join("foo"))
            .unwrap()
            .write_all(b"foo")
            .unwrap();
        create_dir(dir.join("sub")).unwrap();
        File::create_new(dir.join("sub/bar"))
            .unwrap()
            .write_all(b"bar")
            .unwrap();
        // Add a dotfile
        create_dir(dir.join("sub/.vim")).unwrap();
        let gitignore = dir.join("sub/.vim/.gitignore");
        File::create_new(&gitignore)
            .unwrap()
            .write_all(b"ignore")
            .unwrap();
        // put a link in the dir that points at a file in the root.
        let link_target = path.join("link_target.js");
        File::create_new(&link_target)
            .unwrap()
            .write_all(b"link_target")
            .unwrap();
        symlink(&link_target, dir.join("link.js")).unwrap();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let root = disk_file_system_root_operation(path)
                .read_strongly_consistent()
                .await?;
            let dir = root.join("dir")?;
            let read_dir = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            // Delete a file that we shouldn't be tracking
            turbo_tasks::read!(read_strongly_consistent_and_apply_effects(
                extract_effects_operation(delete(root.join("dir/sub/.vim/.gitignore")?)),
                |e| e,
            ))?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;
            assert!(ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Delete a file that we should be tracking
            turbo_tasks::read!(read_strongly_consistent_and_apply_effects(
                extract_effects_operation(delete(root.join("dir/foo")?)),
                |e| e,
            ))?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Modify a symlink target file
            turbo_tasks::read!(read_strongly_consistent_and_apply_effects(
                extract_effects_operation(write(
                    root.join("link_target.js")?,
                    rcstr!("new_contents"),
                )),
                |e| e,
            ))?;
            let read_dir3 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir3, &read_dir2));

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn track_glob_symlinks_loop() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a simple directory with 1 file and a symlink pointing at at a file in a
            // subdirectory
            let path = scratch.path();
            let sub = &path.join("sub");
            create_dir(sub).unwrap();
            let foo = sub.join("foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            // put a link in sub that points back at its parent director
            symlink(sub, sub.join("link")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let err = track_glob_operation(path.clone(), rcstr!("**"))
                .read_strongly_consistent()
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            // Same when calling track glob
            let err = track_glob_operation(path, rcstr!("**"))
                .read_strongly_consistent()
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    // Reproduces an issue where a dead symlink would cause a panic when tracking/reading a glob
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn dead_symlinks() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a simple directory with 1 file and a symlink pointing at a non-existent file
            let path = scratch.path();
            let sub = &path.join("sub");
            create_dir(sub).unwrap();
            let foo = sub.join("foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            // put a link in sub that points to a sibling file that doesn't exist
            symlink(sub.join("doesntexist.js"), sub.join("dead_link.js")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            track_glob_operation(path, rcstr!("sub/*.js"))
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            assert_dead_symlink_read_glob_operation(path)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    // Reproduces an issue where a dead symlink would cause a panic when tracking/reading a glob
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn symlink_escapes_fs_root() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a simple directory with 1 file and a symlink pointing at a non-existent file
            let path = scratch.path();
            let sub = &path.join("sub");
            create_dir(sub).unwrap();
            let foo = scratch.path().join("foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            // put a link in sub that points to a parent file
            symlink(foo, sub.join("escape.js")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let root: RcStr = scratch.path().join("sub").to_str().unwrap().into();
        tt.run_once(async {
            track_glob_operation(root, rcstr!("*.js"))
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_symlinks_loop() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // Create a simple directory with 1 file and a symlink pointing at at a file in a
            // subdirectory
            let path = scratch.path();
            let sub = &path.join("sub");
            create_dir(sub).unwrap();
            let foo = sub.join("foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            // put a link in sub that points back at its parent director
            symlink(sub, sub.join("link")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let err = read_glob_operation(path.clone(), rcstr!("**"))
                .read_strongly_consistent()
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            // Same when calling track glob
            let err = track_glob_operation(path, rcstr!("**"))
                .read_strongly_consistent()
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
