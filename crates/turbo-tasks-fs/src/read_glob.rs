use std::collections::HashMap;

use anyhow::Result;

use crate::{glob::GlobRef, DirectoryContent, DirectoryEntry, FileSystemPathRef};

#[turbo_tasks::value]
#[derive(PartialEq, Eq, Default, Debug)]
pub struct ReadGlobResult {
    pub results: HashMap<String, DirectoryEntry>,
    pub inner: HashMap<String, ReadGlobResultRef>,
}

#[turbo_tasks::function]
pub async fn read_glob(
    directory: FileSystemPathRef,
    glob: GlobRef,
    include_dot_files: bool,
) -> Result<ReadGlobResultRef> {
    read_glob_internal("", directory, glob, include_dot_files).await
}

#[turbo_tasks::function]
pub async fn read_glob_inner(
    prefix: String,
    directory: FileSystemPathRef,
    glob: GlobRef,
    include_dot_files: bool,
) -> Result<ReadGlobResultRef> {
    read_glob_internal(&prefix, directory, glob, include_dot_files).await
}

async fn read_glob_internal(
    prefix: &str,
    directory: FileSystemPathRef,
    glob: GlobRef,
    include_dot_files: bool,
) -> Result<ReadGlobResultRef> {
    let dir = directory.read_dir().await?;
    let mut result = ReadGlobResult::default();
    let glob_value = glob.get().await?;
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
                                .insert(full_path.clone(), DirectoryEntry::Directory(path.clone()));
                        }
                        if glob_value.execute(&full_path_prefix) {
                            result.inner.insert(
                                full_path,
                                read_glob_inner(
                                    full_path_prefix,
                                    path.clone(),
                                    glob.clone(),
                                    include_dot_files,
                                ),
                            );
                        }
                    }
                    (segment, entry) => {
                        let full_path = format!("{prefix}{segment}");
                        if glob_value.execute(&full_path) {
                            result.results.insert(full_path, entry.clone());
                        }
                    }
                }
            }
        }
        DirectoryContent::NotFound => {}
    }
    Ok(ReadGlobResultRef::slot(result))
}
