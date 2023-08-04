#![cfg(test)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

mod util;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use turbo_tasks::{unit, Completion, TryJoinIterExt, TurboTasks, Value, Vc};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_env::CommandLineProcessEnv;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, util::sys_to_unix, DiskFileSystem, FileSystem,
    FileSystemPath,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    condition::ContextCondition, module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext, ModuleAssetContext,
};
use turbopack_core::{
    chunk::{EvaluatableAssetExt, EvaluatableAssets},
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    issue::{Issue, IssueDescriptionExt},
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_dev::DevChunkingContext;
use turbopack_node::{debug::should_debug, evaluate::evaluate};
use turbopack_test_utils::jest::JestRunResult;

use crate::util::REPO_ROOT;

#[turbo_tasks::value]
struct RunTestResult {
    js_result: Vc<JsResult>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
struct JsResult {
    uncaught_exceptions: Vec<String>,
    unhandled_rejections: Vec<String>,
    #[turbo_tasks(trace_ignore)]
    jest_result: JestRunResult,
}

enum IssueSnapshotMode {
    Snapshots,
    NoSnapshots,
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_env::register();
    turbo_tasks_fs::register();
    turbopack::register();
    turbopack_dev::register();
    turbopack_env::register();
    turbopack_ecmascript_plugins::register();
    include!(concat!(env!("OUT_DIR"), "/register_test_execution.rs"));
}

// To minimize test path length and consistency with snapshot tests,
// node_modules is stored as a sibling of the test fixtures. Don't run
// it as a test.
//
// "Skip" directories named `__skipped__`, which include test directories to
// skip.
#[testing::fixture("tests/execution/*/*/*", exclude("node_modules|__skipped__"))]
fn test(resource: PathBuf) {
    let messages = get_messages(run(resource, IssueSnapshotMode::Snapshots).unwrap());
    if !messages.is_empty() {
        panic!(
            "Failed with error(s) in the following test(s):\n\n{}",
            messages.join("\n\n--\n")
        )
    }
}

#[testing::fixture("tests/execution/*/*/__skipped__/*/input")]
#[should_panic]
fn test_skipped_fails(resource: PathBuf) {
    let resource = resource.parent().unwrap().to_path_buf();

    let JsResult {
        // Ignore uncaught exceptions for skipped tests.
        uncaught_exceptions: _,
        unhandled_rejections: _,
        jest_result,
    } = run(resource, IssueSnapshotMode::NoSnapshots).unwrap();

    // Assert that this skipped test itself has at least one browser test which
    // fails.
    assert!(
        // Skipped tests sometimes have errors (e.g. unsupported syntax) that prevent tests from
        // running at all. Allow them to have empty results.
        jest_result.test_results.is_empty()
            || jest_result
                .test_results
                .into_iter()
                .any(|r| !r.errors.is_empty()),
    );
}

fn get_messages(js_results: JsResult) -> Vec<String> {
    let mut messages = vec![];

    if js_results.jest_result.test_results.is_empty() {
        messages.push("No tests were run.".to_string());
    }

    for test_result in js_results.jest_result.test_results {
        // It's possible to fail multiple tests across these tests,
        // so collect them and fail the respective test in Rust with
        // an aggregate message.
        if !test_result.errors.is_empty() {
            messages.push(format!(
                "\"{}\":\n{}",
                test_result.test_path[1..].join(" > "),
                test_result.errors.join("\n")
            ));
        }
    }

    for uncaught_exception in js_results.uncaught_exceptions {
        messages.push(format!("Uncaught exception: {}", uncaught_exception));
    }

    for unhandled_rejection in js_results.unhandled_rejections {
        messages.push(format!("Unhandled rejection: {}", unhandled_rejection));
    }

    messages
}

#[tokio::main(flavor = "current_thread")]
async fn run(resource: PathBuf, snapshot_mode: IssueSnapshotMode) -> Result<JsResult> {
    register();

    let tt = TurboTasks::new(MemoryBackend::default());
    tt.run_once(async move {
        let resource_str = resource.to_str().unwrap();
        let run_result = run_test(resource_str.to_string());
        if matches!(snapshot_mode, IssueSnapshotMode::Snapshots) {
            snapshot_issues(run_result).await?;
        }

        Ok((*run_result.await.unwrap().js_result.await.unwrap()).clone())
    })
    .await
}

#[turbo_tasks::function]
async fn run_test(resource: String) -> Result<Vc<RunTestResult>> {
    let resource_path = Path::new(&resource);
    assert!(resource_path.exists(), "{} does not exist", resource);
    assert!(
        resource_path.is_dir(),
        "{} is not a directory. Execution tests must be directories.",
        resource_path.to_str().unwrap()
    );

    let root_fs = DiskFileSystem::new("workspace".to_string(), REPO_ROOT.clone());
    let project_fs = DiskFileSystem::new("project".to_string(), REPO_ROOT.clone());
    let project_root = project_fs.root();

    let relative_path = resource_path.strip_prefix(&*REPO_ROOT)?;
    let relative_path = sys_to_unix(relative_path.to_str().unwrap());
    let path = root_fs.root().join(relative_path.to_string());
    let project_path = project_root.join(relative_path.to_string());
    let tests_path = project_fs.root().join("crates/turbopack-tests".to_string());

    let jest_runtime_path = tests_path.join("js/jest-runtime.ts".to_string());
    let jest_entry_path = tests_path.join("js/jest-entry.ts".to_string());
    let test_path = project_path.join("input/index.js".to_string());

    let chunk_root_path = path.join("output".to_string());
    let static_root_path = path.join("static".to_string());

    let env = Environment::new(Value::new(ExecutionEnvironment::NodeJsBuildTime(
        NodeJsEnvironment::default().into(),
    )));

    let compile_time_info = CompileTimeInfo::builder(env)
        .defines(
            compile_time_defines!(
                process.turbopack = true,
                process.env.NODE_ENV = "development",
            )
            .cell(),
        )
        .cell();

    let context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Vc::cell(HashMap::new()),
        compile_time_info,
        ModuleOptionsContext {
            enable_typescript_transform: Some(Default::default()),
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
    ));

    let chunking_context = DevChunkingContext::builder(
        project_root,
        chunk_root_path,
        chunk_root_path,
        static_root_path,
        env,
    )
    .build();

    let jest_entry_asset = process_path_to_asset(jest_entry_path, context);
    let jest_runtime_asset = FileSource::new(jest_runtime_path);
    let test_asset = FileSource::new(test_path);

    let res = evaluate(
        jest_entry_asset,
        path,
        Vc::upcast(CommandLineProcessEnv::new()),
        test_asset.ident(),
        context,
        Vc::upcast(chunking_context),
        Some(EvaluatableAssets::many(vec![
            jest_runtime_asset.to_evaluatable(context),
            test_asset.to_evaluatable(context),
        ])),
        vec![],
        Completion::immutable(),
        should_debug("execution_test"),
    )
    .await?;

    let single = res
        .try_into_single()
        .await
        .context("test node result did not emit anything")?;

    let SingleValue::Single(bytes) = single else {
        return Ok(RunTestResult {
            js_result: JsResult {
                uncaught_exceptions: vec![],
                unhandled_rejections: vec![],
                jest_result: JestRunResult {
                    test_results: vec![],
                },
            }
            .cell(),
            path,
        }
        .cell());
    };

    Ok(RunTestResult {
        js_result: JsResult::cell(parse_json_with_source_context(bytes.to_str()?)?),
        path,
    }
    .cell())
}

#[turbo_tasks::function]
async fn snapshot_issues(run_result: Vc<RunTestResult>) -> Result<Vc<()>> {
    let captured_issues = run_result
        .peek_issues_with_path()
        .await?
        .strongly_consistent()
        .await?;

    let RunTestResult { js_result: _, path } = *run_result.await?;

    let plain_issues = captured_issues
        .iter_with_shortest_path()
        .map(|(issue_vc, path)| async move { issue_vc.into_plain(path).await })
        .try_join()
        .await?;

    turbopack_test_utils::snapshot::snapshot_issues(
        plain_issues,
        path.join("issues".to_string()),
        &REPO_ROOT,
    )
    .await
    .context("Unable to handle issues")?;

    Ok(unit())
}

#[turbo_tasks::function]
fn process_path_to_asset(
    path: Vc<FileSystemPath>,
    context: Vc<Box<dyn AssetContext>>,
) -> Vc<Box<dyn Module>> {
    context.process(
        Vc::upcast(FileSource::new(path)),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    )
}
