use std::collections::HashMap;

use anyhow::Result;

use crate::{glob::GlobVc, DirectoryContent, DirectoryEntry, FileSystemPathVc};

#[turbo_tasks::value]
#[derive(Default, Debug)]
pub struct ReadGlobResult {
    pub results: HashMap<String, DirectoryEntry>,
    pub inner: HashMap<String, ReadGlobResultVc>,
}

/// Reads matches of a glob pattern.
///
/// DETERMINISM: Result is in random order. Either sort result or do not depend
/// on the order.
#[turbo_tasks::function]
pub async fn read_glob(
    directory: FileSystemPathVc,
    glob: GlobVc,
    include_dot_files: bool,
) -> Result<ReadGlobResultVc> {
    read_glob_internal("", directory, glob, include_dot_files).await
}

#[turbo_tasks::function]
async fn read_glob_inner(
    prefix: String,
    directory: FileSystemPathVc,
    glob: GlobVc,
    include_dot_files: bool,
) -> Result<ReadGlobResultVc> {
    read_glob_internal(&prefix, directory, glob, include_dot_files).await
}

async fn read_glob_internal(
    prefix: &str,
    directory: FileSystemPathVc,
    glob: GlobVc,
    include_dot_files: bool,
) -> Result<ReadGlobResultVc> {
    let dir = directory.read_dir().await?;
    let mut result = ReadGlobResult::default();
    let glob_value = glob.await?;
    match &*dir {
        DirectoryContent::Entries(entries) => {
            for item in entries.iter() {
                match item {
                    (segment, DirectoryEntry::Directory(path)) => {
                        let full_path = format!("{prefix}{segment}");
                        let full_path_prefix = format!("{full_path}/");
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
    Ok(ReadGlobResultVc::cell(result))
}
