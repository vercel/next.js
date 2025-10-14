#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

mod util;

use std::{collections::VecDeque, fs, io, path::PathBuf};

use anyhow::{Context, Result, bail};
use dunce::canonicalize;
use rustc_hash::FxHashSet;
use serde::Deserialize;
use serde_json::json;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks, ValueToString, Vc, apply_effects};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_env::DotenvProcessEnv;
use turbo_tasks_fs::{
    DiskFileSystem, FileSystem, FileSystemPath, json::parse_json_with_source_context,
};
use turbo_unix_path::sys_to_unix;
use turbopack::{
    ModuleAssetContext,
    ecmascript::{
        AnalyzeMode, EcmascriptInputTransform, TreeShakingMode, chunk::EcmascriptChunkType,
    },
    module_options::{
        EcmascriptOptionsContext, JsxTransformOptions, ModuleOptionsContext, ModuleRule,
        ModuleRuleEffect, RuleCondition, TypescriptTransformOptions,
    },
};
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkingConfig, ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssetExt,
        EvaluatableAssets, MinifyType, availability_info::AvailabilityInfo,
    },
    compile_time_defines,
    compile_time_info::{CompileTimeDefineValue, CompileTimeInfo, DefinableNameSegment},
    condition::ContextCondition,
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    free_var_references,
    ident::Layer,
    issue::CollectibleIssuesExt,
    module::Module,
    module_graph::{
        ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
        export_usage::compute_export_usage_info,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_ecmascript_plugins::transform::{
    emotion::{EmotionTransformConfig, EmotionTransformer},
    styled_components::{StyledComponentsTransformConfig, StyledComponentsTransformer},
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::ProcessEnvAsset;
use turbopack_nodejs::NodeJsChunkingContext;
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;
use turbopack_test_utils::snapshot::{UPDATE, diff, expected, matches_expected, snapshot_issues};

use crate::util::REPO_ROOT;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotOptions {
    #[serde(default = "default_browserslist")]
    browserslist: String,
    #[serde(default = "default_entry")]
    entry: String,
    #[serde(default = "default_minify_type")]
    minify_type: MinifyType,
    #[serde(default)]
    runtime: Runtime,
    #[serde(default = "default_runtime_type")]
    runtime_type: RuntimeType,
    #[serde(default)]
    environment: SnapshotEnvironment,
    #[serde(default)]
    tree_shaking_mode: Option<TreeShakingMode>,
    #[serde(default)]
    remove_unused_exports: bool,
    #[serde(default)]
    scope_hoisting: bool,
    #[serde(default)]
    production_chunking: bool,
    #[serde(default)]
    enable_debug_ids: bool,
}

#[derive(Debug, Deserialize, Default)]
enum Runtime {
    #[default]
    Browser,
    NodeJs,
}

#[derive(Debug, Deserialize, Default)]
enum SnapshotEnvironment {
    #[default]
    Browser,
    NodeJs,
}

impl Default for SnapshotOptions {
    fn default() -> Self {
        SnapshotOptions {
            browserslist: default_browserslist(),
            entry: default_entry(),
            minify_type: default_minify_type(),
            runtime: Default::default(),
            runtime_type: default_runtime_type(),
            environment: Default::default(),
            tree_shaking_mode: None,
            remove_unused_exports: false,
            scope_hoisting: false,
            production_chunking: false,
            enable_debug_ids: false,
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

fn default_minify_type() -> MinifyType {
    MinifyType::NoMinify
}

fn is_empty_dir_tree(dir_entries: impl IntoIterator<Item = io::Result<fs::DirEntry>>) -> bool {
    for entry in dir_entries.into_iter() {
        let entry = entry.unwrap();
        if !entry.file_type().unwrap().is_dir()
            || !is_empty_dir_tree(fs::read_dir(entry.path()).unwrap())
        {
            return false;
        }
    }
    true
}

#[testing::fixture("tests/snapshot/*/*/input/index.js", exclude("node_modules"))]
fn test(resource: PathBuf) {
    let resource = resource.parent().unwrap().parent().unwrap().to_path_buf();
    let resource = canonicalize(resource).unwrap();

    let mut has_output_dir = false;
    let contents = fs::read_dir(&resource)
        .unwrap()
        .filter(|entry| {
            if entry.as_ref().unwrap().file_name() == "output" {
                has_output_dir = true;
                false
            } else {
                true
            }
        })
        .collect::<Vec<_>>();
    if is_empty_dir_tree(contents) {
        // a directory without input or config is invalid
        if *UPDATE {
            fs::remove_dir_all(&resource).unwrap();
        } else if has_output_dir {
            let output_dir = resource.join("output");
            if !is_empty_dir_tree(fs::read_dir(output_dir).unwrap()) {
                panic!("{resource:?} contains a non-empty output directory, but no input files");
            }
        }
        return;
    }

    // Separating this into a different function fixes my IDE's types for some
    // reason...
    run(resource).unwrap();
}

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn run(resource: PathBuf) -> Result<()> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            // Enable dependency tracking when we are running under UPDATE=1 to ensure file writes
            // don't crash the test.
            dependency_tracking: *UPDATE,
            ..Default::default()
        },
        noop_backing_storage(),
    ));
    tt.run_once(async move {
        let emit_op = run_inner_operation(resource.to_str().unwrap().into());
        emit_op.read_strongly_consistent().await?;
        apply_effects(emit_op).await?;

        Ok(())
    })
    .await?;

    Ok(())
}

#[turbo_tasks::function(operation)]
async fn run_inner_operation(resource: RcStr) -> Result<()> {
    let out_op = run_test_operation(resource);
    let out_vc = out_op.resolve_strongly_consistent().await?.owned().await?;

    let plain_issues = out_op.peek_issues().get_plain_issues().await?;

    snapshot_issues(plain_issues, out_vc.join("issues")?, &REPO_ROOT)
        .await
        .context("Unable to handle issues")?;

    Ok(())
}

#[turbo_tasks::function(operation)]
async fn run_test_operation(resource: RcStr) -> Result<Vc<FileSystemPath>> {
    let test_path = canonicalize(&resource)?;
    assert!(test_path.exists(), "{resource} does not exist");
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
    let project_fs = DiskFileSystem::new(rcstr!("project"), REPO_ROOT.clone());
    let project_root = project_fs.root().owned().await?;

    let relative_path = test_path.strip_prefix(&*REPO_ROOT)?;
    let relative_path = RcStr::from(sys_to_unix(relative_path.to_str().unwrap()));
    let project_path = project_root.join(&relative_path)?;

    let project_path_to_project_root = project_path
        .get_relative_path_to(&project_root)
        .context("Project path is in root path")?;

    let entry_asset = project_path.join(&options.entry)?;

    let env = Environment::new(match options.environment {
        SnapshotEnvironment::Browser => {
            ExecutionEnvironment::Browser(
                // TODO: load more from options.json
                BrowserEnvironment {
                    dom: true,
                    web_worker: false,
                    service_worker: false,
                    browserslist_query: options.browserslist.into(),
                }
                .resolved_cell(),
            )
        }
        SnapshotEnvironment::NodeJs => {
            ExecutionEnvironment::NodeJsBuildTime(
                // TODO: load more from options.json
                NodeJsEnvironment::default().resolved_cell(),
            )
        }
    })
    .to_resolved()
    .await?;

    let mut defines = compile_time_defines!(
        process.turbopack = true,
        process.env.TURBOPACK = true,
        process.env.NODE_ENV = "development",
        DEFINED_VALUE = "value",
        DEFINED_TRUE = true,
        DEFINED_NULL = json!(null),
        DEFINED_INT = json!(1),
        DEFINED_FLOAT = json!(0.01),
        DEFINED_ARRAY = json!([ false, 0, "1", { "v": "v" }, null ]),
        A.VERY.LONG.DEFINED.VALUE = json!({ "test": true }),
    );

    defines.0.insert(
        vec![DefinableNameSegment::from("DEFINED_EVALUATE")],
        CompileTimeDefineValue::Evaluate("1 + 1".into()),
    );

    defines.0.insert(
        vec![DefinableNameSegment::from("DEFINED_EVALUATE_NESTED")],
        CompileTimeDefineValue::Array(vec![
            CompileTimeDefineValue::Bool(true),
            CompileTimeDefineValue::Undefined,
            CompileTimeDefineValue::Evaluate("() => 1".into()),
        ]),
    );

    let compile_time_info = CompileTimeInfo::builder(env)
        .defines(defines.clone().resolved_cell())
        .free_var_references(free_var_references!(..defines.into_iter()).resolved_cell())
        .cell()
        .await?;

    let conditions = RuleCondition::any(vec![
        RuleCondition::ResourcePathEndsWith(".js".into()),
        RuleCondition::ResourcePathEndsWith(".jsx".into()),
        RuleCondition::ResourcePathEndsWith(".ts".into()),
        RuleCondition::ResourcePathEndsWith(".tsx".into()),
    ]);

    let module_rules = ModuleRule::new(
        conditions,
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![
                EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
                    EmotionTransformer::new(&EmotionTransformConfig::default())
                        .expect("Should be able to create emotion transformer"),
                ) as _)),
                EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
                    StyledComponentsTransformer::new(&StyledComponentsTransformConfig::default()),
                ) as _)),
            ]),
            postprocess: ResolvedVc::cell(vec![]),
        }],
    );
    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_typescript_transform: Some(
                    TypescriptTransformOptions::default().resolved_cell(),
                ),
                enable_jsx: Some(JsxTransformOptions::resolved_cell(JsxTransformOptions {
                    development: true,
                    ..Default::default()
                })),
                ignore_dynamic_requests: true,
                ..Default::default()
            },
            environment: Some(env),
            rules: vec![(
                ContextCondition::InDirectory("node_modules".into()),
                ModuleOptionsContext {
                    environment: Some(env),
                    tree_shaking_mode: options.tree_shaking_mode,
                    analyze_mode: AnalyzeMode::CodeGenerationAndTracing,
                    ..Default::default()
                }
                .resolved_cell(),
            )],
            module_rules: vec![module_rules],
            tree_shaking_mode: options.tree_shaking_mode,
            analyze_mode: AnalyzeMode::CodeGenerationAndTracing,
            ..Default::default()
        }
        .into(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_react: true,
            enable_node_modules: Some(project_root.clone()),
            custom_conditions: vec![rcstr!("development")],
            rules: vec![(
                ContextCondition::InDirectory("node_modules".into()),
                ResolveOptionsContext {
                    enable_node_modules: Some(project_root.clone()),
                    custom_conditions: vec![rcstr!("development")],
                    ..Default::default()
                }
                .resolved_cell(),
            )],
            ..Default::default()
        }
        .cell(),
        Layer::new(rcstr!("test")),
    ));

    let runtime_entries = maybe_load_env(asset_context, project_path.clone())
        .await?
        .map(|asset| EvaluatableAssets::one(asset.to_evaluatable(asset_context)));

    let entry_module = asset_context
        .process(
            Vc::upcast(FileSource::new(entry_asset)),
            ReferenceType::Entry(EntryReferenceSubType::Undefined),
        )
        .module();

    let (evaluatable_assets, entry_modules) = if let Some(ecmascript) =
        Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(entry_module).await?
    {
        let evaluatable_assets = runtime_entries
            .unwrap_or_else(EvaluatableAssets::empty)
            .with_entry(ecmascript);
        (
            evaluatable_assets,
            evaluatable_assets
                .await?
                .iter()
                .copied()
                .map(ResolvedVc::upcast)
                .collect::<Vec<_>>(),
        )
    } else {
        // TODO convert into a serve-able asset
        bail!("Entry module is not chunkable, so it can't be used to bootstrap the application")
    };

    let module_graph = ModuleGraph::from_modules(
        Vc::cell(vec![ChunkGroupEntry::Entry(entry_modules.clone())]),
        false,
    );

    let export_usage = if options.remove_unused_exports {
        Some(
            compute_export_usage_info(module_graph.to_resolved().await?)
                .resolve_strongly_consistent()
                .await?,
        )
    } else {
        None
    };

    let chunk_root_path = project_path.join("output")?;
    let static_root_path = project_path.join("static")?;
    let expected_paths = expected(chunk_root_path.clone())
        .await?
        .union(&expected(static_root_path.clone()).await?)
        .cloned()
        .collect();

    let chunking_context: Vc<Box<dyn ChunkingContext>> = match options.runtime {
        Runtime::Browser => {
            let mut builder = BrowserChunkingContext::builder(
                project_root,
                project_path.clone(),
                project_path_to_project_root,
                project_path.clone(),
                chunk_root_path.clone(),
                static_root_path.clone(),
                env,
                options.runtime_type,
            )
            .minify_type(options.minify_type)
            .module_merging(options.scope_hoisting)
            .export_usage(export_usage)
            .debug_ids(options.enable_debug_ids);

            if options.production_chunking {
                builder = builder.chunking_config(
                    Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                    ChunkingConfig {
                        min_chunk_size: 2_000,
                        max_chunk_count_per_group: 40,
                        max_merge_chunk_size: 200_000,
                        ..Default::default()
                    },
                )
            }
            Vc::upcast(builder.build())
        }
        Runtime::NodeJs => {
            let mut builder = NodeJsChunkingContext::builder(
                project_root,
                project_path.clone(),
                project_path_to_project_root,
                project_path.clone(),
                chunk_root_path.clone(),
                static_root_path.clone(),
                env,
                options.runtime_type,
            )
            .minify_type(options.minify_type)
            .module_merging(options.scope_hoisting)
            .export_usage(export_usage)
            .debug_ids(options.enable_debug_ids);

            if options.production_chunking {
                builder = builder.chunking_config(
                    Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                    ChunkingConfig {
                        min_chunk_size: 2_000,
                        max_chunk_count_per_group: 40,
                        max_merge_chunk_size: 200_000,
                        ..Default::default()
                    },
                )
            }
            Vc::upcast(builder.build())
        }
    };

    // TODO: Load runtime entries from snapshots
    let chunks = match options.runtime {
        Runtime::Browser => chunking_context.evaluated_chunk_group_assets(
            entry_module.ident(),
            ChunkGroup::Entry(entry_modules.into_iter().collect()),
            module_graph,
            AvailabilityInfo::Root,
        ),
        Runtime::NodeJs => {
            OutputAssetsWithReferenced {
                assets: ResolvedVc::cell(vec![
                    Vc::try_resolve_downcast_type::<NodeJsChunkingContext>(chunking_context)
                        .await?
                        .unwrap()
                        .entry_chunk_group(
                            // `expected` expects a completely flat output directory.
                            chunk_root_path
                                .join(entry_module.ident().path().await?.file_stem().unwrap())?
                                .with_extension("entry.js"),
                            evaluatable_assets,
                            module_graph,
                            OutputAssets::empty(),
                            OutputAssets::empty(),
                            AvailabilityInfo::Root,
                        )
                        .await?
                        .asset,
                ]),
                referenced_assets: ResolvedVc::cell(vec![]),
            }
            .cell()
        }
    };

    let mut seen = FxHashSet::default();
    let mut queue: VecDeque<_> = chunks.all_assets().await?.iter().copied().collect();

    let output_path = project_path.clone();
    while let Some(asset) = queue.pop_front() {
        walk_asset(asset, &output_path, &mut seen, &mut queue)
            .await
            .context(format!(
                "Failed to walk asset {}",
                asset.path().to_string().await.context("to_string failed")?
            ))?;
    }

    matches_expected(expected_paths, seen)
        .await
        .context("Actual assets doesn't match with expected assets")?;

    Ok(project_path.cell())
}

async fn walk_asset(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    output_path: &FileSystemPath,
    seen: &mut FxHashSet<FileSystemPath>,
    queue: &mut VecDeque<ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<()> {
    let path = asset.path().owned().await?;

    if !seen.insert(path.clone()) {
        return Ok(());
    }

    if path.is_inside_ref(output_path) {
        // Only consider assets that should be written to disk.
        diff(path.clone(), asset.content()).await?;
    }

    queue.extend(asset.references().await?.iter().copied());

    Ok(())
}

async fn maybe_load_env(
    _context: Vc<Box<dyn AssetContext>>,
    path: FileSystemPath,
) -> Result<Option<Vc<Box<dyn Source>>>> {
    let dotenv_path = path.join("input/.env")?;

    if !dotenv_path.read().await?.is_content() {
        return Ok(None);
    }

    let env = DotenvProcessEnv::new(None, dotenv_path.clone());
    let asset = ProcessEnvAsset::new(dotenv_path, Vc::upcast(env));
    Ok(Some(Vc::upcast(asset)))
}
