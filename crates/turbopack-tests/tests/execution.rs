#![cfg(test)]

mod util;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use turbo_tasks::{debug::ValueDebug, CompletionVc, NothingVc, TryJoinIterExt, TurboTasks, Value};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_env::CommandLineProcessEnvVc;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, util::sys_to_unix, DiskFileSystemVc, FileSystem,
    FileSystemPathVc,
};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    condition::ContextCondition,
    module_options::{ModuleOptionsContext, TypescriptTransformOptionsVc},
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::Asset,
    chunk::{EvaluatableAssetVc, EvaluatableAssetsVc},
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::{AssetContext, AssetContextVc},
    environment::{EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSourceVc,
    issue::IssueVc,
    module::ModuleVc,
    reference_type::{EntryReferenceSubType, ReferenceType},
};
use turbopack_dev::DevChunkingContextVc;
use turbopack_node::evaluate::evaluate;
use turbopack_test_utils::jest::JestRunResult;

use crate::util::REPO_ROOT;

#[turbo_tasks::value]
struct RunTestResult {
    js_result: JsResultVc,
    path: FileSystemPathVc,
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
        let run_result = run_test(resource_str);
        if matches!(snapshot_mode, IssueSnapshotMode::Snapshots) {
            snapshot_issues(run_result).await?;
        }

        Ok((*run_result.await.unwrap().js_result.await.unwrap()).clone())
    })
    .await
}

#[turbo_tasks::function]
async fn run_test(resource: &str) -> Result<RunTestResultVc> {
    let resource_path = Path::new(resource);
    assert!(resource_path.exists(), "{} does not exist", resource);
    assert!(
        resource_path.is_dir(),
        "{} is not a directory. Execution tests must be directories.",
        resource_path.to_str().unwrap()
    );

    let root_fs = DiskFileSystemVc::new("workspace".to_string(), REPO_ROOT.clone());
    let project_fs = DiskFileSystemVc::new("project".to_string(), REPO_ROOT.clone());
    let project_root = project_fs.root();

    let relative_path = resource_path.strip_prefix(&*REPO_ROOT)?;
    let relative_path = sys_to_unix(relative_path.to_str().unwrap());
    let path = root_fs.root().join(&relative_path);
    let project_path = project_root.join(&relative_path);
    let tests_path = project_fs.root().join("crates/turbopack-tests");

    let jest_runtime_path = tests_path.join("js/jest-runtime.ts");
    let jest_entry_path = tests_path.join("js/jest-entry.ts");
    let test_path = project_path.join("input/index.js");

    let chunk_root_path = path.join("output");
    let static_root_path = path.join("static");

    let env = EnvironmentVc::new(Value::new(ExecutionEnvironment::NodeJsBuildTime(
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

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        compile_time_info,
        ModuleOptionsContext {
            enable_typescript_transform: Some(TypescriptTransformOptionsVc::default()),
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
    )
    .into();

    let chunking_context = DevChunkingContextVc::builder(
        project_root,
        chunk_root_path,
        chunk_root_path,
        static_root_path,
        env,
    )
    .build();

    let jest_entry_asset = process_path_to_asset(jest_entry_path, context);
    let jest_runtime_asset = FileSourceVc::new(jest_runtime_path);
    let test_asset = FileSourceVc::new(test_path);

    let res = evaluate(
        jest_entry_asset.into(),
        chunk_root_path,
        CommandLineProcessEnvVc::new().into(),
        test_asset.ident(),
        context,
        chunking_context,
        Some(EvaluatableAssetsVc::many(vec![
            EvaluatableAssetVc::from_source(jest_runtime_asset.into(), context),
            EvaluatableAssetVc::from_source(test_asset.into(), context),
        ])),
        vec![],
        CompletionVc::immutable(),
        false,
    )
    .await?;

    let SingleValue::Single(bytes) = res
        .try_into_single()
        .await
        .context("test node result did not emit anything")?
    else {
        panic!("Evaluation stream must yield SingleValue.");
    };

    Ok(RunTestResult {
        js_result: JsResultVc::cell(parse_json_with_source_context(bytes.to_str()?)?),
        path,
    }
    .cell())
}

#[turbo_tasks::function]
async fn snapshot_issues(run_result: RunTestResultVc) -> Result<NothingVc> {
    let captured_issues = IssueVc::peek_issues_with_path(run_result)
        .await?
        .strongly_consistent()
        .await?;

    let RunTestResult { js_result: _, path } = *run_result.await?;

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

    turbopack_test_utils::snapshot::snapshot_issues(plain_issues, path.join("issues"), &REPO_ROOT)
        .await
        .context("Unable to handle issues")?;

    Ok(NothingVc::new())
}

#[turbo_tasks::function]
fn process_path_to_asset(path: FileSystemPathVc, context: AssetContextVc) -> ModuleVc {
    context.process(
        FileSourceVc::new(path).into(),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    )
}
