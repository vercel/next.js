#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use anyhow::Result;
use async_std::task::{block_on, spawn};
use sha2::{Digest, Sha256};
use std::time::Instant;
use std::{collections::BTreeMap, env::current_dir};
use turbo_tasks::{NothingVc, TurboTasks, Vc};
use turbo_tasks_memory::MemoryBackend;

use turbo_tasks_fs::{
    register, DirectoryContent, DirectoryEntry, DiskFileSystemVc, FileContent, FileSystemPathVc,
    FileSystemVc,
};

fn main() {
    register();
    include!(concat!(
        env!("OUT_DIR"),
        "/register_example_hash_directory.rs"
    ));

    let tt = TurboTasks::new(MemoryBackend::new());
    block_on(async {
        let start = Instant::now();

        tt.spawn_root_task(|| {
            Box::pin(async {
                let root = current_dir().unwrap().to_str().unwrap().to_string();
                let disk_fs = DiskFileSystemVc::new("project".to_string(), root);
                disk_fs.await?.start_watching()?;

                // Smart Pointer cast
                let fs: FileSystemVc = disk_fs.into();
                let input = FileSystemPathVc::new(fs, "demo");
                let dir_hash = hash_directory(input);
                print_hash(dir_hash);
                Ok(NothingVc::new().into())
            })
        });
        spawn({
            let tt = tt.clone();
            async move {
                tt.wait_done().await;
                println!("done in {} ms", start.elapsed().as_millis());

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

#[turbo_tasks::function]
async fn print_hash(dir_hash: Vc<String>) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.as_str());
    Ok(())
}

async fn filename(path: FileSystemPathVc) -> Result<String> {
    Ok(path.await?.path.split('/').last().unwrap().to_string())
}

#[turbo_tasks::function]
async fn hash_directory(directory: FileSystemPathVc) -> Result<Vc<String>> {
    let dir_path = &directory.await?.path;
    let content = directory.read_dir();
    let mut hashes = BTreeMap::new();
    match &*content.await? {
        DirectoryContent::Entries(entries) => {
            for entry in entries.values() {
                match entry {
                    DirectoryEntry::File(path) => {
                        let name = filename(*path).await?;
                        hashes.insert(name, hash_file(*path).await?.clone());
                    }
                    DirectoryEntry::Directory(path) => {
                        let name = filename(*path).await?;
                        hashes.insert(name, hash_directory(*path).await?.clone());
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
async fn hash_file(file_path: FileSystemPathVc) -> Result<Vc<String>> {
    let content = file_path.read().await?;
    Ok(match &*content {
        FileContent::Content(file) => hash_content(file),
        FileContent::NotFound => {
            // report error
            Vc::slot("".to_string())
        }
    })
}

fn hash_content(content: impl AsRef<[u8]>) -> Vc<String> {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let result = format!("{:x}", hasher.finalize());

    Vc::slot(result)
}
