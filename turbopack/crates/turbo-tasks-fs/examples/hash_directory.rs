#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![feature(trivial_bounds)]

use std::{
    collections::BTreeMap,
    env::current_dir,
    io::Read,
    time::{Duration, Instant},
};

use anyhow::Result;
use sha2::{Digest, Sha256};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadConsistency, TurboTasks, UpdateInfo, Vc, util::FormatDuration};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath,
};

#[tokio::main]
async fn main() -> Result<()> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ));
    let start = Instant::now();

    let task = tt.spawn_root_task(|| {
        Box::pin(async {
            let root = current_dir().unwrap().to_str().unwrap().into();
            let disk_fs = DiskFileSystem::new(rcstr!("project"), root);
            disk_fs.await?.start_watching(None).await?;

            // Smart Pointer cast
            let fs: Vc<Box<dyn FileSystem>> = Vc::upcast(disk_fs);
            let input = fs.root().await?.join("demo")?;
            let dir_hash = hash_directory(input);
            print_hash(dir_hash).await?;
            Ok::<Vc<()>, _>(Default::default())
        })
    });
    tt.wait_task_completion(task, ReadConsistency::Strong)
        .await
        .unwrap();
    println!("done in {}", FormatDuration(start.elapsed()));

    loop {
        let UpdateInfo {
            duration, tasks, ..
        } = tt
            .get_or_wait_aggregated_update_info(Duration::from_millis(100))
            .await;
        println!("updated {} tasks in {}", tasks, FormatDuration(duration));
    }
}

#[turbo_tasks::function]
async fn print_hash(dir_hash: Vc<RcStr>) -> Result<Vc<()>> {
    println!("DIR HASH: {}", dir_hash.await?.as_str());
    Ok(Default::default())
}

async fn filename(path: FileSystemPath) -> Result<String> {
    Ok(path.path.split('/').next_back().unwrap().to_string())
}

#[turbo_tasks::function]
async fn hash_directory(directory: FileSystemPath) -> Result<Vc<RcStr>> {
    let dir_path = &directory.path;
    let content = directory.read_dir();
    let mut hashes = BTreeMap::new();
    match &*content.await? {
        DirectoryContent::Entries(entries) => {
            for entry in entries.values() {
                match entry {
                    DirectoryEntry::File(path) => {
                        let name = filename(path.clone()).await?;
                        hashes.insert(name, hash_file(path.clone()).owned().await?);
                    }
                    DirectoryEntry::Directory(path) => {
                        let name = filename(path.clone()).await?;
                        hashes.insert(name, hash_directory(path.clone()).owned().await?);
                    }
                    _ => {}
                }
            }
        }
        DirectoryContent::NotFound => {
            println!("{}: not found", directory.path);
        }
    };
    let hash = hash_content(
        &mut hashes
            .into_values()
            .collect::<Vec<RcStr>>()
            .join(",")
            .as_bytes(),
    );
    println!("hash_directory({dir_path})");
    Ok(hash)
}

#[turbo_tasks::function]
async fn hash_file(file_path: FileSystemPath) -> Result<Vc<RcStr>> {
    let content = file_path.read().await?;
    Ok(match &*content {
        FileContent::Content(file) => hash_content(&mut file.read()),
        FileContent::NotFound => {
            // report error
            Vc::cell(Default::default())
        }
    })
}

fn hash_content<R: Read>(content: &mut R) -> Vc<RcStr> {
    let mut hasher = Sha256::new();
    let mut buf = [0; 1024];
    while let Ok(size) = content.read(&mut buf) {
        hasher.update(&buf[0..size]);
    }
    let result = format!("{:x}", hasher.finalize());

    Vc::cell(result.into())
}
