use std::{
    collections::VecDeque,
    fmt::Display,
    fs::remove_dir_all,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use async_std::{future::timeout, process::Command, task::block_on};
use difference::{Changeset, Difference};
use rstest::*;
use turbo_tasks::{TurboTasks, ValueToString};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};
use turbo_tasks_memory::{MemoryBackend, MemoryBackendWithPersistedGraph};
use turbo_tasks_rocksdb::RocksDbPersistedGraph;
use turbopack::{
    asset::Asset, emit_with_completion, module, rebase::RebasedAssetVc, register,
    source_asset::SourceAssetVc,
};

#[rstest]
#[case::analytics_node("integration/analytics-node.js", true)]
#[case::apollo("integration/apollo.js", true)]
#[case::argon2("integration/argon2.js", true)]
#[case::auth0("integration/auth0.js", true)]
#[case::aws_sdk("integration/aws-sdk.js", true)]
#[case::axios("integration/axios.js", true)]
#[case::azure_cosmos("integration/azure-cosmos.js", true)]
#[case::azure_storage("integration/azure-storage.js", true)]
#[case::bcrypt("integration/bcrypt.js", true)]
#[case::bindings_failure("integration/bindings-failure.js", false)] // Cannot find module 'bindings'
#[case::browserify_middleware("integration/browserify-middleware.js", false)] // node_modules/uglify-es/tools/node.js is weird
#[case::bugsnag_js("integration/bugsnag-js.js", true)]
// #[case::bull("integration/bull.js", false)] // Skipping bull integration test
#[case::camaro("integration/camaro.js", false)] // can't find node_modules/piscina/dist/src/worker.js
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
#[case::esm("integration/esm.js", false)] // Cannot destructure property 'dir' of 'T.package' as it is undefined.
#[case::express_consolidate("integration/express-consolidate.js", false)] // Cannot read property 'startsWith' of undefined
#[case::express_template_engine("integration/express-template-engine.js", true)]
#[case::express_template("integration/express-template.js", true)]
#[case::express("integration/express.js", true)]
#[case::fast_glob("integration/fast-glob.js", true)]
#[case::fetch_h2("integration/fetch-h2.js", true)]
#[cfg_attr(target_arch = "x86_64", case::ffmpeg_js("integration/ffmpeg.js", true))]
// Could not find ffmpeg executable
// #[case::firebase_admin("integration/firebase-admin.js", false)] // hanging
// #[case::firebase("integration/firebase.js", false)] // hanging
#[case::firestore("integration/firestore.js", true)]
#[case::fluent_ffmpeg("integration/fluent-ffmpeg.js", true)]
#[case::geo_tz("integration/geo-tz.js", false)] // can't find node_modules/geo-tz/data/geo.dat
#[case::google_bigquery("integration/google-bigquery.js", true)]
#[case::got("integration/got.js", true)]
#[case::highlights("integration/highlights.js", false)] // unable to resolve esm request module 'highlights' in node-file-trace/integration
#[case::hot_shots("integration/hot-shots.js", false)] // unable to resolve esm request module 'hot-shots' in node-file-trace/integration
#[case::ioredis("integration/ioredis.js", true)]
#[case::isomorphic_unfetch("integration/isomorphic-unfetch.js", true)]
#[case::jimp("integration/jimp.js", true)]
#[case::jugglingdb("integration/jugglingdb.js", false)] // doesn't understand define
#[case::koa("integration/koa.js", true)]
#[case::leveldown("integration/leveldown.js", true)]
#[case::lighthouse("integration/lighthouse.js", true)]
#[case::loopback("integration/loopback.js", false)] // node_modules/strong-globalize/cldr folder missing
#[case::mailgun("integration/mailgun.js", true)]
#[case::mariadb("integration/mariadb.js", true)]
#[case::memcached("integration/memcached.js", true)]
#[case::mongoose("integration/mongoose.js", true)]
#[case::mysql("integration/mysql.js", true)]
#[case::npm("integration/npm.js", false)]
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
#[case::saslprep("integration/saslprep.js", false)] // fs.readFileSync(path.resolve(__dirname, '../code-points.mem'))
#[case::semver("integration/semver.js", true)]
#[case::sentry("integration/sentry.js", true)]
#[case::sequelize("integration/sequelize.js", true)]
#[cfg_attr(target_os = "windows", case::sharp("integration/sharp.js", false))] // can't find *.node binding
#[cfg_attr(not(target_os = "windows"), case::sharp("integration/sharp.js", true))]
#[case::simple("integration/simple.js", true)]
#[case::socket_io("integration/socket.io.js", true)]
#[case::sparql_builder("integration/sparql-builder.js", true)]
#[case::sqlite("integration/sqlite.js", true)]
#[case::stripe("integration/stripe.js", true)]
#[case::tensorflow("integration/tensorflow.js", false)] // unable to resolve esm request module '@tensorflow/tfjs-node' in node-file-trace/integration
#[case::tiny_json_http("integration/tiny-json-http.js", true)]
#[case::twilio("integration/twilio.js", true)]
#[case::typescript("integration/typescript.js", true)]
// #[case::uglify("integration/uglify.js", false)] // node_modules/uglify-es/tools/node.js is weird
#[case::vm2("integration/vm2.js", true)]
#[case::vue("integration/vue.js", true)]
#[case::whatwg_url("integration/whatwg-url.js", true)]
#[case::when("integration/when.js", false)] // doesn't understand define
#[case::ts_package_base("integration/ts-package/index.ts", true)]
#[case::ts_package_extends("integration/ts-package-extends/index.ts", true)]
#[case::ts_package_from_js("integration/ts-package-from-js/index.js", true)]
fn node_file_trace(
    #[values("memory"/*, "rocksdb"*/)] mode: &str,
    #[case] input: String,
    #[case] should_succeed: bool,
) {
    register();
    include!(concat!(
        env!("OUT_DIR"),
        "/register_test_node-file-trace.rs"
    ));

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut tests_root = package_root.clone();
    tests_root.push("tests");
    let mut tests_output_root = package_root.clone();
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

    let run_count = if mode != "memory" { 1 } else { 1 };
    let timeout_len = if mode != "memory" { 240 } else { 120 };

    for _ in 0..run_count {
        let tests_root = tests_root.clone();
        let input = input.clone();
        let directory = directory.clone();
        let task = async move {
            let input_fs: FileSystemVc =
                DiskFileSystemVc::new("tests".to_string(), tests_root.clone()).into();
            let input = FileSystemPathVc::new(input_fs, &input);
            let input_dir = FileSystemPathVc::new(input_fs, "node-file-trace");

            let original_output = exec_node(tests_root, input.clone());

            let output_fs = DiskFileSystemVc::new("output".to_string(), directory.clone());
            let output_dir = FileSystemPathVc::new(output_fs.into(), "");

            let source = SourceAssetVc::new(input);
            let module = module(source.into());
            let rebased = RebasedAssetVc::new(module, input_dir, output_dir);

            let output_path = rebased.path();
            emit_with_completion(rebased.into()).await?;

            let output = exec_node(directory.clone(), output_path);

            let output = assert_output(original_output, output);

            Ok(output.await?)
        };
        let handle_result =
            |result: Result<turbo_tasks::RawVcReadResult<CommandOutput>>| match result {
                Ok(output) => {
                    if should_succeed {
                        assert!(
                            output.is_empty(),
                            "emitted files behave differently when executed via node.js\n{output}"
                        );
                    } else {
                        assert!(!output.is_empty(), "test case works now! enable it");
                    }
                }
                Err(err) => {
                    panic!("Execution crashed {err}");
                }
            };

        match mode {
            "memory" => {
                let tt = TurboTasks::new(MemoryBackend::new());
                let output = block_on(timeout(Duration::from_secs(timeout_len), tt.run_once(task)));
                match output {
                    Ok(result) => handle_result(result),
                    Err(err) => {
                        let mut pending_tasks = 0_usize;
                        let b = tt.backend();
                        b.with_all_cached_tasks(|task| {
                            b.with_task(task, |task| {
                                if task.is_pending() {
                                    println!("PENDING: {task}");
                                    pending_tasks += 1;
                                }
                            })
                        });
                        panic!(
                            "Execution is hanging (for > {timeout_len}s, {pending_tasks} pending \
                             tasks): {err}"
                        );
                    }
                }
            }
            "rocksdb" => {
                let tt = TurboTasks::new(MemoryBackendWithPersistedGraph::new(
                    RocksDbPersistedGraph::new(directory_path.join(".db")).unwrap(),
                ));
                let output = block_on(timeout(Duration::from_secs(timeout_len), tt.run_once(task)));
                let stop = block_on(timeout(Duration::from_secs(60), tt.stop_and_wait()));
                match (output, stop) {
                    (Ok(result), Ok(_)) => handle_result(result),
                    (Err(err), _) => {
                        panic!("Execution is hanging (for > {timeout_len}s): {err}");
                    }
                    (_, Err(err)) => {
                        panic!("Stopping is hanging (for > 60s): {err}");
                    }
                }
            }
            _ => unreachable!(),
        }
    }
}

#[turbo_tasks::value]
#[derive(PartialEq, Eq)]
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
    let typescript = p.path.ends_with(".ts");

    if typescript {
        let mut ts_node = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        ts_node.push("tests");
        ts_node.push("node-file-trace");
        ts_node.push("node_modules");
        ts_node.push("ts-node");
        ts_node.push("dist");
        ts_node.push("bin.js");
        cmd.arg(&ts_node);
    }
    cmd.arg(&f);
    cmd.current_dir(dir);

    let output = timeout(Duration::from_secs(100), cmd.output())
        .await
        .with_context(|| anyhow!("node execution of {label} is hanging"))?
        .with_context(|| anyhow!("failed to spawn node process of {label}"))?;

    let output = CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    };

    println!("File: {}\n{}", f.display(), output,);

    Ok(CommandOutputVc::slot(output))
}

fn diff(expected: &str, actual: &str) -> String {
    if actual == expected {
        return String::new();
    }
    let Changeset { diffs, .. } = Changeset::new(expected, actual, "\n");
    let mut result = Vec::new();
    const CONTEXT_LINES: usize = 3;
    let mut context = VecDeque::new();
    let mut need_context = 0;
    let mut has_spacing = false;
    for diff in diffs {
        match diff {
            Difference::Same(line) => {
                if need_context > 0 {
                    result.push(format!("  {line}"));
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
                    result.push(format!("..."));
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    result.push(format!("  {line}"));
                }
                result.push(format!("+ {line}"));
                need_context = CONTEXT_LINES;
            }
            Difference::Rem(line) => {
                if has_spacing {
                    result.push(format!("..."));
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    result.push(format!("  {line}"));
                }
                result.push(format!("- {line}"));
                need_context = CONTEXT_LINES;
            }
        }
    }
    result.join("\n")
}

#[turbo_tasks::function]
async fn assert_output(
    expected: CommandOutputVc,
    actual: CommandOutputVc,
) -> Result<CommandOutputVc> {
    let expected = expected.await?;
    let actual = actual.await?;
    Ok(CommandOutputVc::slot(CommandOutput {
        stdout: diff(&expected.stdout, &actual.stdout),
        stderr: diff(&expected.stderr, &actual.stderr),
    }))
}
