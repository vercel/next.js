#![cfg(test)]

use std::{
    collections::{HashMap, HashSet, VecDeque},
    env, fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use serde::Deserialize;
use test_generator::test_resources;
use turbo_tasks::{debug::ValueDebug, NothingVc, TryJoinIterExt, TurboTasks, Value, ValueToString};
use turbo_tasks_env::DotenvProcessEnvVc;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, util::sys_to_unix, DiskFileSystemVc, FileSystem,
    FileSystemPathVc, FileSystemVc,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    condition::ContextCondition,
    ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc},
    module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{dev::DevChunkingContextVc, ChunkableAsset, ChunkableAssetVc},
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, AssetContextVc},
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    issue::IssueVc,
    reference::all_referenced_assets,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source_asset::SourceAssetVc,
};
use turbopack_env::ProcessEnvAssetVc;
use turbopack_test_utils::snapshot::{diff, expected, matches_expected, snapshot_issues};

fn register() {
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register_test_snapshot.rs"));
}

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

    let tt = TurboTasks::new(MemoryBackend::default());
    let task = tt.spawn_once_task(async move {
        let out = run_test(resource.to_string());
        let captured_issues = IssueVc::peek_issues_with_path(out)
            .await?
            .strongly_consistent()
            .await?;

        let plain_issues = captured_issues
            .iter()
            .map(|issue_vc| async move {
                Ok((
                    issue_vc.into_plain().await?,
                    issue_vc.into_plain().dbg().await?,
                ))
            })
            .try_join()
            .await?;

        snapshot_issues(
            plain_issues.into_iter(),
            out.join("issues"),
            &WORKSPACE_ROOT,
        )
        .await
        .context("Unable to handle issues")?;
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
        Ok(options_str) => parse_json_with_source_context(&options_str).unwrap(),
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
    let compile_time_info = CompileTimeInfo {
        environment: env,
        defines: compile_time_defines!(
            process.env.NODE_ENV = "development",
            DEFINED_VALUE = "value",
            DEFINED_TRUE = true,
            A.VERY.LONG.DEFINED.VALUE = "value",
        )
        .cell(),
    }
    .cell();

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        compile_time_info,
        ModuleOptionsContext {
            enable_jsx: true,
            enable_emotion: true,
            enable_styled_components: true,
            preset_env_versions: Some(env),
            rules: vec![(
                ContextCondition::InDirectory("node_modules".to_string()),
                ModuleOptionsContext {
                    ..Default::default()
                }
                .cell(),
            )],
            ..Default::default()
        }
        .into(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_react: true,
            enable_node_modules: true,
            custom_conditions: vec!["development".to_string()],
            rules: vec![(
                ContextCondition::InDirectory("node_modules".to_string()),
                ResolveOptionsContext {
                    enable_node_modules: true,
                    custom_conditions: vec!["development".to_string()],
                    ..Default::default()
                }
                .cell(),
            )],
            ..Default::default()
        }
        .cell(),
    )
    .into();

    let chunk_root_path = path.join("output");
    let static_root_path = path.join("static");
    let chunking_context =
        DevChunkingContextVc::builder(project_root, path, chunk_root_path, static_root_path, env)
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
        walk_asset(asset, &mut seen, &mut queue)
            .await
            .context(format!(
                "Failed to walk asset {}",
                asset
                    .ident()
                    .to_string()
                    .await
                    .context("to_string failed")?
            ))?;
    }

    matches_expected(expected_paths, seen)
        .await
        .context("Actual assets doesn't match with expected assets")?;

    Ok(path)
}

async fn walk_asset(
    asset: AssetVc,
    seen: &mut HashSet<FileSystemPathVc>,
    queue: &mut VecDeque<AssetVc>,
) -> Result<()> {
    let path = asset.ident().path().resolve().await?;

    if !seen.insert(path) {
        return Ok(());
    }

    diff(path, asset.content()).await?;
    queue.extend(&*all_referenced_assets(asset).await?);

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
