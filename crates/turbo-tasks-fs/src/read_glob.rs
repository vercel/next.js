use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{RcStr, Vc};

use crate::{glob::Glob, DirectoryContent, DirectoryEntry, FileSystemPath};

#[turbo_tasks::value]
#[derive(Default, Debug)]
pub struct ReadGlobResult {
    pub results: HashMap<String, DirectoryEntry>,
    pub inner: HashMap<String, Vc<ReadGlobResult>>,
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
    read_glob_internal("", directory, glob, include_dot_files).await
}

#[turbo_tasks::function(fs)]
async fn read_glob_inner(
    prefix: RcStr,
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<ReadGlobResult>> {
    read_glob_internal(&prefix, directory, glob, include_dot_files).await
}

async fn read_glob_internal(
    prefix: &str,
    directory: Vc<FileSystemPath>,
    glob: Vc<Glob>,
    include_dot_files: bool,
) -> Result<Vc<ReadGlobResult>> {
    let dir = directory.read_dir().await?;
    let mut result = ReadGlobResult::default();
    let glob_value = glob.await?;
    match &*dir {
        DirectoryContent::Entries(entries) => {
            for item in entries.iter() {
                match item {
                    (segment, DirectoryEntry::Directory(path)) => {
                        let full_path = format!("{prefix}{segment}");
                        let full_path_prefix: RcStr = format!("{full_path}/").into();
                        if glob_value.execute(&full_path) {
                            result
                                .results
                                .insert(full_path.clone(), DirectoryEntry::Directory(*path));
                        }
                        if glob_value.execute(&full_path_prefix) {
                            result.inner.insert(
                                full_path,
                                read_glob_inner(full_path_prefix, *path, glob, include_dot_files),
                            );
                        }
                    }
                    (segment, entry) => {
                        let full_path = format!("{prefix}{segment}");
                        if glob_value.execute(&full_path) {
                            result.results.insert(full_path, *entry);
                        }
                    }
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    Ok(ReadGlobResult::cell(result))
}
