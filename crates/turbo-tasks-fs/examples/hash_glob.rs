#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use anyhow::Result;
use async_std::task::{block_on, spawn};
use sha2::{Digest, Sha256};
use std::time::Instant;
use std::{collections::BTreeMap, env::current_dir};
use turbo_tasks::{NothingRef, TurboTasks};
use turbo_tasks_fs::glob::GlobRef;

use turbo_tasks_fs::{
    DirectoryEntry, DiskFileSystemRef, FileContent, FileSystemPathRef, FileSystemRef,
    ReadGlobResultRef,
};

fn main() {
    let tt = TurboTasks::new();
    block_on(async {
        let start = Instant::now();

        tt.spawn_root_task(|| {
            Box::pin(async {
                let root = current_dir().unwrap().to_str().unwrap().to_string();
                let disk_fs = DiskFileSystemRef::new("project".to_string(), root);
                disk_fs.get().await?.start_watching()?;

                // Smart Pointer cast
                let fs: FileSystemRef = disk_fs.into();
                let input = FileSystemPathRef::new(fs.clone(), "crates");
                let glob = GlobRef::new("**/*.rs");
                let glob_result = input.read_glob(glob, true);
                let dir_hash = hash_glob_result(glob_result);
                print_hash(dir_hash);
                Ok(NothingRef::new().into())
            })
        });
        spawn({
            let tt = tt.clone();
            async move {
                tt.wait_done().await;
                println!("done in {} ms", start.elapsed().as_millis());

                for task in tt.cached_tasks_iter() {
                    task.reset_executions();
                }

                loop {
                    let (elapsed, count) = tt.wait_done().await;
                    if elapsed.as_millis() >= 10 {
                        println!("updated {} tasks in {} ms", count, elapsed.as_millis());
                    } else {
                        println!("updated {} tasks in {} µs", count, elapsed.as_micros());
                    }
                }
            }
        })
        .await;
    });
}

#[turbo_tasks::value]
#[derive(PartialEq, Eq)]
struct ContentHash {
    value: String,
}

impl ContentHashRef {
    pub fn new(value: String) -> Self {
        Self::slot(ContentHash { value })
    }

    pub fn empty() -> Self {
        Self::slot(ContentHash {
            value: "".to_string(),
        })
    }
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: ContentHashRef) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.value);
    Ok(())
}

#[turbo_tasks::function]
async fn hash_glob_result(result: ReadGlobResultRef) -> Result<ContentHashRef> {
    let result = result.await?;
    let mut hashes = BTreeMap::new();
    for (name, entry) in result.results.iter() {
        match entry {
            DirectoryEntry::File(path) => {
                hashes.insert(name, hash_file(path.clone()).await?.value.clone());
            }
            _ => {}
        }
    }
    for (name, result) in result.inner.iter() {
        let hash = &hash_glob_result(result.clone()).await?.value;
        if !hash.is_empty() {
            hashes.insert(name, hash.clone());
        }
    }
    if hashes.is_empty() {
        return Ok(ContentHashRef::empty());
    }
    let hash = hash_content(hashes.into_values().collect::<Vec<String>>().join(","));
    Ok(hash)
}

#[turbo_tasks::function]
async fn hash_file(file_path: FileSystemPathRef) -> Result<ContentHashRef> {
    let content = file_path.clone().read().await?;
    Ok(match &*content {
        FileContent::Content(bytes) => hash_content(bytes),
        FileContent::NotFound => {
            // report error
            ContentHashRef::new("".to_string())
        }
    })
}

fn hash_content(content: impl AsRef<[u8]>) -> ContentHashRef {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let result = format!("{:x}", hasher.finalize());

    ContentHashRef::new(result)
}
