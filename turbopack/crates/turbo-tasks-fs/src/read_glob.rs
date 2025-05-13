use anyhow::{Result, bail};
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc};

use crate::{DirectoryContent, DirectoryEntry, FileSystem, FileSystemPath, glob::Glob};

#[turbo_tasks::value]
#[derive(Default, Debug)]
pub struct ReadGlobResult {
    pub results: FxHashMap<String, DirectoryEntry>,
    pub inner: FxHashMap<String, ResolvedVc<ReadGlobResult>>,
}

/// Reads matches of a glob pattern.
///
/// DETERMINISM: Result is in random order. Either sort result or do not depend
/// on the order.
#[turbo_tasks::function(fs)]
pub async fn read_glob(
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<ReadGlobResult>> {
    Ok(*read_glob_internal("", directory, glob, include_dot_files).await?)
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<ReadGlobResult>> {
    Ok(*read_glob_internal(&prefix, directory, glob, include_dot_files).await?)
}

// The `prefix` represents the relative directory path where symlinks are not resolve.
async fn read_glob_internal(
    prefix: &str,
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<ResolvedVc<ReadGlobResult>> {
    let dir = directory.read_dir().await?;
    let mut result = ReadGlobResult::default();
    let glob_value = glob.await?;
    match &*dir {
        DirectoryContent::Entries(entries) => {
            for (segment, entry) in entries.iter() {
                if !include_dot_files && segment.starts_with('.') {
                    continue;
                }
                // This is redundant with logic inside of `read_dir` but here we track it separately
                // so we don't follow symlinks.
                let entry_path: RcStr = if prefix.is_empty() {
                    segment.clone()
                } else {
                    format!("{prefix}/{segment}").into()
                };
                let entry = resolve_symlink_safely(entry).await?;
                if glob_value.execute(&entry_path) {
                    result.results.insert(entry_path.to_string(), entry);
                }
                if let DirectoryEntry::Directory(path) = entry {
                    if glob_value.match_in_directory(&entry_path) {
                        result.inner.insert(
                            entry_path.to_string(),
                            read_glob_inner(entry_path, *path, glob, include_dot_files)
                                .to_resolved()
                                .await?,
                        );
                    }
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    Ok(ReadGlobResult::resolved_cell(result))
}

// Resolve a symlink checking for recursion.
async fn resolve_symlink_safely(entry: &DirectoryEntry) -> Result<DirectoryEntry> {
    let resolved_entry = entry.resolve_symlink().await?;
    if resolved_entry != *entry && matches!(&resolved_entry, DirectoryEntry::Directory(_)) {
        // We followed a symlink to a directory
        // To prevent an infinite loop, which in the case of turbo-tasks would simply
        // exhaust RAM or go into an infinite loop with the GC we need to check for a
        // recursive symlink, we need to check for recursion.

        // Recursion can only occur if the symlink is a directory and points to an
        // ancestor of the current path, which can be detected via a simple prefix
        // match.
        let source_path = entry.path().unwrap();
        if *source_path
            .is_inside_or_equal(*resolved_entry.path().unwrap())
            .await?
        {
            bail!(
                "'{}' is a symlink causes that causes an infinite loop!",
                source_path.await?.path.to_string()
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
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    track_glob_internal("", directory, glob, include_dot_files).await
}

#[turbo_tasks::function(fs)]
async fn track_glob_inner(
    prefix: RcStr,
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    track_glob_internal(&prefix, directory, glob, include_dot_files).await
}

async fn track_glob_internal(
    prefix: &str,
    directory: Vc<FileSystemPath>,
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

                match resolve_symlink_safely(entry).await? {
                    DirectoryEntry::Directory(path) => {
                        if glob_value.match_in_directory(&entry_path) {
                            completions.push(track_glob_inner(
                                entry_path,
                                *path,
                                glob,
                                include_dot_files,
                            ));
                        }
                    }
                    DirectoryEntry::File(path) => {
                        if glob_value.execute(&entry_path) {
                            reads.push(fs.read(*path))
                        }
                    }
                    DirectoryEntry::Symlink(_) => panic!("we already resolved symlinks"),
                    DirectoryEntry::Other(path) => {
                        if glob_value.execute(&entry_path) {
                            types.push(path.get_type())
                        }
                    }
                    DirectoryEntry::Error => {}
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
        fs::{File, create_dir},
        io::prelude::*,
    };

    use turbo_rcstr::RcStr;
    use turbo_tasks::{Completion, ReadRef, ResolvedVc, Vc, apply_effects};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use crate::{
        DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath, glob::Glob,
    };

    #[tokio::test]
    async fn read_glob_basic() {
        crate::register();
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
            // Add a dotfile
            File::create_new(path.join("sub/.gitignore"))
                .unwrap()
                .write_all(b"ignore")
                .unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
                "temp".into(),
                path,
                Vec::new(),
            ));
            let read_dir = fs
                .root()
                .read_glob(Glob::new("**".into()), false)
                .await
                .unwrap();
            assert_eq!(read_dir.results.len(), 2);
            assert_eq!(
                read_dir.results.get("foo"),
                Some(&DirectoryEntry::File(
                    fs.root().join("foo".into()).to_resolved().await?
                ))
            );
            assert_eq!(
                read_dir.results.get("sub"),
                Some(&DirectoryEntry::Directory(
                    fs.root().join("sub".into()).to_resolved().await?
                ))
            );
            assert_eq!(read_dir.inner.len(), 1);
            let inner = &*read_dir.inner.get("sub").unwrap().await?;
            assert_eq!(inner.results.len(), 1);
            assert_eq!(
                inner.results.get("sub/bar"),
                Some(&DirectoryEntry::File(
                    fs.root().join("sub/bar".into()).to_resolved().await?
                ))
            );
            assert_eq!(inner.inner.len(), 0);

            // Now with a more specific pattern
            let read_dir = fs
                .root()
                .read_glob(Glob::new("**/bar".into()), false)
                .await
                .unwrap();
            assert_eq!(read_dir.results.len(), 0);
            assert_eq!(read_dir.inner.len(), 1);
            let inner = &*read_dir.inner.get("sub").unwrap().await?;
            assert_eq!(inner.results.len(), 1);
            assert_eq!(
                inner.results.get("sub/bar"),
                Some(&DirectoryEntry::File(
                    fs.root().join("sub/bar".into()).to_resolved().await?
                ))
            );
            assert_eq!(inner.inner.len(), 0);

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn read_glob_symlinks() {
        crate::register();
        let scratch = tempfile::tempdir().unwrap();
        {
            use std::os::unix::fs::symlink;

            // Create a simple directory with 1 file and a symlink pointing at at a file in a
            // subdirectory
            let path = scratch.path();
            create_dir(path.join("sub")).unwrap();
            let foo = path.join("sub/foo.js");
            File::create_new(&foo).unwrap().write_all(b"foo").unwrap();
            symlink(&foo, path.join("link.js")).unwrap();
        }
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
                "temp".into(),
                path,
                Vec::new(),
            ));
            let read_dir = fs
                .root()
                .read_glob(Glob::new("*.js".into()), false)
                .await
                .unwrap();
            assert_eq!(read_dir.results.len(), 1);
            assert_eq!(
                read_dir.results.get("link.js"),
                Some(&DirectoryEntry::File(
                    fs.root().join("sub/foo.js".into()).to_resolved().await?
                ))
            );
            assert_eq!(read_dir.inner.len(), 0);

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function(operation)]
    pub async fn delete(path: ResolvedVc<FileSystemPath>) -> anyhow::Result<()> {
        path.write(FileContent::NotFound.cell()).await?;
        Ok(())
    }

    #[turbo_tasks::function(operation)]
    pub async fn track_star_star_glob(path: ResolvedVc<FileSystemPath>) -> Vc<Completion> {
        path.track_glob(Glob::new("**".into()), false)
    }

    #[tokio::test]
    async fn track_glob_invalidations() {
        crate::register();
        let scratch = tempfile::tempdir().unwrap();

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
        // Add a dotfile
        create_dir(path.join("sub/.vim")).unwrap();
        let gitignore = path.join("sub/.vim/.gitignore");
        File::create_new(&gitignore)
            .unwrap()
            .write_all(b"ignore")
            .unwrap();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let path: RcStr = scratch.path().to_str().unwrap().into();
        tt.run_once(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
                "temp".into(),
                path,
                Vec::new(),
            ));
            let read_dir = track_star_star_glob(fs.root().to_resolved().await?)
                .read_strongly_consistent()
                .await?;

            // Delete a file that we shouldn't be tracking
            let delete_result = delete(
                fs.root()
                    .join("sub/.vim/.gitignore".into())
                    .to_resolved()
                    .await?,
            );
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(fs.root().to_resolved().await?)
                .read_strongly_consistent()
                .await?;
            assert!(ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Delete a file that we should be tracking
            let delete_result = delete(fs.root().join("foo".into()).to_resolved().await?);
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(fs.root().to_resolved().await?)
                .read_strongly_consistent()
                .await?;

            assert!(!ReadRef::ptr_eq(&read_dir, &read_dir2));
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn read_glob_symlinks_loop() {
        crate::register();
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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
                "temp".into(),
                path,
                Vec::new(),
            ));
            let err = fs
                .root()
                .read_glob(Glob::new("**".into()), false)
                .await
                .expect_err("Should have detected an infinite loop");

            assert_eq!(
                "'sub/link' is a symlink causes that causes an infinite loop!",
                format!("{}", err.root_cause())
            );

            // Same when calling track glob
            let err = fs
                .root()
                .track_glob(Glob::new("**".into()), false)
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
