use anyhow::Result;
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc};

use crate::{glob::Glob, DirectoryContent, DirectoryEntry, FileSystemPath};

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

/// Tracks all files and directories that match of a glob pattern.
#[turbo_tasks::function(fs)]
pub async fn track_glob(
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    track_glob_internal("", directory, glob, include_dot_files).await
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
                let entry = entry.resolve_symlink().await?;
                match entry {
                    DirectoryEntry::Directory(path) => {
                        let full_path = format!("{prefix}{segment}");
                        let full_path_prefix: RcStr = format!("{full_path}/").into();
                        if glob_value.execute(&full_path) {
                            result
                                .results
                                .insert(full_path.clone(), DirectoryEntry::Directory(path));
                        }
                        if glob_value.execute(&full_path_prefix) {
                            result.inner.insert(
                                full_path,
                                read_glob_inner(full_path_prefix, *path, glob, include_dot_files)
                                    .to_resolved()
                                    .await?,
                            );
                        }
                    }
                    entry => {
                        let full_path = format!("{prefix}{segment}");
                        if glob_value.execute(&full_path) {
                            result.results.insert(full_path, entry);
                        }
                    }
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    Ok(ReadGlobResult::resolved_cell(result))
}

/// Traverses all directories that match the given `glob`.
///
/// This ensures that the calling task will be invalidated
/// whenever the directories change, but unlike
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
    let mut reads = Vec::new();
    let mut completions = Vec::new();
    let mut links = Vec::new();
    let mut types = Vec::new();
    match &*dir {
        DirectoryContent::Entries(entries) => {
            for (segment, entry) in entries.iter() {
                if !include_dot_files && segment.starts_with('.') {
                    continue;
                }
                let entry = entry.resolve_symlink().await?;
                match entry {
                    DirectoryEntry::Directory(path) => {
                        let full_path_prefix: RcStr = format!("{prefix}{segment}/").into();
                        if glob_value.execute(&full_path_prefix) {
                            completions.push(track_glob_inner(
                                full_path_prefix,
                                *path,
                                glob,
                                include_dot_files,
                            ));
                        }
                    }
                    DirectoryEntry::File(path) => reads.push(path.track()),
                    DirectoryEntry::Symlink(path) => links.push(path.read_link()),
                    DirectoryEntry::Other(path) => types.push(path.get_type()),
                    DirectoryEntry::Error => {}
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    try_join!(
        reads.iter().try_join(),
        links.iter().try_join(),
        types.iter().try_join(),
        completions.iter().try_join()
    )?;
    Ok(Completion::new())
}
