#![cfg(test)]

mod util;

use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context, Result};
use dunce::canonicalize;
use serde::Deserialize;
use turbo_tasks::{debug::ValueDebug, NothingVc, TryJoinIterExt, TurboTasks, Value, ValueToString};
use turbo_tasks_env::DotenvProcessEnvVc;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, util::sys_to_unix, DiskFileSystemVc, FileSystem,
    FileSystemPathReadRef, FileSystemPathVc,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    condition::ContextCondition,
    ecmascript::{EcmascriptModuleAssetVc, TransformPluginVc},
    module_options::{
        CustomEcmascriptTransformPlugins, CustomEcmascriptTransformPluginsVc, JsxTransformOptions,
        JsxTransformOptionsVc, ModuleOptionsContext,
    },
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_build::BuildChunkingContextVc;
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkableModule, ChunkableModuleVc, ChunkingContext, ChunkingContextVc, EvaluatableAssetVc,
        EvaluatableAssetsVc,
    },
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, AssetContextVc},
    environment::{BrowserEnvironment, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSourceVc,
    issue::IssueVc,
    output::{OutputAssetVc, OutputAssetsVc},
    reference::all_referenced_assets,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::SourceVc,
};
use turbopack_dev::DevChunkingContextVc;
use turbopack_ecmascript_plugins::transform::{
    emotion::{EmotionTransformConfig, EmotionTransformer},
    styled_components::{StyledComponentsTransformConfig, StyledComponentsTransformer},
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::ProcessEnvAssetVc;
use turbopack_test_utils::snapshot::{diff, expected, matches_expected, snapshot_issues};

use crate::util::REPO_ROOT;

fn register() {
    turbo_tasks::register();
    turbo_tasks_env::register();
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_build::register();
    turbopack_dev::register();
    turbopack_env::register();
    turbopack_ecmascript_plugins::register();
    turbopack_ecmascript_runtime::register();
    include!(concat!(env!("OUT_DIR"), "/register_test_snapshot.rs"));
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotOptions {
    #[serde(default = "default_browserslist")]
    browserslist: String,
    #[serde(default = "default_entry")]
    entry: String,
    #[serde(default)]
    runtime: Runtime,
    #[serde(default = "default_runtime_type")]
    runtime_type: RuntimeType,
    #[serde(default)]
    environment: Environment,
}

#[derive(Debug, Deserialize, Default)]
enum Runtime {
    #[default]
    Dev,
    Build,
}

#[derive(Debug, Deserialize, Default)]
enum Environment {
    #[default]
    Browser,
    NodeJs,
}

impl Default for SnapshotOptions {
    fn default() -> Self {
        SnapshotOptions {
            browserslist: default_browserslist(),
            entry: default_entry(),
            runtime: Default::default(),
            runtime_type: default_runtime_type(),
            environment: Default::default(),
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

fn default_runtime_type() -> RuntimeType {
    // We don't want all snapshot tests to also include the runtime every time,
    // as this would be a lot of extra noise whenever we make a single change to
    // the runtime. Instead, we only include the runtime in snapshots that
    // specifically request it via "runtime": "Default".
    RuntimeType::Dummy
}

#[testing::fixture("tests/snapshot/*/*/", exclude("node_modules"))]
fn test(resource: PathBuf) {
    let resource = canonicalize(resource).unwrap();
    // Separating this into a different function fixes my IDE's types for some
    // reason...
    run(resource).unwrap();
}

#[tokio::main(flavor = "current_thread")]
async fn run(resource: PathBuf) -> Result<()> {
    register();

    let tt = TurboTasks::new(MemoryBackend::default());
    let task = tt.spawn_once_task(async move {
        let out = run_test(resource.to_str().unwrap());
        let captured_issues = IssueVc::peek_issues_with_path(out)
            .await?
            .strongly_consistent()
            .await?;

        let plain_issues = captured_issues
            .iter_with_shortest_path()
            .map(|(issue_vc, path)| async move {
                Ok((
                    issue_vc.into_plain(path).await?,
                    issue_vc.into_plain(path).dbg().await?,
                ))
            })
            .try_join()
            .await?;

        snapshot_issues(plain_issues, out.join("issues"), &REPO_ROOT)
            .await
            .context("Unable to handle issues")?;
        Ok(NothingVc::new().into())
    });
    tt.wait_task_completion(task, true).await?;

    Ok(())
}

#[turbo_tasks::function]
async fn run_test(resource: &str) -> Result<FileSystemPathVc> {
    let test_path = Path::new(resource);
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
    let root_fs = DiskFileSystemVc::new("workspace".to_string(), REPO_ROOT.clone());
    let project_fs = DiskFileSystemVc::new("project".to_string(), REPO_ROOT.clone());
    let project_root = project_fs.root();

    let relative_path = test_path.strip_prefix(&*REPO_ROOT)?;
    let relative_path = sys_to_unix(relative_path.to_str().unwrap());
    let path = root_fs.root().join(&relative_path);
    let project_path = project_root.join(&relative_path);

    let entry_asset = project_path.join(&options.entry);

    let env = EnvironmentVc::new(Value::new(match options.environment {
        Environment::Browser => {
            ExecutionEnvironment::Browser(
                // TODO: load more from options.json
                BrowserEnvironment {
                    dom: true,
                    web_worker: false,
                    service_worker: false,
                    browserslist_query: options.browserslist.to_owned(),
                }
                .into(),
            )
        }
        Environment::NodeJs => {
            ExecutionEnvironment::NodeJsBuildTime(
                // TODO: load more from options.json
                NodeJsEnvironment::default().into(),
            )
        }
    }));
    let compile_time_info = CompileTimeInfo::builder(env)
        .defines(
            compile_time_defines!(
                process.turbopack = true,
                process.env.NODE_ENV = "development",
                DEFINED_VALUE = "value",
                DEFINED_TRUE = true,
                A.VERY.LONG.DEFINED.VALUE = "value",
            )
            .cell(),
        )
        .cell();

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms: vec![
                TransformPluginVc::cell(Box::new(
                    EmotionTransformer::new(&EmotionTransformConfig {
                        sourcemap: Some(false),
                        ..Default::default()
                    })
                    .expect("Should be able to create emotion transformer"),
                )),
                TransformPluginVc::cell(Box::new(StyledComponentsTransformer::new(
                    &StyledComponentsTransformConfig::default(),
                ))),
            ],
            output_transforms: vec![],
        },
    ));
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        compile_time_info,
        ModuleOptionsContext {
            enable_jsx: Some(JsxTransformOptionsVc::cell(JsxTransformOptions {
                development: true,
                ..Default::default()
            })),
            preset_env_versions: Some(env),
            rules: vec![(
                ContextCondition::InDirectory("node_modules".to_string()),
                ModuleOptionsContext {
                    ..Default::default()
                }
                .cell(),
            )],
            custom_ecma_transform_plugins,
            ..Default::default()
        }
        .into(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_react: true,
            enable_node_modules: Some(project_root),
            custom_conditions: vec!["development".to_string()],
            rules: vec![(
                ContextCondition::InDirectory("node_modules".to_string()),
                ResolveOptionsContext {
                    enable_node_modules: Some(project_root),
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

    let runtime_entries = maybe_load_env(context, project_path)
        .await?
        .map(|asset| EvaluatableAssetsVc::one(EvaluatableAssetVc::from_source(asset, context)));

    let chunk_root_path = path.join("output");
    let static_root_path = path.join("static");

    let chunking_context: ChunkingContextVc = match options.runtime {
        Runtime::Dev => DevChunkingContextVc::builder(
            project_root,
            path,
            chunk_root_path,
            static_root_path,
            env,
        )
        .runtime_type(options.runtime_type)
        .build()
        .into(),
        Runtime::Build => BuildChunkingContextVc::builder(
            project_root,
            path,
            chunk_root_path,
            static_root_path,
            env,
        )
        .runtime_type(options.runtime_type)
        .build()
        .into(),
    };

    let expected_paths = expected(chunk_root_path)
        .await?
        .union(&expected(static_root_path).await?)
        .copied()
        .collect();

    let entry_module = context.process(
        FileSourceVc::new(entry_asset).into(),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    );

    let chunks = if let Some(ecmascript) =
        EcmascriptModuleAssetVc::resolve_from(entry_module).await?
    {
        // TODO: Load runtime entries from snapshots
        match options.runtime {
            Runtime::Dev => chunking_context.evaluated_chunk_group(
                ecmascript.as_root_chunk(chunking_context),
                runtime_entries
                    .unwrap_or_else(EvaluatableAssetsVc::empty)
                    .with_entry(ecmascript.into()),
            ),
            Runtime::Build => {
                OutputAssetsVc::cell(vec![BuildChunkingContextVc::resolve_from(chunking_context)
                    .await?
                    .unwrap()
                    .entry_chunk(
                        // `expected` expects a completely flat output directory.
                        chunk_root_path
                            .join(
                                entry_module
                                    .ident()
                                    .path()
                                    .file_stem()
                                    .await?
                                    .as_deref()
                                    .unwrap(),
                            )
                            .with_extension("entry.js"),
                        ecmascript.into(),
                        runtime_entries
                            .unwrap_or_else(EvaluatableAssetsVc::empty)
                            .with_entry(ecmascript.into()),
                    )])
            }
        }
    } else if let Some(chunkable) = ChunkableModuleVc::resolve_from(entry_module).await? {
        chunking_context.chunk_group(chunkable.as_root_chunk(chunking_context))
    } else {
        // TODO convert into a serve-able asset
        bail!("Entry module is not chunkable, so it can't be used to bootstrap the application")
    };

    let mut seen = HashSet::new();
    let mut queue: VecDeque<_> = chunks.await?.iter().copied().collect();

    let output_path = path.await?;
    while let Some(asset) = queue.pop_front() {
        walk_asset(asset, &output_path, &mut seen, &mut queue)
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
    asset: OutputAssetVc,
    output_path: &FileSystemPathReadRef,
    seen: &mut HashSet<FileSystemPathVc>,
    queue: &mut VecDeque<OutputAssetVc>,
) -> Result<()> {
    let path = asset.ident().path().resolve().await?;

    if !seen.insert(path) {
        return Ok(());
    }

    if path.await?.is_inside(output_path) {
        // Only consider assets that should be written to disk.
        diff(path, asset.content()).await?;
    }

    queue.extend(
        all_referenced_assets(asset.into())
            .await?
            .iter()
            .copied()
            .map(|asset| async move { Ok(OutputAssetVc::resolve_from(asset).await?) })
            .try_join()
            .await?
            .into_iter()
            .flatten(),
    );

    Ok(())
}

async fn maybe_load_env(
    _context: AssetContextVc,
    path: FileSystemPathVc,
) -> Result<Option<SourceVc>> {
    let dotenv_path = path.join("input/.env");

    if !dotenv_path.read().await?.is_content() {
        return Ok(None);
    }

    let env = DotenvProcessEnvVc::new(None, dotenv_path);
    let asset = ProcessEnvAssetVc::new(dotenv_path, env.into());
    Ok(Some(asset.into()))
}
