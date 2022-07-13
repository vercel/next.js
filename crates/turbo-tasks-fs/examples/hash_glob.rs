#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(min_specialization)]

use std::{collections::BTreeMap, env::current_dir, time::Instant};

use anyhow::Result;
use sha2::{Digest, Sha256};
use turbo_tasks::{primitives::StringVc, NothingVc, TurboTasks};
use turbo_tasks_fs::{
    glob::GlobVc, register, DirectoryEntry, DiskFileSystemVc, FileContent, FileSystemPathVc,
    FileSystemVc, ReadGlobResultVc,
};
use turbo_tasks_memory::MemoryBackend;

#[tokio::main]
async fn main() {
    register();
    include!(concat!(env!("OUT_DIR"), "/register_example_hash_glob.rs"));

    let tt = TurboTasks::new(MemoryBackend::new());
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
    tt.wait_done().await;
    println!("done in {} ms", start.elapsed().as_millis());

    loop {
        let (elapsed, count) = tt.wait_next_done().await;
        if elapsed.as_millis() >= 10 {
            println!("updated {} tasks in {} ms", count, elapsed.as_millis());
        } else {
            println!("updated {} tasks in {} µs", count, elapsed.as_micros());
        }
    }
}

#[turbo_tasks::function]
pub fn empty_string() -> StringVc {
    StringVc::cell("".to_string())
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: StringVc) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.as_str());
    Ok(())
}

#[turbo_tasks::function]
async fn hash_glob_result(result: ReadGlobResultVc) -> Result<StringVc> {
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
async fn hash_file(file_path: FileSystemPathVc) -> Result<StringVc> {
    let content = file_path.read().await?;
    Ok(match &*content {
        FileContent::Content(file) => hash_content(file),
        FileContent::NotFound => {
            // report error
            StringVc::cell("".to_string())
        }
    })
}

fn hash_content(content: impl AsRef<[u8]>) -> StringVc {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let result = format!("{:x}", hasher.finalize());

    StringVc::cell(result)
}
