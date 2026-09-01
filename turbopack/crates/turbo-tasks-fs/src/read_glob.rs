use anyhow::{Result, bail};
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc, turbobail};

use crate::{
    DirectoryContent, DirectoryEntry, FileSystem, FileSystemEntryType, FileSystemPath, LinkContent,
    glob::Glob,
};

#[turbo_tasks::value]
#[derive(Default, Debug)]
pub struct ReadGlobResult {
    pub results: FxHashMap<RcStr, DirectoryEntry>,
    pub inner: FxHashMap<RcStr, ResolvedVc<ReadGlobResult>>,
}

async fn resolve_glob_root(directory: FileSystemPath) -> Result<FileSystemPath> {
    Ok(directory
        .realpath()
        .await?
        .unwrap_or_else(|_| directory.clone()))
}

/// Reads matches of a glob pattern.
///
/// Directories are resolved before physical enumeration, but [`DirectoryEntry`] paths in the
/// result remain logical paths rooted at the supplied `directory`. Consumers must resolve returned
/// paths before filesystem access when they need the physical path or its symlink chain.
///
/// DETERMINISM: Result is in random order. Either sort result or do not depend
/// on the order.
#[turbo_tasks::function(fs)]
pub async fn read_glob(directory: FileSystemPath, glob: Vc<Glob>) -> Result<Vc<ReadGlobResult>> {
    let root = directory.clone();
    let directory = resolve_glob_root(directory).await?;
    read_glob_internal("", &root, directory, glob).await
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    root: FileSystemPath,
    directory: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vc<ReadGlobResult>> {
    read_glob_internal(&prefix, &root, directory, glob).await
}

// The `prefix` represents the relative directory path where symlinks are not resolved.
async fn read_glob_internal(
    prefix: &str,
    root: &FileSystemPath,
    directory: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vc<ReadGlobResult>> {
    let dir = directory.read_dir().await?;
    let mut result = ReadGlobResult::default();
    let glob_value = glob.await?;
    let handle_file = |result: &mut ReadGlobResult,
                       entry_path: &RcStr,
                       segment: &RcStr,
                       entry: &DirectoryEntry| {
        if glob_value.matches(entry_path) {
            result.results.insert(segment.clone(), entry.clone());
        }
    };
    let handle_dir = async |result: &mut ReadGlobResult,
                            entry_path: RcStr,
                            segment: &RcStr,
                            path: &FileSystemPath| {
        if glob_value.can_match_in_directory(&entry_path) {
            result.inner.insert(
                segment.clone(),
                read_glob_inner(entry_path, root.clone(), path.clone(), glob)
                    .to_resolved()
                    .await?,
            );
        }
        anyhow::Ok(())
    };

    match &*dir {
        DirectoryContent::Entries(entries) => {
            for (segment, entry) in entries.iter() {
                let entry_path: RcStr = if prefix.is_empty() {
                    segment.clone()
                } else {
                    format!("{prefix}/{segment}").into()
                };

                let output_path = root.join(&entry_path)?;
                let output_entry = match entry {
                    DirectoryEntry::File(_) => DirectoryEntry::File(output_path),
                    DirectoryEntry::Directory(_) => DirectoryEntry::Directory(output_path),
                    DirectoryEntry::Symlink(_) => DirectoryEntry::Symlink(output_path),
                    DirectoryEntry::Other(_) => DirectoryEntry::Other(output_path),
                    DirectoryEntry::Error(error) => DirectoryEntry::Error(error.clone()),
                };

                match entry {
                    DirectoryEntry::File(_) => {
                        handle_file(&mut result, &entry_path, segment, &output_entry);
                    }
                    DirectoryEntry::Directory(path) => {
                        // Add the directory to `results` if it is a whole match of the glob
                        handle_file(&mut result, &entry_path, segment, &output_entry);
                        // Recursively handle the directory
                        handle_dir(&mut result, entry_path, segment, path).await?;
                    }
                    DirectoryEntry::Symlink(path) => {
                        // Skip links that leave the filesystem root.
                        let link_content = path.read_link().await?;
                        if let LinkContent::Link { target } = &*link_content {
                            let Ok(realpath) = target.file_system_path().realpath().await? else {
                                // Preserve unresolvable symlinks that match the glob.
                                handle_file(&mut result, &entry_path, segment, &output_entry);
                                continue;
                            };
                            if matches!(*realpath.get_type().await?, FileSystemEntryType::Directory)
                            {
                                // Reject links that point to an ancestor before recursing.
                                check_symlink_directory_recursion(path, &realpath)?;

                                // Add the directory to `results` if it is a whole match of the glob
                                handle_file(&mut result, &entry_path, segment, &output_entry);
                                // Enumerate the resolved target while preserving logical paths in
                                // the glob result.
                                handle_dir(&mut result, entry_path, segment, &realpath).await?;
                            } else {
                                handle_file(&mut result, &entry_path, segment, &output_entry);
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

/// Resolve a symlink checking for recursion.
async fn resolve_symlink_safely(entry: DirectoryEntry) -> Result<DirectoryEntry> {
    let resolved_entry = entry.clone().resolve_symlink().await?;
    if resolved_entry != entry && matches!(&resolved_entry, DirectoryEntry::Directory(_)) {
        // We followed a symlink to a directory
        // To prevent an infinite loop, which in the case of turbo-tasks would simply
        // exhaust RAM or go into an infinite loop with the GC we need to check for a
        // recursive symlink, we need to check for recursion.

        // Recursion can only occur if the symlink is a directory and points to an
        // ancestor of the current path, which can be detected via a simple prefix
        // match.
        check_symlink_directory_recursion(
            &entry.path().unwrap(),
            &resolved_entry.clone().path().unwrap(),
        )?;
    }
    Ok(resolved_entry)
}

fn check_symlink_directory_recursion(
    source_path: &FileSystemPath,
    realpath: &FileSystemPath,
) -> Result<()> {
    // We followed a symlink to a directory
    // To prevent an infinite loop, which in the case of turbo-tasks would simply
    // exhaust RAM or go into an infinite loop with the GC we need to check for a
    // recursive symlink, we need to check for recursion.

    // Recursion can only occur if the symlink is a directory and points to an
    // ancestor of the current path, which can be detected via a simple prefix
    // match.
    if source_path.is_inside_or_equal(realpath) {
        bail!("'{source_path}' is a symlink causes that causes an infinite loop!",)
    }
    Ok(())
}

/// Traverses all directories that match the given `glob`.
///
/// This ensures that the calling task will be invalidated whenever the directories or contents of
/// the directories change, but unlike [`read_glob`] doesn't accumulate data. Directories are
/// resolved before physical enumeration, including the initial `directory` and symlinks discovered
/// during traversal.
#[turbo_tasks::function(fs)]
pub async fn track_glob(
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    let directory = resolve_glob_root(directory).await?;
    track_glob_internal("", directory, glob, include_dot_files).await
}

#[turbo_tasks::function(fs)]
async fn track_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    track_glob_internal(&prefix, directory, glob, include_dot_files).await
}

async fn track_glob_internal(
    prefix: &str,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    let dir = directory.read_dir().await?;
    let glob_value = glob.await?;
    let fs = directory.fs().to_resolved().await?;
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

                match resolve_symlink_safely(entry.clone()).await? {
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
    try_join!(
        reads.iter().try_join(),
        types.iter().try_join(),
        completions.iter().try_join()
    )?;
    Ok(Completion::new())
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
        DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath, ReadGlobResult,
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
        let root = fs.root().await?;
        let read_dir = root
            .read_glob(Glob::new(rcstr!("**"), GlobOptions::default()))
            .await
            .unwrap();
        assert_eq!(read_dir.results.len(), 2);
        assert_eq!(
            read_dir.results.get("foo"),
            Some(&DirectoryEntry::File(fs.root().await?.join("foo")?))
        );
        assert_eq!(
            read_dir.results.get("sub"),
            Some(&DirectoryEntry::Directory(fs.root().await?.join("sub")?))
        );
        assert_eq!(read_dir.inner.len(), 1);
        let inner = &*read_dir.inner.get("sub").unwrap().await?;
        assert_eq!(inner.results.len(), 1);
        assert_eq!(
            inner.results.get("bar"),
            Some(&DirectoryEntry::File(fs.root().await?.join("sub/bar")?))
        );
        assert_eq!(inner.inner.len(), 0);

        let read_dir = root
            .read_glob(Glob::new(rcstr!("**/bar"), GlobOptions::default()))
            .await
            .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        assert_eq!(read_dir.inner.len(), 1);
        let inner = &*read_dir.inner.get("sub").unwrap().await?;
        assert_eq!(inner.results.len(), 1);
        assert_eq!(
            inner.results.get("bar"),
            Some(&DirectoryEntry::File(fs.root().await?.join("sub/bar")?))
        );
        assert_eq!(inner.inner.len(), 0);

        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_read_glob_symlinks_operation(path: RcStr) -> anyhow::Result<()> {
        let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(path));
        let root = fs.root().await?;
        // Symlinked files
        let read_dir = root
            .read_glob(Glob::new(rcstr!("sub/*.js"), GlobOptions::default()))
            .await
            .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        let inner = &*read_dir.inner.get("sub").unwrap().await?;
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
        let read_dir = root
            .read_glob(Glob::new(rcstr!("sub/dir/*"), GlobOptions::default()))
            .await
            .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        let inner_sub = &*read_dir.inner.get("sub").unwrap().await?;
        assert_eq!(inner_sub.results.len(), 0);
        let inner_sub_dir = &*inner_sub.inner.get("dir").unwrap().await?;
        assert_eq!(
            inner_sub_dir.results,
            HashMap::from_iter([
                (
                    "index.js".into(),
                    DirectoryEntry::File(root.join("sub/dir/index.js")?),
                ),
                (
                    "dead.js".into(),
                    DirectoryEntry::Symlink(root.join("sub/dir/dead.js")?),
                ),
            ])
        );
        assert_eq!(inner_sub_dir.inner.len(), 0);

        // A folder behind a symlink-to-symlink chain
        let read_dir = root
            .read_glob(Glob::new(rcstr!("sub/dir-chain/*"), GlobOptions::default()))
            .await
            .unwrap();
        assert_eq!(read_dir.results.len(), 0);
        let inner_sub = &*read_dir.inner.get("sub").unwrap().await?;
        assert_eq!(inner_sub.results.len(), 0);
        let inner_sub_dir = &*inner_sub.inner.get("dir-chain").unwrap().await?;
        assert_eq!(
            inner_sub_dir.results,
            HashMap::from_iter([
                (
                    "index.js".into(),
                    DirectoryEntry::File(root.join("sub/dir-chain/index.js")?),
                ),
                (
                    "dead.js".into(),
                    DirectoryEntry::Symlink(root.join("sub/dir-chain/dead.js")?),
                ),
            ])
        );
        assert_eq!(inner_sub_dir.inner.len(), 0);

        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_dead_symlink_read_glob_operation(path: RcStr) -> anyhow::Result<()> {
        let fs =
            Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), Vc::cell(path)));
        let root = fs.root().owned().await?;
        let read_dir = root
            .read_glob(Glob::new(rcstr!("sub/*.js"), GlobOptions::default()))
            .await?;
        assert_eq!(read_dir.results.len(), 0);
        assert_eq!(read_dir.inner.len(), 1);
        let inner_sub = &*read_dir.inner.get("sub").unwrap().await?;
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
            symlink(dir.join("missing.js"), dir.join("dead.js")).unwrap();
            symlink(&dir, path.join("sub/dir")).unwrap();
            let dir_link = path.join("dir-link");
            symlink(&dir, &dir_link).unwrap();
            symlink(dir_link, path.join("sub/dir-chain")).unwrap();
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
        path.write(FileContent::NotFound.cell()).await?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    pub async fn write(path: FileSystemPath, contents: RcStr) -> anyhow::Result<()> {
        path.write(
            FileContent::Content(crate::File::from_bytes(contents.to_string().into_bytes())).cell(),
        )
        .await?;
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
        let _ = op.resolve().strongly_consistent().await?;
        Ok(take_effects(op).await?.cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn track_glob_operation(path: RcStr, glob: RcStr) -> anyhow::Result<()> {
        let root = disk_file_system_root_operation(path)
            .read_strongly_consistent()
            .await?;
        root.track_glob(Glob::new(glob, GlobOptions::default()), false)
            .await?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_glob_operation(path: RcStr, glob: RcStr) -> anyhow::Result<()> {
        let root = disk_file_system_root_operation(path)
            .read_strongly_consistent()
            .await?;
        root.read_glob(Glob::new(glob, GlobOptions::default()))
            .await?;
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_glob_from_operation(
        path: RcStr,
        directory: RcStr,
        glob: RcStr,
    ) -> anyhow::Result<Vc<ReadGlobResult>> {
        let root = disk_file_system_root_operation(path)
            .read_strongly_consistent()
            .await?;
        Ok(root
            .join(&directory)?
            .read_glob(Glob::new(glob, GlobOptions::default())))
    }

    #[turbo_tasks::function(operation, root)]
    async fn track_glob_from_operation(
        path: RcStr,
        directory: RcStr,
        glob: RcStr,
    ) -> anyhow::Result<Vc<Completion>> {
        let root = disk_file_system_root_operation(path)
            .read_strongly_consistent()
            .await?;
        Ok(root
            .join(&directory)?
            .track_glob(Glob::new(glob, GlobOptions::default()), false))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn glob_roots_resolve_symlink_parents() {
        let scratch = tempfile::tempdir().unwrap();
        let path = scratch.path();
        let target = path.join("target/inner/path");
        std::fs::create_dir_all(&target).unwrap();
        File::create_new(target.join("file.txt"))
            .unwrap()
            .write_all(b"initial")
            .unwrap();
        std::fs::create_dir_all(path.join("path/to")).unwrap();
        symlink(path.join("target"), path.join("path/to/symlink")).unwrap();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let disk_root: RcStr = path.to_str().unwrap().into();
        tt.run_once(async move {
            let root = disk_file_system_root_operation(disk_root.clone())
                .read_strongly_consistent()
                .await?;
            let logical_base = root.join("path/to/symlink/inner/path")?;

            let initial = read_glob_from_operation(
                disk_root.clone(),
                rcstr!("path/to/symlink/inner/path"),
                rcstr!("*"),
            )
            .read_strongly_consistent()
            .await?;
            assert_eq!(
                initial.results.get("file.txt"),
                Some(&DirectoryEntry::File(logical_base.join("file.txt")?))
            );

            let wildcard = read_glob_from_operation(
                disk_root.clone(),
                rcstr!(""),
                rcstr!("path/to/*/inner/path/*"),
            )
            .read_strongly_consistent()
            .await?;
            let path_result = wildcard.inner.get("path").unwrap().await?;
            let to_result = path_result.inner.get("to").unwrap().await?;
            let symlink_result = to_result.inner.get("symlink").unwrap().await?;
            let inner_result = symlink_result.inner.get("inner").unwrap().await?;
            let final_result = inner_result.inner.get("path").unwrap().await?;
            assert_eq!(
                final_result.results.get("file.txt"),
                Some(&DirectoryEntry::File(logical_base.join("file.txt")?))
            );

            let initial_tracking = track_glob_from_operation(
                disk_root.clone(),
                rcstr!("path/to/symlink/inner/path"),
                rcstr!("*"),
            )
            .read_strongly_consistent()
            .await?;
            let wildcard_tracking = track_glob_from_operation(
                disk_root.clone(),
                rcstr!(""),
                rcstr!("path/to/*/inner/path/*"),
            )
            .read_strongly_consistent()
            .await?;

            read_strongly_consistent_and_apply_effects(
                extract_effects_operation(write(
                    root.join("target/inner/path/file.txt")?,
                    rcstr!("updated"),
                )),
                |e| e,
            )
            .await?;

            let initial_tracking_after = track_glob_from_operation(
                disk_root.clone(),
                rcstr!("path/to/symlink/inner/path"),
                rcstr!("*"),
            )
            .read_strongly_consistent()
            .await?;
            let wildcard_tracking_after =
                track_glob_from_operation(disk_root, rcstr!(""), rcstr!("path/to/*/inner/path/*"))
                    .read_strongly_consistent()
                    .await?;

            assert!(!ReadRef::ptr_eq(&initial_tracking, &initial_tracking_after));
            assert!(!ReadRef::ptr_eq(
                &wildcard_tracking,
                &wildcard_tracking_after
            ));
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
            read_strongly_consistent_and_apply_effects(
                extract_effects_operation(delete(root.join("dir/sub/.vim/.gitignore")?)),
                |e| e,
            )
            .await?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;
            assert!(ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Delete a file that we should be tracking
            read_strongly_consistent_and_apply_effects(
                extract_effects_operation(delete(root.join("dir/foo")?)),
                |e| e,
            )
            .await?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Modify a symlink target file
            read_strongly_consistent_and_apply_effects(
                extract_effects_operation(write(
                    root.join("link_target.js")?,
                    rcstr!("new_contents"),
                )),
                |e| e,
            )
            .await?;
            let read_dir3 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir3, &read_dir2));

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
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
