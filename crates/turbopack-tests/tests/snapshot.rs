#![cfg(test)]

use std::{
    collections::{HashMap, HashSet, VecDeque},
    env, fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use once_cell::sync::Lazy;
use serde::Deserialize;
use similar::TextDiff;
use test_generator::test_resources;
use turbo_tasks::{debug::ValueDebug, NothingVc, TryJoinIterExt, TurboTasks, Value};
use turbo_tasks_env::DotenvProcessEnvVc;
use turbo_tasks_fs::{
    util::sys_to_unix, DirectoryContent, DirectoryEntry, DiskFileSystemVc, File, FileContent,
    FileSystem, FileSystemEntryType, FileSystemPathVc, FileSystemVc,
};
use turbo_tasks_hash::encode_hex;
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc},
    module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::{AssetContent, AssetContentVc, AssetVc},
    chunk::{dev::DevChunkingContextVc, ChunkableAssetVc},
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    issue::IssueVc,
    reference::all_referenced_assets,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source_asset::SourceAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;

fn register() {
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register_test_snapshot.rs"));
}

// Updates the existing snapshot outputs with the actual outputs of this run.
// `UPDATE=1 cargo test -p turbopack -- test_my_pattern`
static UPDATE: Lazy<bool> = Lazy::new(|| env::var("UPDATE").unwrap_or_default() == "1");

static WORKSPACE_ROOT: Lazy<String> = Lazy::new(|| {
    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    package_root
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_str()
        .unwrap()
        .to_string()
});

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

#[test_resources("crates/turbopack-tests/tests/snapshot/*/*/")]
fn test(resource: &'static str) {
    // Separating this into a different function fixes my IDE's types for some
    // reason...
    run(resource).unwrap();
}

#[tokio::main(flavor = "current_thread")]
async fn run(resource: &'static str) -> Result<()> {
    register();

    let tt = TurboTasks::new(MemoryBackend::new());
    let task = tt.spawn_once_task(async move {
        let out = run_test(resource.to_string());
        handle_issues(out).await?;
        Ok(NothingVc::new().into())
    });
    tt.wait_task_completion(task, true).await?;

    Ok(())
}

#[turbo_tasks::function]
async fn run_test(resource: String) -> Result<FileSystemPathVc> {
    let test_path = Path::new(&resource)
        // test_resources matches and returns relative paths from the workspace root,
        // but pwd in cargo tests is the crate under test.
        .strip_prefix("crates/turbopack-tests")?;
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
    let root_fs = DiskFileSystemVc::new("workspace".to_string(), WORKSPACE_ROOT.clone());
    let project_fs = DiskFileSystemVc::new("project".to_string(), WORKSPACE_ROOT.clone());
    let project_root = project_fs.root();

    let fs_path = Path::new(&resource);
    let resource = sys_to_unix(&resource);
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
    let static_root_path = path.join("static");
    let chunking_context =
        DevChunkingContextVc::builder(project_root, path, chunk_root_path, static_root_path)
            .build();

    let expected_paths = expected(chunk_root_path)
        .await?
        .union(&expected(static_root_path).await?)
        .copied()
        .collect();

    let modules = entry_paths.into_iter().map(SourceAssetVc::new).map(|p| {
        context.process(
            p.into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
        )
    });

    let chunks = modules
        .map(|module| async move {
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                // TODO: Load runtime entries from snapshots
                Ok(ecmascript.as_evaluated_chunk(chunking_context, runtime_entries))
            } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                Ok(chunkable.as_chunk(chunking_context))
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
    let mut queue = VecDeque::with_capacity(32);
    for chunk in chunks {
        queue.push_back(chunk.as_asset());
    }

    while let Some(asset) = queue.pop_front() {
        walk_asset(asset, &mut seen, &mut queue).await?;
    }

    matches_expected(expected_paths, seen).await?;

    Ok(path)
}

async fn remove_file(path: FileSystemPathVc) -> Result<()> {
    let fs = DiskFileSystemVc::resolve_from(path.fs())
        .await?
        .context(anyhow!("unexpected fs type"))?
        .await?;
    let sys_path = fs.to_sys_path(path).await?;
    fs::remove_file(&sys_path).context(format!("remove file {} error", sys_path.display()))?;
    Ok(())
}

async fn walk_asset(
    asset: AssetVc,
    seen: &mut HashSet<FileSystemPathVc>,
    queue: &mut VecDeque<AssetVc>,
) -> Result<()> {
    let path = asset.path();

    if !seen.insert(path) {
        return Ok(());
    }

    diff(path, asset.content()).await?;
    queue.extend(&*all_referenced_assets(asset).await?);

    Ok(())
}

async fn get_contents(file: AssetContentVc) -> Result<Option<String>> {
    Ok(match &*file.await? {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => None,
            FileContent::Content(expected) => Some(expected.content().to_str()?.trim().to_string()),
        },
        AssetContent::Redirect { target, link_type } => Some(format!(
            "Redirect {{ target: {target}, link_type: {:?} }}",
            link_type
        )),
    })
}

async fn diff(path: FileSystemPathVc, actual: AssetContentVc) -> Result<()> {
    let path_str = &path.await?.path;
    let expected = path.read().into();

    let actual = match get_contents(actual).await? {
        Some(s) => s,
        None => bail!("could not generate {} contents", path_str),
    };
    let expected = get_contents(expected).await?;

    if Some(&actual) != expected.as_ref() {
        if *UPDATE {
            let content = File::from(actual).into();
            path.write(content).await?;
            println!("updated contents of {}", path_str);
        } else {
            if expected.is_none() {
                eprintln!("new file {path_str} detected:");
            } else {
                eprintln!("contents of {path_str} did not match:");
            }
            let expected = expected.unwrap_or_default();
            let diff = TextDiff::from_lines(&expected, &actual);
            eprintln!(
                "{}",
                diff.unified_diff()
                    .context_radius(3)
                    .header("expected", "actual")
            );
            bail!("contents of {path_str} did not match");
        }
    }

    Ok(())
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

async fn expected(dir: FileSystemPathVc) -> Result<HashSet<FileSystemPathVc>> {
    let mut expected = HashSet::new();
    let entries = dir.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*entries {
        for (file, entry) in entries {
            match entry {
                DirectoryEntry::File(file) => {
                    expected.insert(*file);
                }
                _ => bail!(
                    "expected file at {}, found {:?}",
                    file,
                    FileSystemEntryType::from(entry)
                ),
            }
        }
    }
    Ok(expected)
}

/// Values in left that are not in right.
/// FileSystemPathVc hashes as a Vc, not as the file path, so we need to get the
/// path to properly diff.
async fn diff_paths(
    left: &HashSet<FileSystemPathVc>,
    right: &HashSet<FileSystemPathVc>,
) -> Result<HashSet<FileSystemPathVc>> {
    let mut map = left
        .iter()
        .map(|p| async move { Ok((p.await?.path.clone(), *p)) })
        .try_join()
        .await?
        .iter()
        .cloned()
        .collect::<HashMap<_, _>>();
    for p in right {
        map.remove(&p.await?.path);
    }
    Ok(map.values().copied().collect())
}

async fn matches_expected(
    expected: HashSet<FileSystemPathVc>,
    seen: HashSet<FileSystemPathVc>,
) -> Result<()> {
    for path in diff_paths(&expected, &seen).await? {
        let p = &path.await?.path;
        if *UPDATE {
            remove_file(path).await?;
            println!("removed file {}", p);
        } else {
            bail!("expected file {}, but it was not emitted", p);
        }
    }
    Ok(())
}

async fn handle_issues(source: FileSystemPathVc) -> Result<()> {
    let issues_path = source.join("issues");
    let expected_issues = expected(issues_path).await?;

    let mut seen = HashSet::new();
    let issues = IssueVc::peek_issues_with_path(source)
        .await?
        .strongly_consistent()
        .await?;

    for issue in issues.iter() {
        let plain_issue = issue.into_plain();
        let hash = encode_hex(*plain_issue.internal_hash().await?);

        let path = issues_path.join(&format!("{}-{}.txt", plain_issue.await?.title, &hash[0..6]));
        seen.insert(path);

        // Annoyingly, the PlainIssue.source -> PlainIssueSource.asset ->
        // PlainAsset.path -> FileSystemPath.fs -> DiskFileSystem.root changes
        // for everyone.
        let content =
            format!("{}", plain_issue.dbg().await?).replace(&*WORKSPACE_ROOT, "WORKSPACE_ROOT");
        let asset = File::from(content).into();

        diff(path, asset).await?;
    }

    matches_expected(expected_issues, seen).await
}
