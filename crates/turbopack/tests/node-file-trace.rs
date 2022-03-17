use std::{
    collections::VecDeque,
    fmt::Display,
    fs::remove_dir_all,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use async_std::{process::Command, task::block_on};
use difference::{Changeset, Difference};
use testing::fixture;
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::{DiskFileSystemRef, FileSystemPathRef};
use turbopack::{
    asset::Asset, emit_with_completion, module, rebase::RebasedAssetRef,
    source_asset::SourceAssetRef,
};

#[fixture("tests/node-file-trace/integration/analytics-node.js")]
#[fixture("tests/node-file-trace/integration/apollo.js")]
// #[fixture("tests/node-file-trace/integration/argon2.js")] // can't find *.node binding
#[fixture("tests/node-file-trace/integration/auth0.js")]
#[fixture("tests/node-file-trace/integration/aws-sdk.js")]
#[fixture("tests/node-file-trace/integration/axios.js")]
#[fixture("tests/node-file-trace/integration/azure-cosmos.js")]
#[fixture("tests/node-file-trace/integration/azure-storage.js")]
// #[fixture("tests/node-file-trace/integration/bcrypt.js")] // can't find *.node binding
// #[fixture("tests/node-file-trace/integration/bindings-failure.js")] // Cannot find module 'bindings'
// #[fixture("tests/node-file-trace/integration/browserify-middleware.js")] // node_modules/uglify-es/tools/node.js is weird
#[fixture("tests/node-file-trace/integration/bugsnag-js.js")]
// #[fixture("tests/node-file-trace/integration/bull.js")] // Skipping bull integration test
// #[fixture("tests/node-file-trace/integration/camaro.js")] // can't find node_modules/piscina/dist/src/worker.js
// #[fixture("tests/node-file-trace/integration/canvas.js")] // can't find *.node binding
#[fixture("tests/node-file-trace/integration/chromeless.js")]
#[fixture("tests/node-file-trace/integration/core-js.js")]
// #[fixture("tests/node-file-trace/integration/cowsay.js")] // can't find node_modules/cowsay/cows/default.cow
// #[fixture("tests/node-file-trace/integration/dogfood.js")] // can't find node-file-trace
#[fixture("tests/node-file-trace/integration/empty.js")]
#[fixture("tests/node-file-trace/integration/env-var.js")]
#[fixture("tests/node-file-trace/integration/es-get-iterator.js")]
// #[fixture("tests/node-file-trace/integration/esbuild.js")] // hanging in execution
// #[fixture("tests/node-file-trace/integration/esm.js")] // Cannot destructure property 'dir' of 'T.package' as it is undefined.
// #[fixture("tests/node-file-trace/integration/express-consolidate.js")] // Cannot read property 'startsWith' of undefined
#[fixture("tests/node-file-trace/integration/express-template-engine.js")]
#[fixture("tests/node-file-trace/integration/express-template.js")]
#[fixture("tests/node-file-trace/integration/express.js")]
#[fixture("tests/node-file-trace/integration/fast-glob.js")]
#[fixture("tests/node-file-trace/integration/fetch-h2.js")]
// #[fixture("tests/node-file-trace/integration/ffmpeg.js")] // Could not find ffmpeg executable
#[fixture("tests/node-file-trace/integration/firebase-admin.js")]
// #[fixture("tests/node-file-trace/integration/firebase.js")] // Cannot find module 'firebase/app'
#[fixture("tests/node-file-trace/integration/firestore.js")]
#[fixture("tests/node-file-trace/integration/fluent-ffmpeg.js")]
// #[fixture("tests/node-file-trace/integration/geo-tz.js")] // can't find node_modules/geo-tz/data/geo.dat
#[fixture("tests/node-file-trace/integration/google-bigquery.js")]
#[fixture("tests/node-file-trace/integration/got.js")]
// #[fixture("tests/node-file-trace/integration/highlights.js")] // unable to resolve esm request module 'highlights' in node-file-trace/integration
// #[fixture("tests/node-file-trace/integration/hot-shots.js")] // unable to resolve esm request module 'hot-shots' in node-file-trace/integration
#[fixture("tests/node-file-trace/integration/ioredis.js")]
#[fixture("tests/node-file-trace/integration/isomorphic-unfetch.js")]
#[fixture("tests/node-file-trace/integration/jimp.js")]
#[fixture("tests/node-file-trace/integration/jugglingdb.js")]
#[fixture("tests/node-file-trace/integration/koa.js")]
// #[fixture("tests/node-file-trace/integration/leveldown.js")] // can't find *.node binding
// #[fixture("tests/node-file-trace/integration/lighthouse.js")] // fs.readFileSync(require.resolve('js-library-detector/library/libraries.js'), 'utf8')
// #[fixture("tests/node-file-trace/integration/loopback.js")] // node_modules/strong-globalize/cldr folder missing
#[fixture("tests/node-file-trace/integration/mailgun.js")]
#[fixture("tests/node-file-trace/integration/mariadb.js")]
#[fixture("tests/node-file-trace/integration/memcached.js")]
// #[fixture("tests/node-file-trace/integration/mongoose.js")] // Cannot find module './drivers/node-mongodb-native/connection'
#[fixture("tests/node-file-trace/integration/mysql.js")]
// #[fixture("tests/node-file-trace/integration/npm.js")] // unable to resolve esm request module 'spdx-license-ids' in node-file-trace/node_modules/npm/node_modules/spdx-correct
// #[fixture("tests/node-file-trace/integration/oracledb.js")] // NJS-045: cannot load a node-oracledb binary for Node.js 14.19.0 (win32 x64)
#[fixture("tests/node-file-trace/integration/paraphrase.js")]
#[fixture("tests/node-file-trace/integration/passport-trakt.js")]
#[fixture("tests/node-file-trace/integration/passport.js")]
#[fixture("tests/node-file-trace/integration/path-platform.js")]
// #[fixture("tests/node-file-trace/integration/pdf2json.js")] // fs.readFileSync(_basePath + fieldName, 'utf8') )
// #[fixture("tests/node-file-trace/integration/pdfkit.js")] // fs.readFileSync(__dirname + '/data.trie')
#[fixture("tests/node-file-trace/integration/pg.js")]
#[fixture("tests/node-file-trace/integration/playwright-core.js")]
// #[fixture("tests/node-file-trace/integration/polyfill-library.js")] // thread 'async-std/runtime' has overflowed its stack
#[fixture("tests/node-file-trace/integration/pug.js")]
#[fixture("tests/node-file-trace/integration/react.js")]
#[fixture("tests/node-file-trace/integration/redis.js")]
// #[fixture("tests/node-file-trace/integration/remark-prism.mjs")] // need to copy package.json with "type": "module"
#[fixture("tests/node-file-trace/integration/request.js")]
#[fixture("tests/node-file-trace/integration/rxjs.js")]
// #[fixture("tests/node-file-trace/integration/saslprep.js")] // fs.readFileSync(path.resolve(__dirname, '../code-points.mem'))
#[fixture("tests/node-file-trace/integration/semver.js")]
#[fixture("tests/node-file-trace/integration/sentry.js")]
#[fixture("tests/node-file-trace/integration/sequelize.js")]
// #[fixture("tests/node-file-trace/integration/sharp.js")] // can't find *.node binding
#[fixture("tests/node-file-trace/integration/simple.js")]
#[fixture("tests/node-file-trace/integration/socket.io.js")]
#[fixture("tests/node-file-trace/integration/sparql-builder.js")]
#[fixture("tests/node-file-trace/integration/stripe.js")]
// #[fixture("tests/node-file-trace/integration/tensorflow.js")] // unable to resolve esm request module '@tensorflow/tfjs-node' in node-file-trace/integration
#[fixture("tests/node-file-trace/integration/tiny-json-http.js")]
#[fixture("tests/node-file-trace/integration/twilio.js")]
// #[fixture("tests/node-file-trace/integration/typescript.js")] // Cannot find module 'typescript/bin/tsc'
// #[fixture("tests/node-file-trace/integration/uglify.js")] // node_modules/uglify-es/tools/node.js is weird
// #[fixture("tests/node-file-trace/integration/vm2.js")] // fs.readFileSync(`${__dirname}/setup-sandbox.js`, 'utf8')
#[fixture("tests/node-file-trace/integration/vue.js")]
#[fixture("tests/node-file-trace/integration/when.js")]
fn integration_test(input: PathBuf) {
    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut tests_root = package_root.clone();
    tests_root.push("tests");
    let mut tests_output_root = package_root.clone();
    tests_output_root.push("tests_output");
    let tests_root = tests_root.to_string_lossy().to_string();
    let mut input = input.to_string_lossy().to_string();
    if input.starts_with("\\\\?\\") {
        input.replace_range(0..4, "");
    }
    let input = input.strip_prefix(&tests_root).unwrap()[1..].to_string();
    let directory = tests_output_root.join(&input).to_string_lossy().to_string();
    let input = input.replace('\\', "/");

    remove_dir_all(&directory)
        .or_else(|err| {
            if err.kind() == ErrorKind::NotFound {
                Ok(())
            } else {
                Err(err)
            }
        })
        .unwrap();

    let tt = TurboTasks::new();
    let output = block_on(tt.run_once(async move {
        let input_fs = DiskFileSystemRef::new("tests".to_string(), tests_root.clone());
        let input = FileSystemPathRef::new(input_fs.into(), &input);

        let original_output = exec_node(tests_root.clone(), input.clone());

        let input_dir = input.clone().parent().parent();
        let output_fs = DiskFileSystemRef::new("output".to_string(), directory.clone());
        let output_dir = FileSystemPathRef::new(output_fs.into(), "");

        let source = SourceAssetRef::new(input);
        let module = module(source.into());
        let rebased = RebasedAssetRef::new(module, input_dir, output_dir);

        let output_path = rebased.path();
        emit_with_completion(rebased.into()).await?;

        let output = exec_node(directory.clone(), output_path);

        let output = asset_output(original_output, output);

        Ok(output.await?)
    }))
    .unwrap();

    assert!(output.is_empty(), "{output}");
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
            "---------- Stdout ----------\n{}\n---------- Stderr ----------\n {}",
            &self.stdout, &self.stderr,
        )
    }
}

#[turbo_tasks::function]
async fn exec_node(directory: String, path: FileSystemPathRef) -> Result<CommandOutputRef> {
    let mut cmd = Command::new("node");

    let p = path.get().await?;
    let f = Path::new(&directory).join(&p.path);

    cmd.arg(&f);

    let output = cmd.output().await.context("failed to spawn process")?;

    let output = CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    };

    println!("File: {}\n{}", f.display(), output,);

    Ok(CommandOutputRef::slot(output))
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
                    result.push(line);
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
                    result.push(format!(" {line}"));
                }
                result.push(format!("+{line}"));
                need_context = CONTEXT_LINES;
            }
            Difference::Rem(line) => {
                if has_spacing {
                    result.push(format!("..."));
                    has_spacing = false;
                }
                while let Some(line) = context.pop_front() {
                    result.push(format!(" {line}"));
                }
                result.push(format!("-{line}"));
                need_context = CONTEXT_LINES;
            }
        }
    }
    result.join("\n")
}

#[turbo_tasks::function]
async fn asset_output(
    expected: CommandOutputRef,
    actual: CommandOutputRef,
) -> Result<CommandOutputRef> {
    let expected = expected.await?;
    let actual = actual.await?;
    Ok(CommandOutputRef::slot(CommandOutput {
        stdout: diff(&expected.stdout, &actual.stdout),
        stderr: diff(&expected.stderr, &actual.stderr),
    }))
}
