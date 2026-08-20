use anyhow::Result;
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc, turbobail};

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
    read_glob_internal("", directory, glob, rcstr!("")).await
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    /// Real filesystem paths already entered on this walk (newline-separated).
    /// Used to skip multi-hop symlink cycles (e.g. pnpm nested workspace links).
    visited_real_dirs: RcStr,
) -> Result<Vc<ReadGlobResult>> {
    read_glob_internal(&prefix, directory, glob, visited_real_dirs).await
}

// The `prefix` represents the relative directory path where symlinks are not resolve.
async fn read_glob_internal(
    prefix: &str,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    visited_real_dirs: RcStr,
) -> Result<Vc<ReadGlobResult>> {
    // Skip if we already walked this real directory (multi-hop symlink cycles).
    let real_dir = directory_real_key(&directory).await?;
    if visited_contains(&visited_real_dirs, &real_dir) {
        return Ok(ReadGlobResult::cell(ReadGlobResult::default()));
    }
    let next_visited = visited_push(&visited_real_dirs, &real_dir);

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
                            path: &FileSystemPath,
                            visited: RcStr| {
        if glob_value.can_match_in_directory(&entry_path) {
            result.inner.insert(
                segment.clone(),
                read_glob_inner(entry_path, path.clone(), glob, visited)
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

                match entry {
                    DirectoryEntry::File(_) => {
                        handle_file(&mut result, &entry_path, segment, entry);
                    }
                    DirectoryEntry::Directory(path) => {
                        // Add the directory to `results` if it is a whole match of the glob
                        handle_file(&mut result, &entry_path, segment, entry);
                        // Recursively handle the directory
                        handle_dir(
                            &mut result,
                            entry_path,
                            segment,
                            path,
                            next_visited.clone(),
                        )
                        .await?;
                    }
                    DirectoryEntry::Symlink(path) => {
                        if let LinkContent::Link { link_type, .. } = &*path.read_link().await? {
                            if link_type.contains(LinkType::DIRECTORY) {
                                // Detect single-hop ancestor loops; skip instead of failing the walk
                                if resolve_symlink_safely(entry.clone()).await?.is_none() {
                                    continue;
                                }

                                // Add the directory to `results` if it is a whole match of the glob
                                handle_file(&mut result, &entry_path, segment, entry);
                                // Recursively handle the directory
                                handle_dir(
                                    &mut result,
                                    entry_path,
                                    segment,
                                    path,
                                    next_visited.clone(),
                                )
                                .await?;
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

fn visited_contains(visited: &str, real_dir: &str) -> bool {
    if visited.is_empty() || real_dir.is_empty() {
        return false;
    }
    visited.split('\n').any(|p| p == real_dir)
}

fn visited_push(visited: &str, real_dir: &str) -> RcStr {
    if real_dir.is_empty() {
        return visited.into();
    }
    if visited.is_empty() {
        real_dir.into()
    } else {
        format!("{visited}\n{real_dir}").into()
    }
}

async fn directory_real_key(directory: &FileSystemPath) -> Result<RcStr> {
    match directory.realpath().await {
        Ok(real) => Ok(real.path.clone()),
        // Fall back to the logical path if realpath fails (broken links, etc.).
        Err(_) => Ok(directory.path.clone()),
    }
}

/// Resolve a symlink checking for recursion.
///
/// Returns `Ok(None)` when a cycle is detected so callers can skip the entry
/// instead of failing the entire glob walk (needed for NFT / outputFileTracingIncludes).
async fn resolve_symlink_safely(entry: DirectoryEntry) -> Result<Option<DirectoryEntry>> {
    let resolved_entry = entry.clone().resolve_symlink().await?;
    if resolved_entry != entry && matches!(&resolved_entry, DirectoryEntry::Directory(_)) {
        // We followed a symlink to a directory
        // To prevent an infinite loop, which in the case of turbo-tasks would simply
        // exhaust RAM or go into an infinite loop with the GC we need to check for a
        // recursive symlink, we need to check for recursion.

        // Single-hop recursion: symlink points at an ancestor of its own path.
        let source_path = entry.path().unwrap();
        if source_path.is_inside_or_equal(&resolved_entry.clone().path().unwrap()) {
            return Ok(None);
        }
    }
    // Also treat realpath cycle / too-many-links as skippable for glob walks.
    if matches!(&resolved_entry, DirectoryEntry::Error(_)) {
        return Ok(None);
    }
    Ok(Some(resolved_entry))
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
    track_glob_internal("", directory, glob, include_dot_files, rcstr!("")).await
}

#[turbo_tasks::function(fs)]
async fn track_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
    visited_real_dirs: RcStr,
) -> Result<Vc<Completion>> {
    track_glob_internal(
        &prefix,
        directory,
        glob,
        include_dot_files,
        visited_real_dirs,
    )
    .await
}

async fn track_glob_internal(
    prefix: &str,
    directory: FileSystemPath,
    glob: Vc<Glob>,
    include_dot_files: bool,
    visited_real_dirs: RcStr,
) -> Result<Vc<Completion>> {
    let real_dir = directory_real_key(&directory).await?;
    if visited_contains(&visited_real_dirs, &real_dir) {
        return Ok(Completion::new());
    }
    let next_visited = visited_push(&visited_real_dirs, &real_dir);

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
                    None => {
                        // Symlink cycle — skip rather than fail the whole walk.
                    }
                    Some(DirectoryEntry::Directory(path)) => {
                        if glob_value.can_match_in_directory(&entry_path) {
                            completions.push(track_glob_inner(
                                entry_path,
                                path.clone(),
                                glob,
                                include_dot_files,
                                next_visited.clone(),
                            ));
                        }
                    }
                    Some(DirectoryEntry::File(path)) => {
                        if glob_value.matches(&entry_path) {
                            reads.push(fs.read(path.clone()))
                        }
                    }
                    Some(DirectoryEntry::Symlink(symlink_path)) => turbobail!(
                        "resolve_symlink_safely() should have resolved all symlinks or returned \
                         an error, but found unresolved symlink at path: '{entry_path}'. Found \
                         path: '{symlink_path}'. Please report this as a bug.",
                    ),
                    Some(DirectoryEntry::Other(path)) => {
                        if glob_value.matches(&entry_path) {
                            types.push(path.get_type())
                        }
                    }
                    // The most likely case of this is actually a symlink resolution error, it is
                    // fine to ignore since the mere act of attempting to resolve it has triggered
                    // the ncecessary dependencies.  If this file is actually a dependency we should
                    // get an error in the actual webpack loader when it reads it.
                    Some(DirectoryEntry::Error(_)) => {}
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
        fs::{File, create_dir, create_dir_all},
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
            // Cycles must be skipped (not fail the walk) so NFT include globs can complete.
            track_glob_operation(path.clone(), rcstr!("**"))
                .read_strongly_consistent()
                .await?;
            track_glob_operation(path, rcstr!("**"))
                .read_strongly_consistent()
                .await?;

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
            // Single-hop self loops are skipped instead of failing the walk.
            read_glob_operation(path.clone(), rcstr!("**"))
                .read_strongly_consistent()
                .await?;
            track_glob_operation(path, rcstr!("**"))
                .read_strongly_consistent()
                .await?;

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Reproduces https://github.com/vercel/next.js/issues/97550:
    /// multi-hop symlink cycles (pnpm nested workspace package depending on its
    /// physical ancestor) must be skipped by the include-glob walk.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_multi_hop_symlink_cycle() {
        let scratch = tempfile::tempdir().unwrap();
        {
            // umbrella/
            //   shared/          (package)
            //   leagues/         (package)
            // app/node_modules/shared -> ../packages/umbrella/shared
            // packages/umbrella/shared/node_modules/umbrella -> ../..
            // packages/umbrella/leagues/node_modules/shared -> ../../shared
            //
            // Walk enters via app/node_modules/shared so neither single symlink
            // target is an ancestor of its own virtual path — multi-hop cycle.
            let path = scratch.path();
            create_dir_all(path.join("app/node_modules")).unwrap();
            create_dir_all(path.join("packages/umbrella/shared/node_modules")).unwrap();
            create_dir_all(path.join("packages/umbrella/leagues/node_modules")).unwrap();

            File::create_new(path.join("packages/umbrella/shared/index.js"))
                .unwrap()
                .write_all(b"shared")
                .unwrap();
            File::create_new(path.join("packages/umbrella/leagues/index.js"))
                .unwrap()
                .write_all(b"leagues")
                .unwrap();
            File::create_new(path.join("included-asset.txt"))
                .unwrap()
                .write_all(b"asset")
                .unwrap();

            symlink(
                path.join("packages/umbrella/shared"),
                path.join("app/node_modules/shared"),
            )
            .unwrap();
            symlink(
                path.join("packages/umbrella"),
                path.join("packages/umbrella/shared/node_modules/umbrella"),
            )
            .unwrap();
            symlink(
                path.join("packages/umbrella/shared"),
                path.join("packages/umbrella/leagues/node_modules/shared"),
            )
            .unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            // Must complete without ELOOP / infinite recursion.
            read_glob_operation(path.clone(), rcstr!("**"))
                .read_strongly_consistent()
                .await?;
            track_glob_operation(path, rcstr!("**"))
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
