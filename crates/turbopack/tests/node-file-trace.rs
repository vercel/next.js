#![feature(min_specialization)]

mod helpers;
use helpers::print_changeset;

/// Explicit extern crate to use allocator.
extern crate turbo_malloc;
#[cfg(feature = "bench_against_node_nft")]
use std::time::Instant;
use std::{
    collections::HashMap,
    env::temp_dir,
    fmt::Display,
    fs::{self, remove_dir_all},
    io::{ErrorKind, Write as _},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use difference::Changeset;
use lazy_static::lazy_static;
use regex::Regex;
use rstest::*;
use rstest_reuse::{self, *};
use serde::{Deserialize, Serialize};
use tokio::{process::Command, time::timeout};
use turbo_tasks::{backend::Backend, TurboTasks, Value, ValueToString};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystem, FileSystemPathVc, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{
    emit_with_completion, rebase::RebasedAssetVc, register,
    resolve_options_context::ResolveOptionsContext, transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::Asset,
    context::AssetContext,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    source_asset::SourceAssetVc,
};

#[template]
#[rstest]
#[case::analytics_node("integration/analytics-node.js")]
#[case::array_map_require("integration/array-map-require/index.js")]
#[case::apollo("integration/apollo.js")]
#[case::argon2("integration/argon2.js")]
#[case::auth0("integration/auth0.js")]
#[case::aws_sdk("integration/aws-sdk.js")]
#[case::axios("integration/axios.js")]
#[case::azure_cosmos("integration/azure-cosmos.js")]
#[case::azure_storage("integration/azure-storage.js")]
#[case::bcrypt("integration/bcrypt.js")]
#[case::better_sqlite3("integration/better-sqlite3.js")]
#[should_panic(expected = "Error: Could not locate the bindings file.")]
#[case::bindings_failure("integration/bindings-failure.js")]
#[case::browserify_middleware("integration/browserify-middleware.js")]
#[case::bugsnag_js("integration/bugsnag-js.js")]
#[case::bull("integration/bull.js")]
#[case::bull_mq("integration/bullmq.js")]
#[case::camaro("integration/camaro.js")]
#[case::canvas("integration/canvas.js")]
#[case::chromeless("integration/chromeless.js")]
#[case::core_js("integration/core-js.js")]
#[case::cosmosdb_query("integration/cosmosdb-query.js")]
#[case::cowsay("integration/cowsay.js")]
#[should_panic(expected = "Error: Cannot find module '../../out/node-file-trace'")]
#[case::dogfood("integration/dogfood.js")]
#[case::dynamic_in_package("integration/dynamic-in-package.js")]
#[case::empty("integration/empty.js")]
#[case::env_var("integration/env-var.js")]
#[case::es_get_iterator("integration/es-get-iterator.js")]
#[case::esbuild("integration/esbuild.js")]
#[case::esm("integration/esm.js")]
#[case::express_consolidate("integration/express-consolidate.js")]
#[case::express_template_engine("integration/express-template-engine.js")]
#[case::express_template_pug("integration/express-template.js")]
#[case::express("integration/express.js")]
#[case::fast_glob("integration/fast-glob.js")]
#[case::fetch_h2("integration/fetch-h2.js")]
#[cfg_attr(target_arch = "x86_64", case::ffmpeg_js("integration/ffmpeg.js"))]
// Could not find ffmpeg executable
#[case::firebase_admin("integration/firebase-admin.js")]
#[case::firebase("integration/firebase.js")]
#[case::firestore("integration/firestore.js")]
#[case::fluent_ffmpeg("integration/fluent-ffmpeg.js")]
#[case::geo_tz("integration/geo-tz.js")]
#[case::google_bigquery("integration/google-bigquery.js")]
#[case::got("integration/got.js")]
#[case::highlights("integration/highlights.js")]
#[case::hot_shots("integration/hot-shots.js")]
#[case::ioredis("integration/ioredis.js")]
#[case::isomorphic_unfetch("integration/isomorphic-unfetch.js")]
#[case::jimp("integration/jimp.js")]
#[case::jugglingdb("integration/jugglingdb.js")]
#[case::koa("integration/koa.js")]
#[case::leveldown("integration/leveldown.js")]
#[case::lighthouse("integration/lighthouse.js")]
#[case::loopback("integration/loopback.js")]
#[case::mailgun("integration/mailgun.js")]
#[case::mariadb("integration/mariadb.js")]
#[case::memcached("integration/memcached.js")]
#[case::mongoose("integration/mongoose.js")]
#[case::mysql("integration/mysql.js")]
#[case::npm("integration/npm.js")]
// unable to resolve esm request module 'spdx-license-ids' in
// node-file-trace/node_modules/npm/node_modules/spdx-correct oracledb doesn't support non x86
// architectures
#[cfg_attr(target_arch = "x86_64", case::oracledb("integration/oracledb.js"))]
#[case::paraphrase("integration/paraphrase.js")]
#[case::passport_trakt("integration/passport-trakt.js")]
#[case::passport("integration/passport.js")]
#[case::path_platform("integration/path-platform.js")]
#[case::pixelmatch("integration/pixelmatch.js")]
#[case::pdf2json("integration/pdf2json.mjs")]
#[case::pdfkit("integration/pdfkit.js")]
#[case::pg("integration/pg.js")]
#[case::playwright_core("integration/playwright-core.js")]
#[case::pnpm_like("integration/pnpm/pnpm-like.js")]
#[case::polyfill_library("integration/polyfill-library.js")]
#[case::pug("integration/pug.js")]
#[case::react("integration/react.js")]
#[case::redis("integration/redis.js")]
#[case::remark_prism("integration/remark-prism.mjs")]
#[case::request("integration/request.js")]
#[case::rxjs("integration/rxjs.js")]
#[case::saslprep("integration/saslprep.js")]
#[case::semver("integration/semver.js")]
#[case::sentry("integration/sentry.js")]
#[case::sequelize("integration/sequelize.js")]
#[cfg_attr(
    target_os = "windows",
    should_panic(expected = "Something went wrong installing the \"sharp\" module"),
    case::sharp("integration/sharp.js")
)]
#[cfg_attr(not(target_os = "windows"), case::sharp("integration/sharp.js"))]
#[case::simple("integration/simple.js")]
#[case::socket_io("integration/socket.io.js")]
#[case::source_map("integration/source-map/index.js")]
#[case::sparql_builder("integration/sparql-builder.js")]
#[case::sqlite("integration/sqlite.js")]
#[case::stripe("integration/stripe.js")]
#[case::strong_error_handler("integration/strong-error-handler.js")]
#[case::symlink_to_file("integration/symlink-to-file/index.js")]
#[case::tensorflow("integration/tensorflow.js")]
#[case::tiny_json_http("integration/tiny-json-http.js")]
#[case::twilio("integration/twilio.js")]
#[case::ts_morph("integration/ts-morph.js")]
#[case::typescript("integration/typescript.js")]
#[case::uglify("integration/uglify.js")]
#[case::underscore("integration/underscore.js")]
#[case::vm2("integration/vm2.js")]
#[case::vue("integration/vue.js")]
#[case::whatwg_url("integration/whatwg-url.js")]
#[case::when("integration/when.js")]
// These two tests print a deprecation warning about using folders in exports field to stderr.
#[case::package_exports_alt_folders_base(
    CaseInput::new("integration/package-exports/pass/alt-folders.js").expected_stderr("DeprecationWarning")
)]
#[case::package_exports_folder(
    CaseInput::new("integration/package-exports/pass/folder.js").expected_stderr("DeprecationWarning")
)]
#[case::package_exports_alt_base("integration/package-exports/pass/alt.js")]
#[case::package_exports_catch_all("integration/package-exports/pass/catch-all.js")]
#[case::package_exports_direct("integration/package-exports/pass/direct.js")]
#[case::package_exports_double("integration/package-exports/pass/double.js")]
#[case::package_exports_nested("integration/package-exports/pass/nested.js")]
#[case::package_exports_package_root("integration/package-exports/pass/root.js")]
#[case::package_exports_package_single_export_root(
    "integration/package-exports/pass/single-export-root.js"
)]
#[case::package_exports_package_sub_infix_sep("integration/package-exports/pass/sub-infix-sep.js")]
#[case::package_exports_package_sub_infix_base("integration/package-exports/pass/sub-infix.js")]
#[case::package_exports_package_sub_prefix_sep(
    "integration/package-exports/pass/sub-prefix-sep.js"
)]
#[case::package_exports_package_sub_prefix("integration/package-exports/pass/sub-prefix.js")]
#[case::package_exports_package_sub_suffix_sep(
    "integration/package-exports/pass/sub-suffix-sep.js"
)]
#[case::package_exports_package_sub_suffix_base("integration/package-exports/pass/sub-suffix.js")]
#[case::package_exports_alt_folders_multiple(
    CaseInput::new("integration/package-exports/fail/alt-folders-multiple.js")
        .expected_stderr("Error [ERR_MODULE_NOT_FOUND]: Cannot find module")
)]
#[case::package_exports_alt_multiple(
    CaseInput::new("integration/package-exports/fail/alt-multiple.js")
        .expected_stderr("Error [ERR_MODULE_NOT_FOUND]: Cannot find module")
)]
#[cfg_attr(
    not(feature = "bench_against_node_nft"),
    case::ts_package_base("integration/ts-package/index.ts"),
    case::ts_package_extends("integration/ts-package-extends/index.ts"),
    case::ts_package_from_js("integration/ts-package-from-js/index.js"),
    case::ts_paths_alt_base("integration/ts-paths/pass/alt.ts"),
    case::ts_paths_catch_all("integration/ts-paths/pass/catch-all.ts"),
    case::ts_paths_direct("integration/ts-paths/pass/direct.ts"),
    case::ts_paths_nested("integration/ts-paths/pass/nested.ts"),
    case::ts_paths_package_sub_prefix("integration/ts-paths/pass/sub-prefix.ts"),
    case::ts_paths_package_sub_suffix_sep_base("integration/ts-paths/pass/sub-suffix-sep.ts"),
    case::ts_paths_package_sub_suffix_base("integration/ts-paths/pass/sub-suffix.ts"),
    case::ts_paths_alt_folders(
        CaseInput::new("integration/ts-paths/fail/alt-folders.ts")
            .expected_stderr("Cannot find module 'fixtures/alt-folders/alt1.js'")
    ),
    case::ts_paths_double(
        CaseInput::new("integration/ts-paths/fail/double.ts")
            .expected_stderr("Cannot find module 'double/sub' or its corresponding type declarations.")
    ),
    case::ts_paths_folder(
        CaseInput::new("integration/ts-paths/fail/folder.ts")
            .expected_stderr("Cannot find module 'folder/alt1' or its corresponding type declarations.")
    ),
    // TODO(alexkirsz) I expect the two following infix tests are only failing when using `tsconfig-paths`, since
    // VSCode's TS language server can resolve them properly. We should pre-compile the TS files to JS and run Node.js
    // on them directly instead.
    case::ts_paths_package_sub_infix_sep(
        CaseInput::new("integration/ts-paths/fail/sub-infix-sep.ts")
            .expected_stderr("Cannot find module '@/sub/@'")
    ),
    case::ts_paths_package_sub_infix_base(
        CaseInput::new("integration/ts-paths/fail/sub-infix.ts")
            .expected_stderr("Cannot find module '@sub@'")
    ),
    case::ts_paths_sub_prefix_sep(
        CaseInput::new("integration/ts-paths/fail/sub-prefix-sep.ts")
            .expected_stderr("Cannot find module 'sub/@' or its corresponding type declarations")
    ),
)]
fn test_cases() {}

#[apply(test_cases)]
fn node_file_trace_memory(#[case] input: CaseInput) {
    node_file_trace(
        input,
        "memory",
        false,
        1,
        120,
        |_| TurboTasks::new(MemoryBackend::new()),
        |tt| {
            let b = tt.backend();
            b.with_all_cached_tasks(|task| {
                b.with_task(task, |task| {
                    if task.is_pending() {
                        println!("PENDING: {task}");
                    }
                })
            });
        },
    );
}

#[cfg(feature = "test_persistent_cache")]
#[apply(test_cases)]
fn node_file_trace_rocksdb(#[case] input: CaseInput) {
    use turbo_tasks_memory::MemoryBackendWithPersistedGraph;
    use turbo_tasks_rocksdb::RocksDbPersistedGraph;

    node_file_trace(
        input,
        "rockdb",
        false,
        2,
        240,
        |directory_path| {
            TurboTasks::new(MemoryBackendWithPersistedGraph::new(
                RocksDbPersistedGraph::new(directory_path.join(".db")).unwrap(),
            ))
        },
        |_| {},
    );
}

#[cfg(feature = "bench_against_node_nft")]
#[apply(test_cases)]
fn bench_against_node_nft_st(#[case] input: CaseInput) {
    bench_against_node_nft_inner(input, false);
}

#[cfg(feature = "bench_against_node_nft")]
#[apply(test_cases)]
fn bench_against_node_nft_mt(#[case] input: CaseInput) {
    bench_against_node_nft_inner(input, true);
}

#[cfg(feature = "bench_against_node_nft")]
fn bench_against_node_nft_inner(input: CaseInput, multi_threaded: bool) {
    node_file_trace(
        input,
        "memory",
        multi_threaded,
        1,
        120,
        |_| TurboTasks::new(MemoryBackend::new()),
        |tt| {
            let b = tt.backend();
            b.with_all_cached_tasks(|task| {
                b.with_task(task, |task| {
                    if task.is_pending() {
                        println!("PENDING: {task}");
                    }
                })
            });
        },
    );
}

fn node_file_trace<B: Backend + 'static>(
    CaseInput {
        path: input_path,
        expected_stderr,
    }: CaseInput,
    mode: &str,
    multi_threaded: bool,
    run_count: i32,
    timeout_len: u64,
    create_turbo_tasks: impl Fn(&Path) -> Arc<TurboTasks<B>>,
    handle_timeout_error: impl Fn(&Arc<TurboTasks<B>>),
) {
    lazy_static! {
        static ref BENCH_SUITES: Arc<Mutex<Vec<BenchSuite>>> = Arc::new(Mutex::new(Vec::new()));
    };

    let r = &mut {
        let mut builder = if multi_threaded {
            tokio::runtime::Builder::new_multi_thread()
        } else {
            tokio::runtime::Builder::new_current_thread()
        };
        builder.enable_all();
        if !multi_threaded {
            builder.max_blocking_threads(20);
        }
        builder.build().unwrap()
    };
    r.block_on(async move {
        register();
        include!(concat!(
            env!("OUT_DIR"),
            "/register_test_node-file-trace.rs"
        ));
        let bench_suites = BENCH_SUITES.clone();
        let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = package_root.parent().unwrap().parent().unwrap();
        let mut tests_output_root = temp_dir();
        tests_output_root.push("tests_output");
        let workspace_root = workspace_root.to_string_lossy().to_string();
        let input = format!("node-file-trace/{input_path}");
        let directory_path = tests_output_root.join(&format!("{mode}_{input}"));
        let directory = directory_path.to_string_lossy().to_string();

        remove_dir_all(&directory)
            .or_else(|err| {
                if err.kind() == ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(err)
                }
            })
            .context(format!("Failed to remove directory: {directory}"))
            .unwrap();

        for _ in 0..run_count {
            let bench_suites = bench_suites.clone();
            let workspace_root = workspace_root.clone();
            let input_string = input.clone();
            let directory = directory.clone();
            let expected_stderr = expected_stderr.clone();
            let task = async move {
                #[allow(unused)]
                let bench_suites = bench_suites.clone();
                #[cfg(feature = "bench_against_node_nft")]
                let before_start = Instant::now();
                let workspace_fs: FileSystemVc =
                    DiskFileSystemVc::new("workspace".to_string(), workspace_root.clone()).into();
                let input_dir = workspace_fs.root();
                let input = input_dir.join(&format!("crates/turbopack/tests/{input_string}"));

                #[cfg(not(feature = "bench_against_node_nft"))]
                let original_output = exec_node(workspace_root, input);

                let output_fs = DiskFileSystemVc::new("output".to_string(), directory.clone());
                let output_dir = output_fs.root();

                let source = SourceAssetVc::new(input);
                let context = ModuleAssetContextVc::new(
                    TransitionsByNameVc::cell(HashMap::new()),
                    EnvironmentVc::new(
                        Value::new(ExecutionEnvironment::NodeJsLambda(
                            NodeJsEnvironment::default().into(),
                        )),
                        Value::new(EnvironmentIntention::ServerRendering),
                    ),
                    Default::default(),
                    ResolveOptionsContext {
                        enable_node_native_modules: true,
                        enable_node_modules: true,
                        custom_conditions: vec!["node".to_string()],
                        ..Default::default()
                    }
                    .cell(),
                );
                let module = context.process(source.into());
                let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                let output_path = rebased.path();
                emit_with_completion(rebased.into(), output_dir).await?;

                #[cfg(not(feature = "bench_against_node_nft"))]
                {
                    let output = exec_node(directory.clone(), output_path);
                    let output = assert_output(original_output, output, expected_stderr);
                    output.await
                }
                #[cfg(feature = "bench_against_node_nft")]
                {
                    let duration = before_start.elapsed();
                    let node_start = Instant::now();
                    exec_node(tests_root, input.clone()).await?;
                    let node_duration = node_start.elapsed();
                    let is_faster = node_duration > duration;
                    {
                        let mut bench_suites_lock = bench_suites.lock().unwrap();
                        let rust_speedup =
                            node_duration.as_millis() as f32 / duration.as_millis() as f32 - 1.0;
                        let rust_duration = format!("{:?}", duration);
                        let node_duration = format!("{:?}", node_duration);
                        let rust_speedup = if rust_speedup > 1.0 {
                            format!("+{:.2}x", rust_speedup)
                        } else if rust_speedup > 0.0 {
                            format!("+{:.0}%", rust_speedup * 100.0)
                        } else {
                            format!("-{:.0}%", -rust_speedup * 100.0)
                        };
                        bench_suites_lock.push(BenchSuite {
                            suite: input_string
                                .trim_start_matches("node-file-trace/integration/")
                                .to_string()
                                + (if multi_threaded {
                                    " (multi-threaded)"
                                } else {
                                    ""
                                }),
                            is_faster,
                            rust_duration,
                            node_duration,
                            rust_speedup,
                        });
                    }
                    CommandOutputVc::cell(CommandOutput {
                        stdout: String::new(),
                        stderr: String::new(),
                    })
                    .await
                }
            };
            let handle_result = |result: Result<CommandOutputReadRef>| match result {
                Ok(output) => {
                    #[cfg(not(feature = "bench_against_node_nft"))]
                    {
                        assert!(
                            output.is_empty(),
                            "emitted files behave differently when executed via node.js\n{output}"
                        );
                    }
                }
                Err(err) => {
                    panic!("Execution failed: {:?}", err);
                }
            };

            let tt = create_turbo_tasks(directory_path.as_path());
            let output = timeout(Duration::from_secs(timeout_len), tt.run_once(task)).await;
            let _ = timeout(Duration::from_secs(2), tt.wait_background_done()).await;
            let stop = timeout(Duration::from_secs(60), tt.stop_and_wait()).await;
            match (output, stop) {
                (Ok(result), Ok(_)) => handle_result(result),
                (Err(err), _) => {
                    handle_timeout_error(&tt);
                    panic!("Execution is hanging (for > {timeout_len}s): {err}");
                }
                (_, Err(err)) => {
                    panic!("Stopping is hanging (for > 60s): {err}");
                }
            }
        }
        let bench_suites_lock = BENCH_SUITES.lock().unwrap();
        if !bench_suites_lock.is_empty() {
            static BENCH_FILE_NAME: &str = "bench.json";
            let mut bench_result = fs::File::options()
                .append(true)
                .open(BENCH_FILE_NAME)
                .unwrap_or_else(|_| fs::File::create(BENCH_FILE_NAME).unwrap());
            bench_result
                .write_all(
                    { serde_json::to_string(bench_suites_lock.as_slice()).unwrap() + "\n" }
                        .as_bytes(),
                )
                .unwrap();
            drop(bench_result);
        }
    })
}

#[turbo_tasks::value]
struct CommandOutput {
    stdout: String,
    stderr: String,
}

impl CommandOutput {
    fn is_empty(&self) -> bool {
        self.stderr.is_empty() && self.stdout.is_empty()
    }
}

impl Display for CommandOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "---------- Stdout ----------\n{}\n---------- Stderr ----------\n{}",
            &self.stdout, &self.stderr,
        )
    }
}

#[turbo_tasks::function]
async fn exec_node(directory: String, path: FileSystemPathVc) -> Result<CommandOutputVc> {
    let mut cmd = Command::new("node");

    let p = path.await?;
    let f = Path::new(&directory).join(&p.path);
    let dir = f.parent().unwrap();
    println!("[CWD]: {}", dir.display());
    let label = path.to_string().await?;

    #[cfg(not(feature = "bench_against_node_nft"))]
    if p.path.ends_with(".ts") {
        let mut ts_node = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        ts_node.push("tests");
        ts_node.push("node-file-trace");
        ts_node.push("node_modules");
        ts_node.push("ts-node");
        ts_node.push("dist");
        ts_node.push("bin.js");
        cmd.arg(&ts_node);
    }

    #[cfg(feature = "bench_against_node_nft")]
    {
        let mut node_nft = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        node_nft.push("tests");
        node_nft.push("node-file-trace");
        node_nft.push("node_modules");
        node_nft.push("@vercel");
        node_nft.push("nft");
        node_nft.push("out");
        node_nft.push("cli.js");
        cmd.arg(&node_nft).arg("build");
    }
    #[cfg(not(feature = "bench_against_node_nft"))]
    {
        cmd.arg(&f);
        cmd.current_dir(dir);
    }
    #[cfg(feature = "bench_against_node_nft")]
    {
        let mut current_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        current_dir.push("tests");
        current_dir.push("node-file-trace");
        cmd.arg(&p.path.trim_start_matches("node-file-trace/"));
        cmd.current_dir(current_dir);
    }

    println!("[CMD]: {:#?}", cmd);

    let output = timeout(Duration::from_secs(100), cmd.output())
        .await
        .with_context(|| anyhow!("node execution of {label} is hanging"))?
        .with_context(|| anyhow!("failed to spawn node process of {label}"))?;

    let output = CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: clean_stderr(String::from_utf8_lossy(&output.stderr).as_ref()),
    };

    println!("File: {}\n{}", f.display(), output,);

    Ok(CommandOutputVc::cell(output))
}

fn clean_stderr(str: &str) -> String {
    lazy_static! {
        static ref EXPERIMENTAL_WARNING: Regex =
            Regex::new(r"\(node:\d+\) ExperimentalWarning:").unwrap();
    }
    EXPERIMENTAL_WARNING
        .replace_all(str, "(node:XXXX) ExperimentalWarning:")
        .to_string()
}

fn diff(expected: &str, actual: &str) -> String {
    lazy_static! {
        static ref JAVASCRIPT_TIMESTAMP: Regex =
            Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z").unwrap();
        static ref JAVASCRIPT_DATE_TIME: Regex =
            Regex::new(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.\d{6}").unwrap();
    }
    // Remove timestamps from the output.
    if JAVASCRIPT_DATE_TIME.replace_all(JAVASCRIPT_TIMESTAMP.replace_all(actual, "").as_ref(), "")
        == JAVASCRIPT_DATE_TIME
            .replace_all(JAVASCRIPT_TIMESTAMP.replace_all(expected, "").as_ref(), "")
    {
        return String::new();
    }
    print_changeset(&Changeset::new(expected.trim(), actual.trim(), "\n"))
}

#[allow(unused)]
#[turbo_tasks::function]
async fn assert_output(
    expected: CommandOutputVc,
    actual: CommandOutputVc,
    expected_stderr: Option<String>,
) -> Result<CommandOutputVc> {
    let expected = expected.await?;
    let actual = actual.await?;
    Ok(CommandOutputVc::cell(CommandOutput {
        stdout: diff(&expected.stdout, &actual.stdout),
        stderr: if let Some(expected_stderr) = expected_stderr {
            if actual.stderr.contains(&expected_stderr)
                && expected.stderr.contains(&expected_stderr)
            {
                String::new()
            } else {
                let stderr_diff = diff(&expected.stderr, &actual.stderr);
                format!(
                    "could not find `{}` in stderr\n{}",
                    expected_stderr, stderr_diff
                )
            }
        } else {
            diff(&expected.stderr, &actual.stderr)
        },
    }))
}

#[derive(Debug, Serialize, Deserialize)]
struct BenchSuite {
    suite: String,
    node_duration: String,
    rust_duration: String,
    rust_speedup: String,
    is_faster: bool,
}

/// rstest's #[case] attribute does not allow for specifying default values.
/// However, it can automatically convert between types, so we can use a
/// custom input struct with the Builder pattern instead.
struct CaseInput {
    /// The path to the JS or TS test file.
    path: String,
    /// The test will pass if the provided error message is included in both
    /// stderr outputs.
    expected_stderr: Option<String>,
}

impl CaseInput {
    fn new(path: &str) -> Self {
        Self {
            path: path.to_owned(),
            expected_stderr: None,
        }
    }

    fn expected_stderr(mut self, msg: &str) -> Self {
        self.expected_stderr = Some(msg.to_owned());
        self
    }
}

impl std::str::FromStr for CaseInput {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::new(s))
    }
}
