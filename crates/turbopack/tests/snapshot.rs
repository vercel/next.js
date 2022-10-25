#![cfg(test)]

mod helpers;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    env, fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use difference::Changeset;
use helpers::print_changeset;
use lazy_static::lazy_static;
use serde::Deserialize;
use test_generator::test_resources;
use turbo_tasks::{NothingVc, TryJoinIterExt, TurboTasks, Value};
use turbo_tasks_env::DotenvProcessEnvVc;
use turbo_tasks_fs::{
    util::sys_to_unix, DirectoryContent, DirectoryEntry, DiskFileSystemVc, File, FileContent,
    FileSystem, FileSystemEntryType, FileSystemPathVc, FileSystemVc,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc},
    module_options::ModuleOptionsContext,
    register,
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::{AssetContent, AssetContentVc, AssetVc},
    chunk::{dev::DevChunkingContextVc, ChunkableAssetVc},
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    reference::all_referenced_assets,
    source_asset::SourceAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;

lazy_static! {
    // Allows for interactive manual debugging of a test case in a browser with:
    // `UPDATE=1 cargo test -p turbopack -- test_my_pattern`
    static ref UPDATE: bool = env::var("UPDATE").is_ok();
}

#[derive(Debug, Deserialize)]
struct SnapshotOptions {
    #[serde(default = "default_browserslist")]
    browserslist: String,
    #[serde(default = "default_entry")]
    entry: String,
}

impl Default for SnapshotOptions {
    fn default() -> Self {
        SnapshotOptions {
            browserslist: default_browserslist(),
            entry: default_entry(),
        }
    }
}

fn default_browserslist() -> String {
    // Use a specific version to avoid churn in transform over time as the
    // preset_env crate data changes
    "Chrome 102".to_owned()
}

fn default_entry() -> String {
    "input/index.js".to_owned()
}

#[test_resources("crates/turbopack/tests/snapshot/integration/*")]
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

    let options_file = fs::read_to_string(test_path.join("options.json"));
    let options = match options_file {
        Err(_) => SnapshotOptions::default(),
        Ok(options_str) => serde_json::from_str(&options_str).unwrap(),
    };

    let tt = TurboTasks::new(MemoryBackend::new());
    let task = tt.spawn_once_task(async move {
        let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = package_root
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_str()
            .unwrap();

        let root_fs = DiskFileSystemVc::new("workspace".to_string(), workspace_root.to_owned());
        let project_fs = DiskFileSystemVc::new("project".to_string(), workspace_root.to_owned());
        let project_root = project_fs.root();

        let fs_path = Path::new(resource);
        let resource = sys_to_unix(resource);
        let path = root_fs.root().join(&resource);
        let project_path = project_root.join(&resource);

        let entry_asset = project_path.join(&options.entry);
        let entry_paths = vec![entry_asset];

        let runtime_entries = maybe_load_env(project_fs.into(), fs_path).await?;

        let env = EnvironmentVc::new(
            Value::new(ExecutionEnvironment::Browser(
                // TODO: load more from options.json
                BrowserEnvironment {
                    dom: true,
                    web_worker: false,
                    service_worker: false,
                    browserslist_query: options.browserslist.to_owned(),
                }
                .into(),
            )),
            Value::new(EnvironmentIntention::Client),
        );

        let context: AssetContextVc = ModuleAssetContextVc::new(
            TransitionsByNameVc::cell(HashMap::new()),
            env,
            ModuleOptionsContext {
                enable_emotion: true,
                enable_styled_components: true,
                preset_env_versions: Some(env),
                ..Default::default()
            }
            .into(),
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                enable_node_modules: true,
                custom_conditions: vec!["development".to_string()],
                ..Default::default()
            }
            .cell(),
        )
        .into();

        let chunk_root_path = path.join("output");
        let asset_root_path = path.join("static");
        let chunking_context =
            DevChunkingContextVc::builder(project_root, path, chunk_root_path, asset_root_path)
                .hot_module_replacment()
                .build();

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

        let chunks = modules
            .map(|module| async move {
                if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                    // TODO: Load runtime entries from snapshots
                    Ok(ecmascript.as_evaluated_chunk(chunking_context.into(), runtime_entries))
                } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                    Ok(chunkable.as_chunk(chunking_context.into()))
                } else {
                    // TODO convert into a serve-able asset
                    Err(anyhow!(
                        "Entry module is not chunkable, so it can't be used to bootstrap the \
                         application"
                    ))
                }
            })
            .try_join()
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
                remove_file(workspace_root, &path)?;
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
    let full_path = Path::new(root).join(path);
    fs::remove_file(&full_path).context(format!("remove file {} error", full_path.display()))?;
    Ok(())
}

async fn walk_asset(
    asset: AssetVc,
    seen: &mut HashSet<String>,
    queue: &mut VecDeque<AssetVc>,
) -> Result<()> {
    let path = asset.path();
    let path_str = path.await?.path.clone();

    if !seen.insert(path_str.to_string()) {
        return Ok(());
    }

    diff(path, asset.content(), path.read().into()).await?;
    queue.extend(&*all_referenced_assets(asset).await?);

    Ok(())
}

async fn diff(
    path: FileSystemPathVc,
    actual: AssetContentVc,
    expected: AssetContentVc,
) -> Result<()> {
    let path_str = &path.await?.path;

    let actual = match &*actual.await? {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => bail!("could not generate {} contents", path_str),
            FileContent::Content(actual) => trimmed_string(actual.content()),
        },
        AssetContent::Redirect { target, link_type } => {
            format!(
                "Redirect {{ target: {target}, link_type: {:?} }}",
                link_type
            )
        }
    };
    let changeset = match &*expected.await? {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => Changeset::new("", &actual, "\n"),
            FileContent::Content(expected) => {
                let expected = trimmed_string(expected.content());
                Changeset::new(&expected, &actual, "\n")
            }
        },
        AssetContent::Redirect { target, link_type } => Changeset::new(
            &format!(
                "Redirect {{ target: {target}, link_type: {:?} }}",
                link_type
            ),
            &actual,
            "\n",
        ),
    };

    if changeset.distance > 0 {
        if *UPDATE {
            let content = File::from(actual).into();
            path.write(content).await?;
            println!("updated contents of {}", path_str);
        } else {
            println!("{}", print_changeset(&changeset));
            bail!("contents of {} did not match", path_str);
        }
    }

    Ok(())
}

fn trimmed_string(input: &[u8]) -> String {
    String::from_utf8_lossy(input).trim().to_string()
}

async fn maybe_load_env(
    project_fs: FileSystemVc,
    path: &Path,
) -> Result<Option<EcmascriptChunkPlaceablesVc>> {
    let dotenv_path = path.join("input/.env");
    let dotenv_path = sys_to_unix(dotenv_path.to_str().unwrap());
    let dotenv_path = project_fs.root().join(&dotenv_path);

    if !dotenv_path.read().await?.is_content() {
        return Ok(None);
    }

    let env = DotenvProcessEnvVc::new(None, dotenv_path);
    let asset = ProcessEnvAssetVc::new(dotenv_path, env.into());
    Ok(Some(EcmascriptChunkPlaceablesVc::cell(vec![
        asset.as_ecmascript_chunk_placeable()
    ])))
}
