#![feature(min_specialization)]

/// Explicit extern crate to use allocator.
extern crate turbo_malloc;
use anyhow::{anyhow, Context, Result};
use difference::{Changeset, Difference};
use lazy_static::lazy_static;
use regex::Regex;
use rstest::*;
use rstest_reuse::{self, *};
use serde::{Deserialize, Serialize};
#[cfg(feature = "bench_against_node_nft")]
use std::time::Instant;
use std::{
    collections::VecDeque,
    env::temp_dir,
    fmt::{Display, Write as _},
    fs::{self, remove_dir_all},
    io::{ErrorKind, Write as _},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{process::Command, time::timeout};
use turbo_tasks::ValueToString;
use turbo_tasks::{backend::Backend, TurboTasks, Value};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{emit_with_completion, rebase::RebasedAssetVc, register, ModuleAssetContextVc};
use turbopack_core::asset::Asset;
use turbopack_core::context::AssetContext;
use turbopack_core::target::CompileTargetVc;
use turbopack_core::{
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    source_asset::SourceAssetVc,
};

#[template]
#[rstest]
#[case::analytics_node("integration/analytics-node.js", true)]
#[case::array_map_require("integration/array-map-require/index.js", true)]
#[case::apollo("integration/apollo.js", true)]
#[case::argon2("integration/argon2.js", true)]
#[case::auth0("integration/auth0.js", true)]
#[case::aws_sdk("integration/aws-sdk.js", true)]
#[case::axios("integration/axios.js", true)]
#[case::azure_cosmos("integration/azure-cosmos.js", true)]
#[case::azure_storage("integration/azure-storage.js", true)]
#[case::bcrypt("integration/bcrypt.js", true)]
#[case::better_sqlite3("integration/better-sqlite3.js", true)]
#[case::bindings_failure("integration/bindings-failure.js", false)] // Cannot find module 'bindings'
#[case::browserify_middleware("integration/browserify-middleware.js", true)]
#[case::bugsnag_js("integration/bugsnag-js.js", true)]
#[case::bull("integration/bull.js", true)]
#[case::bull_mq("integration/bullmq.js", true)]
#[case::camaro("integration/camaro.js", true)]
#[case::canvas("integration/canvas.js", true)]
#[case::chromeless("integration/chromeless.js", true)]
#[case::core_js("integration/core-js.js", true)]
#[case::cosmosdb_query("integration/cosmosdb-query.js", true)]
#[case::cowsay("integration/cowsay.js", true)]
#[case::dogfood("integration/dogfood.js", false)] // can't find node-file-trace
#[case::dynamic_in_package("integration/dynamic-in-package.js", true)]
#[case::empty("integration/empty.js", true)]
#[case::env_var("integration/env-var.js", true)]
#[case::es_get_iterator("integration/es-get-iterator.js", true)]
#[case::esbuild("integration/esbuild.js", true)]
#[case::esm("integration/esm.js", true)]
#[case::express_consolidate("integration/express-consolidate.js", true)]
#[case::express_template_engine("integration/express-template-engine.js", true)]
#[case::express_template_pug("integration/express-template.js", true)]
#[case::express("integration/express.js", true)]
#[case::fast_glob("integration/fast-glob.js", true)]
#[case::fetch_h2("integration/fetch-h2.js", true)]
#[cfg_attr(target_arch = "x86_64", case::ffmpeg_js("integration/ffmpeg.js", true))]
// Could not find ffmpeg executable
#[case::firebase_admin("integration/firebase-admin.js", true)]
#[case::firebase("integration/firebase.js", true)]
#[case::firestore("integration/firestore.js", true)]
#[case::fluent_ffmpeg("integration/fluent-ffmpeg.js", true)]
#[case::geo_tz("integration/geo-tz.js", true)]
#[case::google_bigquery("integration/google-bigquery.js", true)]
#[case::got("integration/got.js", true)]
#[case::highlights("integration/highlights.js", true)]
#[case::hot_shots("integration/hot-shots.js", true)]
#[case::ioredis("integration/ioredis.js", true)]
#[case::isomorphic_unfetch("integration/isomorphic-unfetch.js", true)]
#[case::jimp("integration/jimp.js", true)]
#[case::jugglingdb("integration/jugglingdb.js", true)]
#[case::koa("integration/koa.js", true)]
#[case::leveldown("integration/leveldown.js", true)]
#[case::lighthouse("integration/lighthouse.js", true)]
#[case::loopback("integration/loopback.js", true)]
#[case::mailgun("integration/mailgun.js", true)]
#[case::mariadb("integration/mariadb.js", true)]
#[case::memcached("integration/memcached.js", true)]
#[case::mongoose("integration/mongoose.js", true)]
#[case::mysql("integration/mysql.js", true)]
#[case::npm("integration/npm.js", true)]
// unable to resolve esm request module 'spdx-license-ids' in node-file-trace/node_modules/npm/node_modules/spdx-correct
// oracledb doesn't support non x86 architectures
#[cfg_attr(
    target_arch = "x86_64",
    case::oracledb("integration/oracledb.js", true)
)]
#[case::paraphrase("integration/paraphrase.js", true)]
#[case::passport_trakt("integration/passport-trakt.js", true)]
#[case::passport("integration/passport.js", true)]
#[case::path_platform("integration/path-platform.js", true)]
#[case::pixelmatch("integration/pixelmatch.js", true)]
#[case::pdf2json("integration/pdf2json.js", true)]
#[case::pdfkit("integration/pdfkit.js", true)]
#[case::pg("integration/pg.js", true)]
#[case::playwright_core("integration/playwright-core.js", true)]
#[case::polyfill_library("integration/polyfill-library.js", true)]
#[case::pug("integration/pug.js", true)]
#[case::react("integration/react.js", true)]
#[case::redis("integration/redis.js", true)]
#[case::remark_prism("integration/remark-prism.mjs", true)]
#[case::request("integration/request.js", true)]
#[case::rxjs("integration/rxjs.js", true)]
#[case::saslprep("integration/saslprep.js", true)]
#[case::semver("integration/semver.js", true)]
#[case::sentry("integration/sentry.js", true)]
#[case::sequelize("integration/sequelize.js", true)]
#[cfg_attr(target_os = "windows", case::sharp("integration/sharp.js", false))] // can't find *.node binding
#[cfg_attr(not(target_os = "windows"), case::sharp("integration/sharp.js", true))]
#[case::simple("integration/simple.js", true)]
#[case::socket_io("integration/socket.io.js", true)]
#[case::source_map("integration/source-map/index.js", true)]
#[case::sparql_builder("integration/sparql-builder.js", true)]
#[case::sqlite("integration/sqlite.js", true)]
#[case::stripe("integration/stripe.js", true)]
#[case::strong_error_handler("integration/strong-error-handler.js", true)]
#[case::tensorflow("integration/tensorflow.js", true)]
#[case::tiny_json_http("integration/tiny-json-http.js", true)]
#[case::twilio("integration/twilio.js", true)]
#[case::ts_morph("integration/ts-morph.js", true)]
#[case::typescript("integration/typescript.js", true)]
#[case::uglify("integration/uglify.js", true)]
#[case::underscore("integration/underscore.js", true)]
#[case::vm2("integration/vm2.js", true)]
#[case::vue("integration/vue.js", true)]
#[case::whatwg_url("integration/whatwg-url.js", true)]
#[case::when("integration/when.js", true)]
#[cfg_attr(
    not(feature = "bench_against_node_nft"),
    case::ts_package_base("integration/ts-package/index.ts", true)
)]
#[cfg_attr(
    not(feature = "bench_against_node_nft"),
    case::ts_package_extends("integration/ts-package-extends/index.ts", true)
)]
#[cfg_attr(
    not(feature = "bench_against_node_nft"),
    case::ts_package_from_js("integration/ts-package-from-js/index.js", true)
)]
fn test_cases() {}

#[apply(test_cases)]
fn node_file_trace_memory(#[case] input: String, #[case] should_succeed: bool) {
    node_file_trace(
        input,
        should_succeed,
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
fn node_file_trace_rocksdb(#[case] input: String, #[case] should_succeed: bool) {
    use turbo_tasks_memory::MemoryBackendWithPersistedGraph;
    use turbo_tasks_rocksdb::RocksDbPersistedGraph;

    node_file_trace(
        input,
        should_succeed,
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
fn bench_against_node_nft_st(#[case] input: String, #[case] should_succeed: bool) {
    bench_against_node_nft_inner(input, should_succeed, false);
}

#[cfg(feature = "bench_against_node_nft")]
#[apply(test_cases)]
fn bench_against_node_nft_mt(#[case] input: String, #[case] should_succeed: bool) {
    bench_against_node_nft_inner(input, should_succeed, true);
}

#[cfg(feature = "bench_against_node_nft")]
fn bench_against_node_nft_inner(input: String, should_succeed: bool, multi_threaded: bool) {
    node_file_trace(
        input,
        should_succeed,
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
    input: String,
    should_succeed: bool,
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
        let mut tests_root = package_root.clone();
        tests_root.push("tests");
        let mut tests_output_root = temp_dir();
        tests_output_root.push("tests_output");
        let tests_root = tests_root.to_string_lossy().to_string();
        let input = format!("node-file-trace/{input}");
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
            .unwrap();

        for _ in 0..run_count {
            let bench_suites = bench_suites.clone();
            let tests_root = tests_root.clone();
            let input_string = input.clone();
            let directory = directory.clone();
            let task = async move {
                #[allow(unused)]
                let bench_suites = bench_suites.clone();
                #[cfg(feature = "bench_against_node_nft")]
                let before_start = Instant::now();
                let input_fs: FileSystemVc =
                    DiskFileSystemVc::new("tests".to_string(), tests_root.clone()).into();
                let input = FileSystemPathVc::new(input_fs, &input_string);
                let input_dir = FileSystemPathVc::new(input_fs, "node-file-trace");

                #[cfg(not(feature = "bench_against_node_nft"))]
                let original_output = exec_node(tests_root, input);

                let output_fs = DiskFileSystemVc::new("output".to_string(), directory.clone());
                let output_dir = FileSystemPathVc::new(output_fs.into(), "");

                let source = SourceAssetVc::new(input);
                let context = ModuleAssetContextVc::new(
                    input_dir,
                    EnvironmentVc::new(
                        Value::new(ExecutionEnvironment::NodeJsLambda(
                            NodeJsEnvironment {
                                typescript_enabled: false,
                                compile_target: CompileTargetVc::current(),
                                node_version: 0,
                            }
                            .into(),
                        )),
                        Value::new(EnvironmentIntention::ServerRendering),
                    ),
                );
                let module = context.process(source.into());
                let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

                let output_path = rebased.path();
                emit_with_completion(rebased.into()).await?;

                #[cfg(not(feature = "bench_against_node_nft"))]
                {
                    let output = exec_node(directory.clone(), output_path);
                    let output = assert_output(original_output, output);
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
            let handle_result =
                |result: Result<turbo_tasks::RawVcReadResult<CommandOutput>>| match result {
                    Ok(output) => {
                        #[cfg(not(feature = "bench_against_node_nft"))]
                        {
                            if should_succeed {
                                assert!(
                                    output.is_empty(),
                                    "emitted files behave differently when executed via \
                                     node.js\n{output}"
                                );
                            } else {
                                assert!(!output.is_empty(), "test case works now! enable it");
                            }
                        }
                    }
                    Err(err) => {
                        panic!("Execution crashed {err}");
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
    let Changeset { diffs, .. } = Changeset::new(expected.trim(), actual.trim(), "\n");
    let mut result = String::new();
    const CONTEXT_LINES: usize = 3;
    let mut context = VecDeque::new();
    let mut need_context = 0;
    let mut has_spacing = false;
    for diff in diffs {
        match diff {
            Difference::Same(line) => {
                if need_context > 0 {
                    writeln!(result, "  {line}").unwrap();
                    need_context -= 1;
                } else {
                    if context.len() == CONTEXT_LINES {
                        has_spacing = true;
                        context.pop_front();
                    }
                    context.push_back(line);
                }
            }
            Difference::Add(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "+ {line}").unwrap();
                need_context = CONTEXT_LINES;
            }
            Difference::Rem(line) => {
                if has_spacing {
                    writeln!(result, "...").unwrap();
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    writeln!(result, "  {line}").unwrap();
                }
                writeln!(result, "- {line}").unwrap();
                need_context = CONTEXT_LINES;
            }
        }
    }
    result
}

#[allow(unused)]
#[turbo_tasks::function]
async fn assert_output(
    expected: CommandOutputVc,
    actual: CommandOutputVc,
) -> Result<CommandOutputVc> {
    let expected = expected.await?;
    let actual = actual.await?;
    Ok(CommandOutputVc::cell(CommandOutput {
        stdout: diff(&expected.stdout, &actual.stdout),
        stderr: diff(&expected.stderr, &actual.stderr),
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
