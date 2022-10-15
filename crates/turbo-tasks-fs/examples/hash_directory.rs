#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(min_specialization)]

use std::{
    collections::BTreeMap,
    env::current_dir,
    time::{Duration, Instant},
};

use anyhow::Result;
use sha2::{Digest, Sha256};
use turbo_tasks::{primitives::StringVc, util::FormatDuration, NothingVc, TurboTasks};
use turbo_tasks_fs::{
    register, DirectoryContent, DirectoryEntry, DiskFileSystemVc, FileContent, FileSystemPathVc,
    FileSystemVc,
};
use turbo_tasks_memory::MemoryBackend;

#[tokio::main]
async fn main() -> Result<()> {
    register();
    include!(concat!(
        env!("OUT_DIR"),
        "/register_example_hash_directory.rs"
    ));

    let tt = TurboTasks::new(MemoryBackend::new());
    let start = Instant::now();

    let task = tt.spawn_root_task(|| {
        Box::pin(async {
            let root = current_dir().unwrap().to_str().unwrap().to_string();
            let disk_fs = DiskFileSystemVc::new("project".to_string(), root);
            disk_fs.await?.start_watching()?;

            // Smart Pointer cast
            let fs: FileSystemVc = disk_fs.into();
            let input = fs.root().join("demo");
            let dir_hash = hash_directory(input);
            print_hash(dir_hash);
            Ok(NothingVc::new().into())
        })
    });
    tt.wait_task_completion(task, true).await.unwrap();
    println!("done in {}", FormatDuration(start.elapsed()));

    loop {
        let (elapsed, count) = tt.get_or_wait_update_info(Duration::from_millis(100)).await;
        println!("updated {} tasks in {}", count, FormatDuration(elapsed));
    }
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: StringVc) -> Result<()> {
    println!("DIR HASH: {}", dir_hash.await?.as_str());
    Ok(())
}

async fn filename(path: FileSystemPathVc) -> Result<String> {
    Ok(path.await?.path.split('/').last().unwrap().to_string())
}

#[turbo_tasks::function]
async fn hash_directory(directory: FileSystemPathVc) -> Result<StringVc> {
    let dir_path = &directory.await?.path;
    let content = directory.read_dir();
    let mut hashes = BTreeMap::new();
    match &*content.await? {
        DirectoryContent::Entries(entries) => {
            for entry in entries.values() {
                match entry {
                    DirectoryEntry::File(path) => {
                        let name = filename(*path).await?;
                        hashes.insert(name, hash_file(*path).await?.clone_value());
                    }
                    DirectoryEntry::Directory(path) => {
                        let name = filename(*path).await?;
                        hashes.insert(name, hash_directory(*path).await?.clone_value());
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
