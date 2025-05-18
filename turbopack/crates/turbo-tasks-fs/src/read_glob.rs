use anyhow::{Result, bail};
use futures::try_join;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, TryJoinIterExt, Vc};

use crate::{DirectoryContent, DirectoryEntry, FileSystem, FileSystemPath, glob::Glob};

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
                        if glob_value.can_match_in_directory(&entry_path) {
                            completions.push(track_glob_inner(
                                entry_path,
                                *path,
                                glob,
                                include_dot_files,
                            ));
                        }
                    }
                    DirectoryEntry::File(path) => {
                        if glob_value.matches(&entry_path) {
                            reads.push(fs.read(*path))
                        }
                    }
                    DirectoryEntry::Symlink(_) => unreachable!("we already resolved symlinks"),
                    DirectoryEntry::Other(path) => {
                        if glob_value.matches(&entry_path) {
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

    use crate::{DiskFileSystem, FileContent, FileSystem, FileSystemPath, glob::Glob};

    #[turbo_tasks::function(operation)]
    pub async fn delete(path: ResolvedVc<FileSystemPath>) -> anyhow::Result<()> {
        path.write(FileContent::NotFound.cell()).await?;
        Ok(())
    }
    #[turbo_tasks::function(operation)]
    pub async fn write(path: ResolvedVc<FileSystemPath>, contents: RcStr) -> anyhow::Result<()> {
        path.write(
            FileContent::Content(crate::File::from_bytes(contents.to_string().into_bytes())).cell(),
        )
        .await?;
        Ok(())
    }

    #[turbo_tasks::function(operation)]
    pub async fn track_star_star_glob(path: ResolvedVc<FileSystemPath>) -> Vc<Completion> {
        path.track_glob(Glob::new("**".into()), false)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn track_glob_invalidations() {
        use std::os::unix::fs::symlink;
        crate::register();
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
            let fs = Vc::upcast::<Box<dyn FileSystem>>(DiskFileSystem::new(
                "temp".into(),
                path,
                Vec::new(),
            ));
            let dir = fs.root().join("dir".into()).to_resolved().await?;
            let read_dir = track_star_star_glob(dir).read_strongly_consistent().await?;

            // Delete a file that we shouldn't be tracking
            let delete_result = delete(
                fs.root()
                    .join("dir/sub/.vim/.gitignore".into())
                    .to_resolved()
                    .await?,
            );
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(dir).read_strongly_consistent().await?;
            assert!(ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Delete a file that we should be tracking
            let delete_result = delete(fs.root().join("dir/foo".into()).to_resolved().await?);
            delete_result.read_strongly_consistent().await?;
            apply_effects(delete_result).await?;

            let read_dir2 = track_star_star_glob(dir).read_strongly_consistent().await?;

            assert!(!ReadRef::ptr_eq(&read_dir, &read_dir2));

            // Modify a symlink target file
            let write_result = write(
                fs.root()
                    .join("link_target.js".into())
                    .to_resolved()
                    .await?,
                "new_contents".into(),
            );
            write_result.read_strongly_consistent().await?;
            apply_effects(write_result).await?;
            let read_dir3 = track_star_star_glob(dir).read_strongly_consistent().await?;

            assert!(!ReadRef::ptr_eq(&read_dir3, &read_dir2));

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn track_glob_symlinks_loop() {
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
                .track_glob(Glob::new("**".into()), false)
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
