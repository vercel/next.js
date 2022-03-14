#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use anyhow::Result;
use async_std::task::{block_on, spawn};
use sha2::{Digest, Sha256};
use std::time::Instant;
use std::{collections::BTreeMap, env::current_dir};
use turbo_tasks::{NothingRef, TurboTasks};

use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystemRef, FileContent, FileSystemPathRef,
    FileSystemRef,
};

fn main() {
    let tt = TurboTasks::new();
    block_on(async {
        let start = Instant::now();

        tt.spawn_root_task(|| {
            Box::pin(async {
                let root = current_dir().unwrap().to_str().unwrap().to_string();
                let disk_fs = DiskFileSystemRef::new("project".to_string(), root);

                // Smart Pointer cast
                let fs: FileSystemRef = disk_fs.into();
                let input = FileSystemPathRef::new(fs.clone(), "demo");
                let dir_hash = hash_directory(input);
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
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: ContentHashRef) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.value);
    Ok(())
}

async fn filename(path: &FileSystemPathRef) -> Result<String> {
    Ok(path
        .get()
        .await?
        .path
        .split('/')
        .last()
        .unwrap()
        .to_string())
}

#[turbo_tasks::function]
async fn hash_directory(directory: FileSystemPathRef) -> Result<ContentHashRef> {
    let dir_path = directory.get().await?.path.clone();
    let content = directory.clone().read_dir();
    let mut hashes = BTreeMap::new();
    match &*content.await? {
        DirectoryContent::Entries(entries) => {
            for entry in entries.iter() {
                match &*entry.get().await? {
                    DirectoryEntry::File(path) => {
                        let name = filename(path).await?;
                        hashes.insert(name, hash_file(path.clone()).await?.value.clone());
                    }
                    DirectoryEntry::Directory(path) => {
                        let name = filename(path).await?;
                        hashes.insert(name, hash_directory(path.clone()).await?.value.clone());
                    }
                    _ => {}
                }
            }
        }
        DirectoryContent::NotFound => {
            println!("{}: not found", directory.await?.path);
        }
    };
    let hash = hash_content(hashes.into_values().collect::<Vec<String>>().join(","));
    println!("hash_directory({})", dir_path);
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
