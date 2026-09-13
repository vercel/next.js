#![allow(clippy::items_after_test_module)]
#![feature(arbitrary_self_types)]

mod helpers;
use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use anyhow::Result;
use regex::Regex;
use rstest::*;
use rustc_hash::FxHashSet;
use serde::Deserialize;
use similar::TextDiff;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack::{
    ModuleAssetContext,
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, ModuleOptionsContext,
        TypescriptTransformOptions,
    },
};
use turbopack_core::{
    chunk::SourceMapsType,
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
    module::Module,
    reference::referenced_modules_and_affecting_sources,
    reference_type::ReferenceType,
    resolve::options::{ConditionValue, ImportMap, ImportMapping},
};
use turbopack_ecmascript::AnalyzeMode;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

// TODO fix failures
#[rstest]
#[case::amd_disable("amd-disable")]
#[case::array_emission("array-emission")]
#[case::array_holes("array-holes")]
// Ternary currently becomes Unknown as opposed to Alternatives when the condition isn't static
// #[case::asset_conditional("asset-conditional")]
#[case::asset_fs_array_expr("asset-fs-array-expr")]
#[case::asset_fs_array_expr_node_prefix("asset-fs-array-expr-node-prefix")]
#[case::asset_fs_extra("asset-fs-extra")]
#[case::asset_fs_inline_path_babel("asset-fs-inline-path-babel")]
#[case::asset_fs_inline_path_enc_es("asset-fs-inline-path-enc-es")]
#[case::asset_fs_inline_path_enc_es_2("asset-fs-inline-path-enc-es-2")]
#[case::asset_fs_inline_path_enc_es_3("asset-fs-inline-path-enc-es-3")]
#[case::asset_fs_inline_path_enc_es_4("asset-fs-inline-path-enc-es-4")]
#[case::asset_fs_inline_path_enc_es_5("asset-fs-inline-path-enc-es-5")]
#[case::asset_fs_inline_path_enc_es_node_prefix("asset-fs-inline-path-enc-es-node-prefix")]
#[case::asset_fs_inline_path_shadow("asset-fs-inline-path-shadow")]
#[case::asset_fs_inline_path_ts("asset-fs-inline-path-ts")]
#[case::asset_fs_inline_path_ts_no_interop("asset-fs-inline-path-ts-no-interop")]
#[case::asset_fs_inline_tpl("asset-fs-inline-tpl")]
#[case::asset_fs_inlining("asset-fs-inlining")]
#[case::asset_fs_inlining_multi("asset-fs-inlining-multi")]
#[case::asset_fs_logical("asset-fs-logical")]
#[case::asset_graceful_fs("asset-graceful-fs")]
#[case::asset_node_require("asset-node-require")]
#[case::asset_package_json("asset-package-json")]
#[case::asset_symlink("asset-symlink")]
#[case::basic_analysis_require("basic-analysis-require")]
// The `browser-remappings*` cases are traced with the conditions from their `test-opts.json`, but
// nft's reference output lists every candidate resolution (`main` next to the `exports` / `browser`
// target, and even a `browser` mapping disabled with `false`), while Turbopack only traces the file
// it actually resolves to.
// #[case::browser_remappings("browser-remappings")]
// #[case::browser_remappings_disabled("browser-remappings-disabled")]
// #[case::browser_remappings_false("browser-remappings-false")]
// #[case::browser_remappings_malformed("browser-remappings-malformed")]
// #[case::browser_remappings_malformed2("browser-remappings-malformed2")]
// #[case::browser_remappings_string("browser-remappings-string")]
// #[case::browser_remappings_undefined("browser-remappings-undefined")]
// #[case::browserify("browserify")]
// #[case::browserify_minify("browserify-minify")]
// #[case::browserify_uglify("browserify-uglify")]
#[case::class_static("class-static")]
// #[case::datadog_pprof_node_gyp("datadog-pprof-node-gyp")]
// The `depth-*` cases rely on nft's `depth` option (from `test-opts.json`), which this harness
// doesn't implement, so the full dependency graph is traced instead.
// #[case::depth_0("depth-0")]
// #[case::depth_1("depth-1")]
// #[case::depth_2("depth-2")]
// #[case::depth_3("depth-3")]
#[case::dirname_emit("dirname-emit")]
#[case::dirname_emit_concat("dirname-emit-concat")]
#[case::dirname_len("dirname-len")]
#[case::dot_dot("dot-dot")]
#[case::esm_dynamic_import("esm-dynamic-import")]
#[case::esm_export_wildcard("esm-export-wildcard")]
#[case::esm_paths("esm-paths")]
#[case::esm_paths_trailer("esm-paths-trailer")]
// nft traces a package's legacy `main` in addition to the target its `exports` field
// resolves to (unless nft's `exportsOnly` option is set), so its reference output lists
// `index.js` next to `require-main.cjs`, while Turbopack only traces the file it actually
// resolves to.
// #[case::exports("exports")]
// Two reasons: as for `exports` above, nft also traces the legacy resolution (here the
// directory index `index.js`). On top of that, Turbopack resolves this fixture's `exports`
// fallback array to nothing at all, because it stops at the invalid first target
// (`"in:valid"`) instead of continuing with the next entry, so `require-main.cjs` is missed.
// #[case::exports_fallback("exports-fallback")]
#[case::exports_nomodule("exports-nomodule")]
// `exports-only` is the same fixture as `exports`, but nft traces it with `exportsOnly:
// true`, which matches Node's (and Turbopack's) semantics of ignoring `main` when an
// `exports` field is present.
#[case::exports_only("exports-only")]
#[case::exports_path("exports-path")]
#[case::exports_wildcard("exports-wildcard")]
// #[case::ffmpeg_installer("ffmpeg-installer")]
#[case::file_folder_slash("file-folder-slash")]
#[case::filter_asset_base("filter-asset-base")]
// #[case::fs_emission("fs-emission")]
// #[case::glob_dot("glob-dot")]
#[case::import_assertions("import-assertions")]
#[case::import_attributes("import-attributes")]
// #[case::import_meta_bad_url("import-meta-bad-url")]
// #[case::import_meta_tpl_cnd("import-meta-tpl-cnd")]
#[case::import_meta_url("import-meta-url")]
#[case::imports("imports")]
#[case::imports_module_sync("imports-module-sync")]
#[case::imports_module_sync_cjs("imports-module-sync-cjs")]
#[case::imports_wildcard("imports-wildcard")]
#[case::jsonc_parser_wrapper("jsonc-parser-wrapper")]
// #[case::jsx_input("jsx-input")]
// #[case::microtime_node_gyp("microtime-node-gyp")]
#[case::mixed_esm_cjs("mixed-esm-cjs")]
#[case::module_create_require("module-create-require")]
#[case::module_create_require_destructure_namespace("module-create-require-destructure-namespace")]
#[case::module_create_require_destructure("module-create-require-destructure")]
#[case::module_create_require_ignore_other("module-create-require-ignore-other")]
#[case::module_create_require_named_import("module-create-require-named-import")]
#[case::module_create_require_named_require("module-create-require-named-require")]
#[case::module_create_require_no_mixed("module-create-require-no-mixed")]
// #[case::module_register("module-register")]
// #[case::module_require("module-require")]
#[case::module_sync_condition_cjs("module-sync-condition-cjs")]
// Turbopack always includes the module-sync version, regardless of the current Node version
// #[case::module_sync_condition_cjs_node20("module-sync-condition-cjs-node20")]
// A `require()` of a subpath export that hands the `module-sync` condition an ESM file and
// `default` a CommonJS one (not a case that any of the above cover): both have to be traced.
#[case::module_sync_condition_cjs_subpath("module-sync-condition-cjs-subpath")]
// The same, but with the package reachable through two `node_modules` directories, as in a pnpm
// install: merging the results of both must not drop either target.
#[case::module_sync_condition_cjs_nested_symlink("module-sync-condition-cjs-nested-symlink")]
#[case::module_sync_condition_es("module-sync-condition-es")]
#[case::module_sync_condition_es_nested("module-sync-condition-es-nested")]
// Turbopack always includes the module-sync version, regardless of the current Node version
// #[case::module_sync_condition_es_node20("module-sync-condition-es-node20")]
#[case::mongoose("mongoose")]
#[case::multi_input("multi-input")]
#[case::node_modules_filter("node-modules-filter")]
// #[case::non_analyzable_requires("non-analyzable-requires")]
#[case::null_destructure("null-destructure")]
#[case::path_sep("path-sep")]
// #[case::phantomjs_prebuilt("phantomjs-prebuilt")]
// #[case::pino_transport("pino-transport")]
// #[case::pino_transport_constructor("pino-transport-constructor")]
// #[case::pino_transport_fastify("pino-transport-fastify")]
// #[case::pino_transport_targets("pino-transport-targets")]
// #[case::pixelmatch("pixelmatch")]
#[case::pkg_dir_outside_base("pkg-dir-outside-base")]
#[case::pkg_file_outside_base("pkg-file-outside-base")]
// #[case::pkginfo("pkginfo")]
// #[case::pnpm_symlinks("pnpm-symlinks")]
// #[case::prisma_photon("prisma-photon")]
#[case::process_cwd("process-cwd")]
// Ternary currently becomes Unknown as opposed to Alternatives when the condition isn't static
// #[case::process_env("process-env")]
#[case::processed_dependency("processed-dependency")]
#[case::protobuf_loop("protobuf-loop")]
#[case::protobuf_loop2("protobuf-loop2")]
#[case::require_call("require-call")]
// #[case::require_dirname_tpl("require-dirname-tpl")]
#[case::require_dot("require-dot")]
#[case::require_dynamic_fallback("require-dynamic-fallback")]
#[case::require_empty("require-empty")]
// #[case::require_resolve("require-resolve")]
// #[case::require_symlink("require-symlink")]
// #[case::require_symlink_subdir("require-symlink-subdir")]
// #[case::require_var_branch("require-var-branch")]
// TODO require-wrapper* should conceptually be working already
// #[case::require_wrapper("require-wrapper")]
// #[case::require_wrapper2("require-wrapper2")]
// #[case::require_wrapper3("require-wrapper3")]
// #[case::resolve_from("resolve-from")]
// #[case::resolve_hook("resolve-hook")]
// #[case::return_emission("return-emission")]
#[case::self_reference_module_sync("self-reference-module-sync")]
// #[case::shiki("shiki")]
#[case::string_concat("string-concat")]
#[case::syntax_err("syntax-err")]
#[case::top_level_await("top-level-await")]
// #[case::ts_filter("ts-filter")]
// #[case::ts_input_esm("ts-input-esm")]
#[case::ts_path_join("ts-path-join")]
// #[case::tsx("tsx")]
// #[case::tsx_input("tsx-input")]
#[case::url_error("url-error")]
// #[case::webpack_5_wrapper_namespace("webpack-5-wrapper-namespace")]
#[case::webpack_node("webpack-node")]
// #[case::webpack_wrapper("webpack-wrapper")]
// #[case::webpack_wrapper_dirname_inject("webpack-wrapper-dirname-inject")]
// #[case::webpack_wrapper_multi("webpack-wrapper-multi")]
#[case::webpack_wrapper_name("webpack-wrapper-name")]
#[case::webpack_wrapper_null("webpack-wrapper-null")]
// #[case::webpack_wrapper_strs_namespaces("webpack-wrapper-strs-namespaces")]
// #[case::webpack_wrapper_strs_namespaces_large("webpack-wrapper-strs-namespaces-large")]
#[case::when_wrapper("when-wrapper")]
#[case::wildcard("wildcard")]
#[case::wildcard_require("wildcard-require")]
// #[case::wildcard2("wildcard2")]
#[case::wildcard3("wildcard3")]
// #[case::yarn_workspace_esm("yarn-workspace-esm")]
// #[case::yarn_workspaces("yarn-workspaces")]
// #[case::zeromq_node_gyp("zeromq-node-gyp")]
fn unit_test(#[case] input: &str) -> Result<()> {
    node_file_trace(input)
}

/// A case can be traced from more than one entry point, mirroring the `inputFileNames` list in
/// `tests/node-file-trace/unit.test.js`. The traces of all entries are unioned.
#[turbo_tasks::function(operation, root)]
async fn node_file_trace_operation(
    package_root: RcStr,
    inputs: Vec<RcStr>,
    conditions: Vec<RcStr>,
) -> Result<Vc<Vec<RcStr>>> {
    let workspace_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(DiskFileSystem::new(
        rcstr!("workspace"),
        Vc::cell(package_root.clone()),
    ));
    let input_dir = workspace_fs.root().owned().await?;
    let inputs = inputs
        .iter()
        .map(|input| input_dir.join(input))
        .collect::<Result<Vec<_>>>()?;
    let Some(first_input) = inputs.first() else {
        anyhow::bail!("at least one entry point is required");
    };

    // All entry points of a case live in the same directory, which is the cwd nft is run with.
    let cwd = first_input.parent();
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment {
            cwd: ResolvedVc::cell(Some(cwd)),
            ..Default::default()
        }
        .resolved_cell(),
    ));

    // Mirrors the `paths` option that `tests/node-file-trace/unit.test.js` passes for the
    // `esm-paths` and `esm-paths-trailer` cases.
    let mut import_map = ImportMap::empty();
    import_map.insert_exact_alias(
        rcstr!("dep"),
        ImportMapping::PrimaryAlternative(
            rcstr!("./test/unit/esm-paths/esm-dep.js"),
            Some(input_dir.clone()),
        )
        .resolved_cell(),
    );
    import_map.insert_wildcard_alias(
        rcstr!("dep/"),
        ImportMapping::PrimaryAlternative(
            rcstr!("./test/unit/esm-paths-trailer/*"),
            Some(input_dir.clone()),
        )
        .resolved_cell(),
    );
    let module_asset_context = ModuleAssetContext::new_without_replace_externals(
        Default::default(),
        // TODO These test cases should move into the `node-file-trace` crate and use the same
        // config.
        // This config should be kept in sync with
        // turbopack/crates/turbopack-tracing/tests/node-file-trace.rs and
        // turbopack/crates/turbopack-tracing/tests/unit.rs and
        // turbopack/crates/turbopack/src/lib.rs and
        // turbopack/crates/turbopack-nft/src/nft.rs
        CompileTimeInfo::new(environment),
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                ..Default::default()
            },
            css: CssOptionsContext {
                source_maps: SourceMapsType::None,
                enable_raw_css: true,
                ..Default::default()
            },
            // Environment is not passed in order to avoid downleveling JS / CSS for
            // node-file-trace.
            environment: None,
            analyze_mode: AnalyzeMode::Tracing,
            // Disable tree shaking. Even side-effect-free imports need to be traced, as they will
            // execute at runtime.
            follow_reexports: false,
            module_fragments_enabled: false,
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_node_native_modules: true,
            enable_node_modules: Some(input_dir.clone()),
            // nft applies the `browser` field remapping when tracing with the `browser` condition.
            browser: conditions.iter().any(|condition| condition == "browser"),
            custom_conditions: conditions,
            import_map: Some(import_map.resolved_cell()),
            module_sync: ConditionValue::Unknown,
            ..Default::default()
        }
        .cell(),
        Layer::new(rcstr!("test")),
    );

    let mut paths = Vec::new();
    for input in inputs {
        let module = module_asset_context
            .process(Vc::upcast(FileSource::new(input)), ReferenceType::Undefined)
            .module();

        // We treat the entry as an external
        paths.extend(to_list(module).await?);
        paths.push(module.ident().await?.path.path.clone());
    }

    Ok(Vc::cell(paths))
}

async fn to_list(asset: Vc<Box<dyn Module>>) -> Result<Vec<RcStr>> {
    let mut assets = vec![];

    let mut visited = FxHashSet::default();
    let mut queue = Vec::new();
    queue.push(asset);

    while let Some(asset) = queue.pop() {
        let references = referenced_modules_and_affecting_sources(asset, false).await?;
        let path = &asset.ident().await?.path;
        if visited.insert(asset) {
            for (_, references) in references.iter().rev() {
                for asset in references.modules.iter() {
                    queue.push(**asset);
                }
            }
        }
        assets.push(path.path.clone());
    }

    assets.sort();
    assets.dedup();

    Ok(assets)
}

static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r",[\s\n]*\]").unwrap());
static LINE_COMMENTS_COMMA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*//.*$").unwrap());

/// The per-case options that `tests/node-file-trace/unit.test.js` reads from a case's
/// `test-opts.json`, as far as this harness supports them.
///
/// nft's `depth` (limit the traced dependency depth) and `mixedModules` options have no equivalent
/// here, so cases relying on them stay disabled.
#[derive(Debug, Default, Deserialize)]
struct TestOptions {
    /// The export conditions to resolve with. nft defaults to `["node"]`.
    conditions: Option<Vec<RcStr>>,
}

impl TestOptions {
    fn read(case_dir: &Path) -> Result<Self> {
        match std::fs::read_to_string(case_dir.join("test-opts.json")) {
            Ok(contents) => Ok(serde_json::from_str(&contents)?),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(Self::default()),
            Err(err) => Err(err.into()),
        }
    }
}

fn node_file_trace(input_path: &str) -> Result<()> {
    let r = &mut {
        let mut builder = tokio::runtime::Builder::new_multi_thread();
        builder.enable_all();
        builder.max_blocking_threads(20);
        builder.build().unwrap()
    };

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let package_root = package_root.join("tests/node-file-trace");
    let case_dir = package_root.join(format!("test/unit/{input_path}"));
    let entry_names: &[&str] = match input_path {
        "jsx-input" => &["input.jsx"],
        "tsx-input" => &["input.tsx"],
        "ts-input-esm" => &["input.ts"],
        "module-create-require-no-mixed"
        | "module-create-require-named-require"
        | "module-create-require-named-import"
        | "module-create-require-ignore-other"
        | "module-create-require-destructure" => &["input.mjs"],
        "multi-input" => &["input.js", "input-2.js", "input-3.js", "input-4.js"],
        _ => &["input.js"],
    };
    let inputs = entry_names
        .iter()
        .map(|entry_name| format!("test/unit/{input_path}/{entry_name}").into())
        .collect::<Vec<RcStr>>();
    let conditions = TestOptions::read(&case_dir)?
        .conditions
        .unwrap_or_else(|| vec![rcstr!("node")]);
    let reference = case_dir.join("output.js");

    r.block_on(async move {
        let future = async move {
            let op = node_file_trace_operation(
                package_root.to_string_lossy().into(),
                inputs.clone(),
                conditions.clone(),
            );
            let list = op
                .read_strongly_consistent()
                .await?
                .into_iter()
                .map(|s| s.to_string())
                .collect::<FxIndexSet<_>>();

            // println!("issues: {:#?}", op.peek_issues().get_plain_issues().await?);

            let reference = std::fs::read_to_string(reference)?;
            // crude JS -> JSON conversion
            let reference = TRAILING_COMMA.replace(&reference, "]");
            let reference = LINE_COMMENTS_COMMA
                .replace_all(&reference, "")
                .replace(";", "")
                .replace('\'', "\"");
            let reference = serde_json::from_str::<Vec<String>>(&reference)?
                .into_iter()
                .collect::<FxIndexSet<_>>();

            if reference == list {
                anyhow::Ok(())
            } else {
                let reference = reference.into_iter().collect::<Vec<_>>().join("\n");
                let list = list.into_iter().collect::<Vec<_>>().join("\n");
                let diff = TextDiff::from_lines(&reference, &list);
                println!(
                    "{}",
                    diff.unified_diff()
                        .context_radius(3)
                        .header("expected", "actual")
                );
                anyhow::bail!("file trace does not match reference");
            }
        };

        let tt = TurboTasks::new(TurboTasksBackend::new(
            turbo_tasks_backend::BackendOptions::default(),
            turbo_tasks_backend::noop_backing_storage(),
        ));
        tt.run_once(future).await?;
        std::mem::forget(tt);

        anyhow::Ok(())
    })
}
