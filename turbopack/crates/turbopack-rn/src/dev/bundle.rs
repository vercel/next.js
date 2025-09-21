use std::path::MAIN_SEPARATOR;

use anyhow::{Context, Result};
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystem;
use turbo_unix_path::join_path;
use turbopack_browser::{BrowserChunkingContext, react_refresh::assert_can_resolve_react_refresh};
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkingConfig, ChunkingContext, MinifyType, SourceMapsType,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    environment::{
        EdgeWorkerEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion,
    },
    file_source::FileSource,
    ident::AssetIdent,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::chunk::EcmascriptChunkType;
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::dotenv::load_env;
use turbopack_node::{child_process_backend, execution_context::ExecutionContext};
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    contexts::{
        NodeEnv, get_client_asset_context, get_client_compile_time_info,
        get_client_resolve_options_context,
    },
    embed_js::embed_file_path,
    util::{output_fs, project_fs},
};

#[turbo_tasks::function(operation, root)]
pub async fn build_rn_internal(
    platform: Option<String>,
    entries: Vec<String>,
    project_dir: RcStr,
    root_dir_vc: ResolvedVc<RcStr>,
) -> Result<Vc<OutputAssets>> {
    let output_fs = output_fs(project_dir.clone());
    const OUTPUT_DIR: &str = "dist";
    let project_relative = project_dir.strip_prefix(&*root_dir).unwrap();
    let project_relative: RcStr = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/")
        .into();
    let project_fs = project_fs(
        *root_dir_vc,
        /* watch= */ true,
        join_path(project_relative.as_str(), OUTPUT_DIR)
            .unwrap()
            .into(),
    );
    let root_path = project_fs.root().owned().await?;
    let project_path = root_path.join(&project_relative)?;
    let build_output_root = output_fs.root().await?.join("dist")?;

    let node_env = NodeEnv::Development.cell();

    let build_output_root_to_root_path = project_path
        .join("dist")?
        .get_relative_path_to(&root_path)
        .context("Project path is in root path")?;

    let runtime_type = match *node_env.await? {
        NodeEnv::Development => RuntimeType::Development,
        NodeEnv::Production => RuntimeType::Production,
    };

    let browserslist_query = RcStr::from("Safari 8");
    let source_maps_type = SourceMapsType::Full;
    let minify_type = MinifyType::NoMinify;
    let scope_hoist = false;

    let compile_time_info = get_client_compile_time_info(browserslist_query.clone(), node_env);
    let execution_context = ExecutionContext::new(
        root_path.clone(),
        Vc::upcast(
            NodeJsChunkingContext::builder(
                project_path.clone(),
                build_output_root.join("build")?,
                build_output_root_to_root_path.clone(),
                build_output_root.join("build")?,
                build_output_root.join("build/chunks")?,
                build_output_root.join("build/assets")?,
                Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment::default().resolved_cell(),
                ))
                .to_resolved()
                .await?,
                runtime_type,
            )
            .build(),
        ),
        load_env(root_path.clone()),
        child_process_backend(),
    );

    let asset_context = get_client_asset_context(
        project_path.clone(),
        execution_context,
        compile_time_info,
        node_env,
        source_maps_type,
        platform.clone().map(RcStr::from),
    );

    let entry_requests = std::iter::once(
        assert_can_resolve_react_refresh(
            project_path.clone(),
            get_client_resolve_options_context(
                project_path.clone(),
                node_env,
                platform.map(RcStr::from),
            ),
        )
        .await?
        .as_request(),
    )
    .flatten()
    .chain(entries.into_iter().map(|p| {
        Request::relative(
            RcStr::from(p).into(),
            Default::default(),
            Default::default(),
            false,
        )
    }))
    .collect::<Vec<_>>();

    let origin = PlainResolveOrigin::new(asset_context, project_fs.root().await?.join("_")?);
    let project_dir = &project_dir;
    let main_entries = async move {
        entry_requests
            .into_iter()
            .map(|request_vc| async move {
                let ty = ReferenceType::Entry(EntryReferenceSubType::Undefined);
                let request = request_vc.await?;
                origin
                    .resolve_asset(request_vc, origin.resolve_options(ty.clone()), ty)
                    .await?
                    .first_module()
                    .await?
                    .with_context(|| {
                        format!(
                            "Unable to resolve entry {} from directory {}.",
                            request.request().unwrap(),
                            project_dir
                        )
                    })
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("resolve entries"))
    .await?;

    let entries = [asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed_file_path(rcstr!("entry/bootstrap.ts"))
                    .owned()
                    .await?,
            )),
            ReferenceType::Entry(EntryReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?]
    .into_iter()
    .chain(main_entries)
    .collect::<Vec<_>>();

    let module_graph = ModuleGraph::from_graphs(
        vec![SingleModuleGraph::new_with_entries(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(entries.clone())])
                .resolved_cell(),
            false,
            false,
        )],
        None,
    )
    .connect();

    let chunking_context: Vc<Box<dyn ChunkingContext>> = {
        let mut builder = BrowserChunkingContext::builder(
            project_path,
            build_output_root.clone(),
            build_output_root_to_root_path,
            build_output_root.clone(),
            build_output_root.clone(),
            build_output_root.clone(),
            Environment::new(ExecutionEnvironment::EdgeWorker(
                EdgeWorkerEnvironment {
                    // We need to transpile classes and async/await away.
                    node_version: NodeJsVersion::Static(ResolvedVc::cell(rcstr!("4.0.0")))
                        .resolved_cell(),
                }
                .resolved_cell(),
            ))
            .to_resolved()
            .await?,
            runtime_type,
        )
        .source_maps(source_maps_type)
        .minify_type(minify_type)
        .hot_module_replacement();

        match *node_env.await? {
            NodeEnv::Development => {}
            NodeEnv::Production => {
                builder = builder
                    .chunking_config(
                        Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                        ChunkingConfig {
                            min_chunk_size: 50_000,
                            max_chunk_count_per_group: 40,
                            max_merge_chunk_size: 200_000,
                            ..Default::default()
                        },
                    )
                    .chunking_config(
                        Vc::<CssChunkType>::default().to_resolved().await?,
                        ChunkingConfig {
                            max_merge_chunk_size: 100_000,
                            ..Default::default()
                        },
                    )
                    .module_merging(scope_hoist);
            }
        }

        Vc::upcast(builder.build())
    };

    let entry_chunk_group = chunking_context
        .evaluated_chunk_group(
            AssetIdent::from_path(
                build_output_root
                    .join("index.js")?
                    .with_extension("entry.js"),
            )
            .into_vc(),
            ChunkGroup::Entry(entries.clone()),
            module_graph,
            OutputAssets::empty(),
            AvailabilityInfo::root(),
        )
        .await?
        .assets;

    let mut chunks: FxHashSet<ResolvedVc<Box<dyn OutputAsset>>> = FxHashSet::default();
    chunks.extend(
        &*async { all_assets_from_entries(*entry_chunk_group).await }
            .instrument(tracing::info_span!("list chunks"))
            .await?,
    );

    chunks
        .iter()
        .map(|c| async move { c.content().write(c.path().owned().await?).await })
        .try_join()
        .await?;

    Ok(*entry_chunk_group)
}
