use anyhow::{Result, bail};
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc};

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
    read_glob_internal("", directory, glob).await
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    directory: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vc<ReadGlobResult>> {
    read_glob_internal(&prefix, directory, glob).await
}

// The `prefix` represents the relative directory path where symlinks are not resolve.
async fn read_glob_internal(
    prefix: &str,
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
                read_glob_inner(entry_path, path.clone(), glob)
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
                        handle_dir(&mut result, entry_path, segment, path).await?;
                    }
                    DirectoryEntry::Symlink(path) => {
                        if let LinkContent::Link { link_type, .. } = &*path.read_link().await? {
                            if link_type.contains(LinkType::DIRECTORY) {
                                // Ensure that there are no infinite link loops, but don't resolve
                                resolve_symlink_safely(entry.clone()).await?;

                                // Add the directory to `results` if it is a whole match of the glob
                                handle_file(&mut result, &entry_path, segment, entry);
                                // Recursively handle the directory
                                handle_dir(&mut result, entry_path, segment, path).await?;
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
        let source_path = entry.path().unwrap();
        if source_path.is_inside_or_equal(&resolved_entry.clone().path().unwrap()) {
            bail!(
                "'{}' is a symlink causes that causes an infinite loop!",
                source_path.path.to_string()
            )
        }
    }
    Ok(resolved_entry)
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
                    DirectoryEntry::Symlink(symlink_path) => bail!(
                        "resolve_symlink_safely() should have resolved all symlinks or returned \
                         an error, but found unresolved symlink at path: '{}'. Found path: '{}'. \
                         Please report this as a bug.",
                        entry_path,
                        symlink_path
                    ),
                    DirectoryEntry::Other(path) => {
                        if glob_value.matches(&entry_path) {
                            types.push(path.get_type())
                        }
                    }
                    // The most likely case of this is actually a sylink resolution error, it is
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
    use turbo_tasks::{Completion, ReadRef, Vc, apply_effects};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use crate::{
        DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath,
        glob::{Glob, GlobOptions},
    };

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
            let fs = DiskFileSystem::new(rcstr!("temp"), path);
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

            // Now with a more specific pattern
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

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_symlinks() {
        use std::os::unix::fs::symlink;

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
            let fs = DiskFileSystem::new(rcstr!("temp"), path);
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

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function(operation)]
    pub async fn delete(path: FileSystemPath) -> anyhow::Result<()> {
        path.write(FileContent::NotFound.cell()).await?;
        Ok(())
    }

    #[turbo_tasks::function(operation)]
    pub async fn write(path: FileSystemPath, contents: RcStr) -> anyhow::Result<()> {
        path.write(
            FileContent::Content(crate::File::from_bytes(contents.to_string().into_bytes())).cell(),
        )
        .await?;
        Ok(())
    }

    #[turbo_tasks::function(operation)]
    pub fn track_star_star_glob(path: FileSystemPath) -> Vc<Completion> {
        path.track_glob(Glob::new(rcstr!("**"), GlobOptions::default()), false)
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn track_glob_invalidations() {
        use std::os::unix::fs::symlink;
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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), path));
            let dir = fs.root().await?.join("dir")?;
            let read_dir = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            // Delete a file that we shouldn't be tracking
            let delete_result = delete(fs.root().await?.join("dir/sub/.vim/.gitignore")?);
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;
            assert!(ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Delete a file that we should be tracking
            let delete_result = delete(fs.root().await?.join("dir/foo")?);
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Modify a symlink target file
            let write_result = write(
                fs.root().await?.join("link_target.js")?,
                rcstr!("new_contents"),
            );
            write_result.read_strongly_consistent().await?;
            apply_effects(write_result).await?;
            let read_dir3 = track_star_star_glob(dir.clone())
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir3, &read_dir2));

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn track_glob_symlinks_loop() {
        let scratch = tempfile::tempdir().unwrap();
        {
            use std::os::unix::fs::symlink;

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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), path));
            let err = fs
                .root()
                .await?
                .track_glob(Glob::new(rcstr!("**"), GlobOptions::default()), false)
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            // Same when calling track glob
            let err = fs
                .root()
                .await?
                .track_glob(Glob::new(rcstr!("**"), GlobOptions::default()), false)
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
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn dead_symlinks() {
        let scratch = tempfile::tempdir().unwrap();
        {
            use std::os::unix::fs::symlink;

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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), path));
            fs.root()
                .await?
                .track_glob(Glob::new(rcstr!("sub/*.js"), GlobOptions::default()), false)
                .await
        })
        .await
        .unwrap();
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), path));
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
                    // read_glob doesn't resolve symlinks and thus doesn't detect that it is dead
                    (
                        "dead_link.js".into(),
                        DirectoryEntry::Symlink(root.join("sub/dead_link.js")?),
                    )
                ])
            );

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    // Reproduces an issue where a dead symlink would cause a panic when tracking/reading a glob
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn symlink_escapes_fs_root() {
        let scratch = tempfile::tempdir().unwrap();
        {
            use std::os::unix::fs::symlink;

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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), root));
            fs.root()
                .await?
                .track_glob(Glob::new(rcstr!("*.js"), GlobOptions::default()), false)
                .await
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_glob_symlinks_loop() {
        let scratch = tempfile::tempdir().unwrap();
        {
            use std::os::unix::fs::symlink;

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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(rcstr!("temp"), path));
            let err = fs
                .root()
                .await?
                .read_glob(Glob::new(rcstr!("**"), GlobOptions::default()))
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            // Same when calling track glob
            let err = fs
                .root()
                .await?
                .track_glob(Glob::new(rcstr!("**"), GlobOptions::default()), false)
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
