use anyhow::{anyhow, bail, Context, Result};
use futures::StreamExt;
use indexmap::indexmap;
use serde::Deserialize;
use serde_json::json;
use turbo_tasks::{
    primitives::{JsonValueVc, StringsVc},
    util::SharedError,
    CompletionVc, CompletionsVc, Value,
};
use turbo_tasks_fs::json::parse_json_with_source_context;
use turbopack_binding::{
    turbo::{
        tasks_bytes::{Bytes, Stream},
        tasks_fs::{to_sys_path, File, FileSystemPathVc},
    },
    turbopack::{
        core::{
            asset::{AssetOptionVc, AssetVc},
            changed::any_content_changed,
            chunk::ChunkingContext,
            context::{AssetContext, AssetContextVc},
            environment::{EnvironmentIntention::Middleware, ServerAddrVc, ServerInfo},
            ident::AssetIdentVc,
            issue::IssueVc,
            reference_type::{EcmaScriptModulesReferenceSubType, InnerAssetsVc, ReferenceType},
            resolve::{find_context_file, FindContextFileResult},
            source_asset::SourceAssetVc,
            virtual_asset::VirtualAssetVc,
        },
        dev::DevChunkingContextVc,
        node::{
            debug::should_debug,
            evaluate::evaluate,
            execution_context::{ExecutionContext, ExecutionContextVc},
            source_map::{trace_stack, StructuredError},
        },
        turbopack::{
            evaluate_context::node_evaluate_asset_context, transition::TransitionsByNameVc,
        },
    },
};

use crate::{
    embed_js::next_asset,
    mode::NextMode,
    next_config::NextConfigVc,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        route_transition::NextEdgeRouteTransition,
    },
    next_import_map::get_next_build_import_map,
    next_server::context::{get_server_module_options_context, ServerContextType},
    util::{parse_config_from_source, NextSourceConfigVc},
};

#[turbo_tasks::function]
fn next_configs() -> StringsVc {
    StringsVc::cell(
        ["next.config.mjs", "next.config.js"]
            .into_iter()
            .map(ToOwned::to_owned)
            .collect(),
    )
}

#[turbo_tasks::function]
async fn middleware_files(page_extensions: StringsVc) -> Result<StringsVc> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
        })
        .collect();
    Ok(StringsVc::cell(files))
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RouterRequest {
    pub method: String,
    pub pathname: String,
    pub raw_query: String,
    pub raw_headers: Vec<(String, String)>,
    pub body: Vec<Bytes>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RewriteResponse {
    pub url: String,
    pub headers: Vec<(String, String)>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MiddlewareHeadersResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct MiddlewareBodyResponse(Bytes);

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum RouterIncomingMessage {
    Rewrite { data: RewriteResponse },
    MiddlewareHeaders { data: MiddlewareHeadersResponse },
    MiddlewareBody { data: Vec<u8> },
    None,
    Error { error: StructuredError },
}

#[turbo_tasks::value]
#[derive(Debug, Clone, Default)]
pub struct MiddlewareResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    #[turbo_tasks(trace_ignore)]
    pub body: Stream<Result<Bytes, SharedError>>,
}

#[turbo_tasks::value]
#[derive(Debug)]
pub enum RouterResult {
    Rewrite(RewriteResponse),
    Middleware(MiddlewareResponse),
    None,
    Error(#[turbo_tasks(trace_ignore)] SharedError),
}

#[turbo_tasks::function]
async fn get_config(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    configs: StringsVc,
) -> Result<AssetOptionVc> {
    let find_config_result = find_context_file(project_path, configs);
    let config_asset = match &*find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => Some(context.process(
            SourceAssetVc::new(*config_path).as_asset(),
            Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
        )),
        FindContextFileResult::NotFound(_) => None,
    };
    Ok(AssetOptionVc::cell(config_asset))
}

#[turbo_tasks::function]
async fn next_config_changed(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
) -> Result<CompletionVc> {
    let next_config = get_config(context, project_path, next_configs()).await?;
    Ok(if let Some(c) = *next_config {
        any_content_changed(c)
    } else {
        CompletionVc::immutable()
    })
}

#[turbo_tasks::function]
async fn config_assets(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<InnerAssetsVc> {
    let middleware_config =
        get_config(context, project_path, middleware_files(page_extensions)).await?;

    // The router.ts file expects a manifest of chunks for the middleware. If there
    // is no middleware file, then we need to generate a default empty manifest
    // and we cannot process it with the next-edge transition because it
    // requires a real file for some reason.
    let (manifest, config) = match &*middleware_config {
        Some(c) => {
            let manifest = context.with_transition("next-edge").process(
                *c,
                Value::new(ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Undefined,
                )),
            );
            let config = parse_config_from_source(*c);
            (manifest, config)
        }
        None => {
            let manifest = context.process(
                VirtualAssetVc::new(
                    project_path.join("middleware.js"),
                    File::from("export default [];").into(),
                )
                .as_asset(),
                Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
            );
            let config = NextSourceConfigVc::default();
            (manifest, config)
        }
    };

    let config_asset = context.process(
        VirtualAssetVc::new(
            project_path.join("middleware_config.js"),
            File::from(format!(
                "export default {};",
                json!({ "matcher": &config.await?.matcher })
            ))
            .into(),
        )
        .as_asset(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
    );

    Ok(InnerAssetsVc::cell(indexmap! {
        "MIDDLEWARE_CHUNK_GROUP".to_string() => manifest,
        "MIDDLEWARE_CONFIG".to_string() => config_asset,
    }))
}

#[turbo_tasks::function]
fn route_executor(context: AssetContextVc, configs: InnerAssetsVc) -> AssetVc {
    context.process(
        next_asset("entry/router.ts"),
        Value::new(ReferenceType::Internal(configs)),
    )
}

#[turbo_tasks::function]
fn edge_transition_map(
    server_addr: ServerAddrVc,
    project_path: FileSystemPathVc,
    output_path: FileSystemPathVc,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> TransitionsByNameVc {
    let edge_compile_time_info =
        get_edge_compile_time_info(project_path, server_addr, Value::new(Middleware));

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        output_path.join("edge/assets"),
        edge_compile_time_info.environment(),
    )
    .reference_chunk_source_maps(should_debug("router"))
    .build();

    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        Value::new(ServerContextType::Middleware),
        next_config,
        execution_context,
    );

    let server_module_options_context = get_server_module_options_context(
        project_path,
        execution_context,
        Value::new(ServerContextType::Middleware),
        NextMode::Development,
        next_config,
    );

    let next_edge_transition = NextEdgeRouteTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_module_options_context: Some(server_module_options_context),
        edge_resolve_options_context,
        output_path: output_path.root(),
        base_path: project_path,
        bootstrap_asset: next_asset("entry/edge-bootstrap.ts"),
        entry_name: "middleware".to_string(),
    }
    .cell()
    .into();

    TransitionsByNameVc::cell(
        [("next-edge".to_string(), next_edge_transition)]
            .into_iter()
            .collect(),
    )
}

#[turbo_tasks::function]
pub async fn route(
    execution_context: ExecutionContextVc,
    request: RouterRequestVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    routes_changed: CompletionVc,
) -> Result<RouterResultVc> {
    let RouterRequest {
        ref method,
        ref pathname,
        ..
    } = *request.await?;
    IssueVc::attach_description(
        format!("Next.js Routing for {} {}", method, pathname),
        route_internal(
            execution_context,
            request,
            next_config,
            server_addr,
            routes_changed,
        ),
    )
    .await
}

macro_rules! shared_anyhow {
    ($msg:literal $(,)?) => {
        turbo_tasks::util::SharedError::new(anyhow::anyhow!($msg))
    };
    ($err:expr $(,)?) => {
        turbo_tasks::util::SharedError::new(anyhow::anyhow!($err))
    };
    ($fmt:expr, $($arg:tt)*) => {
        turbo_tasks::util::SharedError::new(anyhow::anyhow!($fmt, $($arg)*))
    };
}

#[turbo_tasks::function]
async fn route_internal(
    execution_context: ExecutionContextVc,
    request: RouterRequestVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    routes_changed: CompletionVc,
) -> Result<RouterResultVc> {
    let ExecutionContext {
        project_path,
        chunking_context,
        env,
    } = *execution_context.await?;

    let context = node_evaluate_asset_context(
        execution_context,
        Some(get_next_build_import_map()),
        Some(edge_transition_map(
            server_addr,
            project_path,
            chunking_context.output_root(),
            next_config,
            execution_context,
        )),
    );

    let configs = config_assets(context, project_path, next_config.page_extensions());
    let router_asset = route_executor(context, configs);

    // This invalidates the router when the next config changes
    let next_config_changed = next_config_changed(context, project_path);

    let request = serde_json::value::to_value(&*request.await?)?;
    let Some(dir) = to_sys_path(project_path).await? else {
        bail!("Next.js requires a disk path to check for valid routes");
    };
    let server_addr = server_addr.await?;
    let result = evaluate(
        router_asset,
        project_path,
        env,
        AssetIdentVc::from_path(project_path),
        context,
        chunking_context.with_layer("router"),
        None,
        vec![
            JsonValueVc::cell(request),
            JsonValueVc::cell(dir.to_string_lossy().into()),
            JsonValueVc::cell(serde_json::to_value(ServerInfo::try_from(&*server_addr)?)?),
        ],
        CompletionsVc::all(vec![next_config_changed, routes_changed]),
        should_debug("router"),
    )
    .await?;

    let mut read = result.read();

    let first = match read.next().await {
        Some(Ok(first)) => first,
        Some(Err(e)) => {
            return Ok(RouterResult::Error(SharedError::new(
                anyhow!(e)
                    .context("router evaluation failed: received error from javascript stream"),
            ))
            .cell())
        }
        None => {
            return Ok(RouterResult::Error(shared_anyhow!(
                "router evaluation failed: no message received from javascript stream"
            ))
            .cell())
        }
    };
    let first = first.to_str()?;
    let first: RouterIncomingMessage = parse_json_with_source_context(first)
        .with_context(|| format!("parsing incoming message ({})", first))?;

    let (res, read) = match first {
        RouterIncomingMessage::Rewrite { data } => (RouterResult::Rewrite(data), Some(read)),

        RouterIncomingMessage::MiddlewareHeaders { data } => {
            // The double encoding here is annoying. It'd be a lot nicer if we could embed
            // a buffer directly into the IPC message without having to wrap it in an
            // object.
            let body = read.map(|data| {
                let chunk: RouterIncomingMessage = data?
                    .to_str()
                    .context("error decoding string")
                    .and_then(parse_json_with_source_context)?;
                match chunk {
                    RouterIncomingMessage::MiddlewareBody { data } => Ok(Bytes::from(data)),
                    m => Err(shared_anyhow!("unexpected message type: {:#?}", m)),
                }
            });
            let middleware = MiddlewareResponse {
                status_code: data.status_code,
                headers: data.headers,
                body: Stream::from(body),
            };

            (RouterResult::Middleware(middleware), None)
        }

        RouterIncomingMessage::None => (RouterResult::None, Some(read)),

        RouterIncomingMessage::Error { error } => (
            RouterResult::Error(shared_anyhow!(
                trace_stack(
                    error,
                    router_asset,
                    chunking_context.output_root(),
                    project_path
                )
                .await?
            )),
            Some(read),
        ),

        RouterIncomingMessage::MiddlewareBody { .. } => (
            RouterResult::Error(shared_anyhow!(
                "unexpected incoming middleware body without middleware headers"
            )),
            Some(read),
        ),
    };

    // Middleware will naturally drain the full stream, but the rest only take a
    // single item. In order to free the NodeJsOperation, we must pull another
    // value out of the stream.
    if let Some(mut read) = read {
        if let Some(v) = read.next().await {
            bail!("unexpected message type: {:#?}", v);
        }
    }

    Ok(res.cell())
}
