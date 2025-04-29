use anyhow::Result;
use futures::try_join;
use rustc_hash::FxHashMap;
use turbo_tasks::{Completion, ResolvedVc, TryJoinIterExt, Vc};

use crate::{glob::Glob, DirectoryContent, DirectoryEntry, FileSystem, FileSystemPath};

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
    Ok(*read_glob_internal(directory, glob, include_dot_files).await?)
}

async fn read_glob_internal(
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
                        let full_path = &path.await?.path;
                        let full_path_str = full_path.as_str();
                        if glob_value.execute(full_path_str) {
                            result
                                .results
                                .insert(full_path.to_string(), DirectoryEntry::Directory(path));
                        }
                        if glob_value.match_prefix(full_path_str) {
                            result.inner.insert(
                                full_path.to_string(),
                                read_glob(*path, glob, include_dot_files)
                                    .to_resolved()
                                    .await?,
                            );
                        }
                    }
                    DirectoryEntry::File(path)
                    | DirectoryEntry::Other(path)
                    | DirectoryEntry::Symlink(path) => {
                        let full_path = &path.await?.path;
                        let full_path_str = full_path.as_str();
                        if glob_value.execute(full_path_str) {
                            result.results.insert(full_path.to_string(), entry);
                        }
                    }
                    DirectoryEntry::Error => {}
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
/// whenever the directories change, but unlike read_glob doesn't accumulate data.
#[turbo_tasks::function(fs)]
pub async fn track_glob(
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<Completion>> {
    track_glob_internal(directory, glob, include_dot_files).await
}

async fn track_glob_internal(
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
                match entry.resolve_symlink().await? {
                    DirectoryEntry::Directory(path) => {
                        if glob_value.match_prefix(&path.await?.path) {
                            completions.push(track_glob(*path, glob, include_dot_files));
                        }
                    }
                    DirectoryEntry::File(path) => {
                        if glob_value.execute(&path.await?.path) {
                            reads.push(fs.read(*path))
                        }
                    }
                    DirectoryEntry::Symlink(_) => panic!("we already resolved symlinks"),
                    DirectoryEntry::Other(path) => {
                        if glob_value.execute(&path.await?.path) {
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
