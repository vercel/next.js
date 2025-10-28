#![allow(clippy::items_after_test_module)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod helpers;
use std::{path::PathBuf, sync::LazyLock};

use anyhow::Result;
use difference::Changeset;
use regex::Regex;
use rstest::*;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack::{
    ModuleAssetContext,
    ecmascript::AnalyzeMode,
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, ModuleOptionsContext,
        TypescriptTransformOptions,
    },
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
    module::Module,
    output::OutputAsset,
    reference::all_assets_from_entries,
    reference_type::ReferenceType,
    traced_asset::TracedAsset,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::helpers::print_changeset;

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
// #[case::asset_fs_inline_path_ts("asset-fs-inline-path-ts")]
#[case::asset_fs_inline_path_ts_no_interop("asset-fs-inline-path-ts-no-interop")]
#[case::asset_fs_inline_tpl("asset-fs-inline-tpl")]
#[case::asset_fs_inlining("asset-fs-inlining")]
#[case::asset_fs_inlining_multi("asset-fs-inlining-multi")]
#[case::asset_fs_logical("asset-fs-logical")]
// #[case::asset_graceful_fs("asset-graceful-fs")]
#[case::asset_node_require("asset-node-require")]
#[case::asset_package_json("asset-package-json")]
// #[case::asset_symlink("asset-symlink")]
#[case::basic_analysis_require("basic-analysis-require")]
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
// #[case::dirname_emit("dirname-emit")]
// #[case::dirname_emit_concat("dirname-emit-concat")]
#[case::dirname_len("dirname-len")]
#[case::dot_dot("dot-dot")]
#[case::esm_dynamic_import("esm-dynamic-import")]
#[case::esm_export_wildcard("esm-export-wildcard")]
// #[case::esm_paths("esm-paths")]
// #[case::esm_paths_trailer("esm-paths-trailer")]
// #[case::exports("exports")]
// #[case::exports_fallback("exports-fallback")]
// #[case::exports_nomodule("exports-nomodule")]
// #[case::exports_only("exports-only")]
// #[case::exports_path("exports-path")]
// #[case::exports_wildcard("exports-wildcard")]
// #[case::ffmpeg_installer("ffmpeg-installer")]
// #[case::file_folder_slash("file-folder-slash")]
// #[case::filter_asset_base("filter-asset-base")]
// #[case::fs_emission("fs-emission")]
// #[case::glob_dot("glob-dot")]
// #[case::import_assertions("import-assertions")]
// #[case::import_attributes("import-attributes")]
// #[case::import_meta_bad_url("import-meta-bad-url")]
// #[case::import_meta_tpl_cnd("import-meta-tpl-cnd")]
#[case::import_meta_url("import-meta-url")]
// #[case::imports("imports")]
// #[case::jsonc_parser_wrapper("jsonc-parser-wrapper")]
// #[case::jsx_input("jsx-input")]
// #[case::microtime_node_gyp("microtime-node-gyp")]
// #[case::mixed_esm_cjs("mixed-esm-cjs")]
#[case::module_create_require("module-create-require")]
// #[case::module_register("module-register")]
// #[case::module_require("module-require")]
// #[case::module_sync_condition_cjs("module-sync-condition-cjs")]
// #[case::module_sync_condition_es("module-sync-condition-es")]
// #[case::module_sync_condition_es_node20("module-sync-condition-es-node20")]
// #[case::mongoose("mongoose")]
// #[case::multi_input("multi-input")]
#[case::node_modules_filter("node-modules-filter")]
// #[case::non_analyzable_requires("non-analyzable-requires")]
#[case::null_destructure("null-destructure")]
// #[case::path_sep("path-sep")]
// #[case::phantomjs_prebuilt("phantomjs-prebuilt")]
// #[case::pixelmatch("pixelmatch")]
// #[case::pkginfo("pkginfo")]
// #[case::pnpm_symlinks("pnpm-symlinks")]
// #[case::prisma_photon("prisma-photon")]
// #[case::process_cwd("process-cwd")]
// #[case::process_env("process-env")]
// #[case::processed_dependency("processed-dependency")]
#[case::protobuf_loop("protobuf-loop")]
#[case::protobuf_loop2("protobuf-loop2")]
#[case::require_call("require-call")]
// #[case::require_dirname_tpl("require-dirname-tpl")]
// #[case::require_dot("require-dot")]
// #[case::require_dynamic_fallback("require-dynamic-fallback")]
#[case::require_empty("require-empty")]
// #[case::require_resolve("require-resolve")]
// #[case::require_symlink("require-symlink")]
// #[case::require_var_branch("require-var-branch")]
// #[case::require_wrapper("require-wrapper")]
// #[case::require_wrapper2("require-wrapper2")]
// #[case::require_wrapper3("require-wrapper3")]
// #[case::resolve_from("resolve-from")]
// #[case::resolve_hook("resolve-hook")]
// #[case::return_emission("return-emission")]
// #[case::shiki("shiki")]
// #[case::string_concat("string-concat")]
#[case::syntax_err("syntax-err")]
// #[case::top_level_await("top-level-await")]
// #[case::ts_filter("ts-filter")]
// #[case::ts_input_esm("ts-input-esm")]
#[case::ts_path_join("ts-path-join")]
// #[case::tsx("tsx")]
// #[case::tsx_input("tsx-input")]
#[case::url_error("url-error")]
// #[case::webpack_5_wrapper_namespace("webpack-5-wrapper-namespace")]
// #[case::webpack_node("webpack-node")]
// #[case::webpack_wrapper("webpack-wrapper")]
// #[case::webpack_wrapper_dirname_inject("webpack-wrapper-dirname-inject")]
// #[case::webpack_wrapper_multi("webpack-wrapper-multi")]
// #[case::webpack_wrapper_name("webpack-wrapper-name")]
// #[case::webpack_wrapper_null("webpack-wrapper-null")]
// #[case::webpack_wrapper_strs_namespaces("webpack-wrapper-strs-namespaces")]
// #[case::webpack_wrapper_strs_namespaces_large("webpack-wrapper-strs-namespaces-large")]
// #[case::when_wrapper("when-wrapper")]
#[case::wildcard("wildcard")]
// #[case::wildcard_require("wildcard-require")]
// #[case::wildcard2("wildcard2")]
// #[case::wildcard3("wildcard3")]
// #[case::yarn_workspace_esm("yarn-workspace-esm")]
// #[case::yarn_workspaces("yarn-workspaces")]
// #[case::zeromq_node_gyp("zeromq-node-gyp")]
fn unit_test(#[case] input: &str) -> Result<()> {
    node_file_trace(input)
}

#[turbo_tasks::function(operation)]
async fn node_file_trace_operation(package_root: RcStr, input: RcStr) -> Result<Vc<Vec<RcStr>>> {
    let workspace_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(DiskFileSystem::new(
        rcstr!("workspace"),
        package_root.clone(),
    ));
    let input_dir = workspace_fs.root().owned().await?;
    let input = input_dir.join(&input)?;

    let source = FileSource::new(input.clone());
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment {
            cwd: ResolvedVc::cell(Some(input.parent())),
            ..Default::default()
        }
        .resolved_cell(),
    ));
    let module_asset_context = ModuleAssetContext::new(
        Default::default(),
        // TODO These test cases should move into the `node-file-trace` crate and use the same
        // config.
        // It's easy to make a mistake here as this should match the config in the binary from
        // turbopack/crates/turbopack/src/lib.rs
        CompileTimeInfo::new(environment),
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                ..Default::default()
            },
            css: CssOptionsContext {
                enable_raw_css: true,
                ..Default::default()
            },
            // Environment is not passed in order to avoid downleveling JS / CSS for
            // node-file-trace.
            environment: None,
            analyze_mode: AnalyzeMode::Tracing,
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_node_native_modules: true,
            enable_node_modules: Some(input_dir.clone()),
            custom_conditions: vec![rcstr!("node")],
            ..Default::default()
        }
        .cell(),
        Layer::new(rcstr!("test")),
    );

    let module = module_asset_context
        .process(Vc::upcast(source), ReferenceType::Undefined)
        .module();

    // We treat the entry as an external
    let mut paths = to_list(vec![ResolvedVc::upcast(
        TracedAsset::new(module).to_resolved().await?,
    )])
    .await?;
    paths.push(module.ident().path().await?.path.clone());

    Ok(Vc::cell(paths))
}

async fn to_list(assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>) -> Result<Vec<RcStr>> {
    let mut assets = all_assets_from_entries(Vc::cell(assets))
        .await?
        .iter()
        .map(async |a| Ok(a.path().await?.path.clone()))
        .try_join()
        .await?;
    assets.sort();
    assets.dedup();

    Ok(assets)
}

static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r",[\s\n]*\]").unwrap());
static LINE_COMMENTS_COMMA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*//.*$").unwrap());

fn node_file_trace(input_path: &str) -> Result<()> {
    let r = &mut {
        let mut builder = tokio::runtime::Builder::new_multi_thread();
        builder.enable_all();
        builder.max_blocking_threads(20);
        builder.build().unwrap()
    };

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let package_root = package_root.join("tests/node-file-trace");
    let input: RcStr = format!("test/unit/{input_path}/input.js").into();
    let reference = package_root.join(format!("test/unit/{input_path}/output.js"));

    r.block_on(async move {
        let future = async move {
            let op =
                node_file_trace_operation(package_root.to_string_lossy().into(), input.clone());
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
                println!(
                    "{}",
                    print_changeset(&Changeset::new(reference.trim(), list.trim(), "\n"))
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
