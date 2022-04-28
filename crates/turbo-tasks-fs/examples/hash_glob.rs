#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use anyhow::Result;
use async_std::task::{block_on, spawn};
use sha2::{Digest, Sha256};
use std::time::Instant;
use std::{collections::BTreeMap, env::current_dir};
use turbo_tasks::{MemoryBackend, NothingVc, TurboTasks, Vc};
use turbo_tasks_fs::glob::GlobVc;

use turbo_tasks_fs::{
    register, DirectoryEntry, DiskFileSystemVc, FileContent, FileSystemPathVc, FileSystemVc,
    ReadGlobResultVc,
};

fn main() {
    register();
    include!(concat!(env!("OUT_DIR"), "/register_example_hash_glob.rs"));

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
                let input = FileSystemPathVc::new(fs, "crates");
                let glob = GlobVc::new("**/*.rs");
                let glob_result = input.read_glob(glob, true);
                let dir_hash = hash_glob_result(glob_result);
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
pub fn empty_string() -> Vc<String> {
    Vc::slot("".to_string())
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: Vc<String>) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.as_str());
    Ok(())
}

#[turbo_tasks::function]
async fn hash_glob_result(result: ReadGlobResultVc) -> Result<Vc<String>> {
    let result = result.await?;
    let mut hashes = BTreeMap::new();
    for (name, entry) in result.results.iter() {
        match entry {
            DirectoryEntry::File(path) => {
                hashes.insert(name, hash_file(*path).await?.clone());
            }
            _ => {}
        }
    }
    for (name, result) in result.inner.iter() {
        let hash = hash_glob_result(*result).await?;
        if !hash.is_empty() {
            hashes.insert(name, hash.clone());
        }
    }
    if hashes.is_empty() {
        return Ok(empty_string());
    }
    let hash = hash_content(hashes.into_values().collect::<Vec<String>>().join(","));
    Ok(hash)
}

#[turbo_tasks::function]
async fn hash_file(file_path: FileSystemPathVc) -> Result<Vc<String>> {
    let content = file_path.read().await?;
    Ok(match &*content {
        FileContent::Content(bytes) => hash_content(bytes),
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
