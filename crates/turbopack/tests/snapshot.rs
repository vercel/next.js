#![cfg(test)]

mod helpers;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    env, fs,
    path::Path,
};

use anyhow::{anyhow, Result};
use difference::Changeset;
use helpers::print_changeset;
use lazy_static::lazy_static;
use test_generator::test_resources;
use turbo_tasks::{util::try_join_all, NothingVc, TurboTasks, Value};
use turbo_tasks_fs::{
    util::sys_to_unix, DirectoryContent, DirectoryEntry, DiskFileSystemVc, FileContent,
    FileSystemEntryType, FileSystemPathVc,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{ecmascript::EcmascriptModuleAssetVc, register, ModuleAssetContextVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkableAssetVc,
    },
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    reference::all_referenced_assets,
    source_asset::SourceAssetVc,
    transition::TransitionsByNameVc,
};

lazy_static! {
    // Allows for interactive manual debugging of a test case in a browser with:
    // `TURBOPACK_SNAPSHOT_UPDATE=1 cargo test -p turbopack -- test_my_pattern`
    static ref UPDATE: bool = env::var("TURBOPACK_SNAPSHOT_UPDATE").is_ok();
}

#[test_resources("crates/turbopack/tests/snapshot/*/*")]
fn test(resource: &'static str) {
    // Separating this into a different function fixes my IDE's types for some
    // reason...
    run(resource).unwrap();
}

#[tokio::main(flavor = "current_thread")]
async fn run(resource: &'static str) -> Result<()> {
    register();

    let test_path = Path::new(resource)
        // test_resources matches and returns relative paths from the workspace root,
        // but pwd in cargo tests is the crate under test.
        .strip_prefix("crates/turbopack")?;
    assert!(test_path.exists(), "{} does not exist", resource);

    assert!(
        test_path.is_dir(),
        "{} is not a directory. Snapshot tests must be directories.",
        test_path.to_str().unwrap()
    );

    let tt = TurboTasks::new(MemoryBackend::new());

    let task = tt.spawn_once_task(async move {
        let root_path = "tests";
        let root_fs =
            DiskFileSystemVc::new("root of the dev server".to_string(), root_path.to_string());
        let project_fs = DiskFileSystemVc::new("project".to_string(), root_path.to_string());
        let fs = FileSystemPathVc::new(project_fs.into(), "");

        let path = test_path.strip_prefix("tests")?;

        // TODO: load from options.json
        let test_entry = path.join("input/index.js");
        let entry_asset = sys_to_unix(test_entry.to_str().unwrap());
        let entry_paths = vec![FileSystemPathVc::new(project_fs.into(), &entry_asset)];

        let context: AssetContextVc = ModuleAssetContextVc::new(
            TransitionsByNameVc::cell(HashMap::new()),
            fs,
            EnvironmentVc::new(
                Value::new(ExecutionEnvironment::Browser(
                    // TODO: load from options.json
                    BrowserEnvironment {
                        dom: true,
                        web_worker: false,
                        service_worker: false,
                        browser_version: 0,
                    }
                    .into(),
                )),
                Value::new(EnvironmentIntention::Client),
            ),
            Default::default(),
        )
        .into();

        let chunk_dir = path.join("output/");
        let static_dir = path.join("static/");
        let chunk_root_path = FileSystemPathVc::new(root_fs.into(), chunk_dir.to_str().unwrap());
        let chunking_context: DevChunkingContextVc = DevChunkingContext {
            context_path: fs,
            chunk_root_path,
            asset_root_path: FileSystemPathVc::new(root_fs.into(), static_dir.to_str().unwrap()),
        }
        .into();

        let existing_dir = chunk_root_path.read_dir().await?;
        let mut expected_paths = HashMap::new();
        if let DirectoryContent::Entries(entries) = &*existing_dir {
            for (file, entry) in entries {
                match entry {
                    DirectoryEntry::File(file) => {
                        expected_paths.insert(file.await?.path.clone(), file);
                    }
                    _ => panic!(
                        "expected file at {}, found {:?}",
                        file,
                        FileSystemEntryType::from(entry)
                    ),
                }
            }
        };

        let modules = entry_paths
            .into_iter()
            .map(|p| context.process(SourceAssetVc::new(p).into()));

        let chunks = try_join_all(modules.map(|module| async move {
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                Ok(ecmascript.as_evaluated_chunk(chunking_context.into(), None))
            } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                Ok(chunkable.as_chunk(chunking_context.into()))
            } else {
                // TODO convert into a serve-able asset
                Err(anyhow!(
                    "Entry module is not chunkable, so it can't be used to bootstrap the \
                     application"
                ))
            }
        }))
        .await?;

        let mut seen = HashSet::new();
        let mut queue = VecDeque::new();
        for chunk in chunks {
            queue.push_back(chunk.as_asset());
        }

        while let Some(asset) = queue.pop_front() {
            walk_asset(asset, &mut seen, &mut queue).await?;
        }

        for path_str in seen {
            expected_paths.remove(&path_str);
        }

        for (path, _entry) in expected_paths {
            if *UPDATE {
                remove_file(root_path, &path)?;
                println!("removed file {}", path);
            } else {
                panic!("expected file {}, but it was not emitted", path);
            }
        }

        Ok(NothingVc::new().into())
    });
    tt.wait_task_completion(task, true).await?;

    Ok(())
}

fn remove_file(root: &str, path: &str) -> Result<()> {
    // TODO: It'd be great if the entry exposed it's full path joined with the root
    // of its FS. But defining a new Vc is annoying and I want this to be done.
    let full_path = Path::new(root).join(&path);
    fs::remove_file(full_path)?;
    Ok(())
}

async fn walk_asset(
    asset: AssetVc,
    seen: &mut HashSet<String>,
    queue: &mut VecDeque<AssetVc>,
) -> Result<()> {
    let path_str = asset.path().await?.path.clone();

    if !seen.insert(path_str.to_string()) {
        return Ok(());
    }

    let actual_contents = asset.content().await?;
    let actual = match &*actual_contents {
        FileContent::NotFound => panic!("could not generate {} contents", path_str),
        FileContent::Content(actual) => trimmed_string(actual.content()),
    };
    let expected = asset.path().read();
    let changeset = match &*expected.await? {
        FileContent::NotFound => Changeset::new("", &actual, "\n"),
        FileContent::Content(expected) => {
            let expected = trimmed_string(expected.content());
            Changeset::new(&expected, &actual, "\n")
        }
    };

    if changeset.distance > 0 {
        if *UPDATE {
            asset.path().write(asset.content()).await?;
            println!("updated contents of {}", path_str);
        } else {
            println!("{}", print_changeset(&changeset));
            return Err(anyhow!("contents of {} did not match", path_str));
        }
    }

    queue.extend(&*all_referenced_assets(asset).await?);

    Ok(())
}

fn trimmed_string(input: &[u8]) -> String {
    String::from_utf8_lossy(input).trim().to_string()
}
