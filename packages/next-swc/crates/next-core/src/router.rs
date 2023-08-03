use anyhow::{anyhow, bail, Context, Result};
use futures::StreamExt;
use indexmap::indexmap;
use serde::Deserialize;
use serde_json::json;
use turbo_tasks::{util::SharedError, Completion, Completions, Value, Vc};
use turbo_tasks_fs::json::parse_json_with_source_context;
use turbopack_binding::{
    turbo::{
        tasks_bytes::{Bytes, Stream},
        tasks_fs::{to_sys_path, File, FileSystemPath},
    },
    turbopack::{
        core::{
            asset::AssetContent,
            changed::any_content_changed_of_module,
            chunk::ChunkingContext,
            context::AssetContext,
            environment::{ServerAddr, ServerInfo},
            file_source::FileSource,
            ident::AssetIdent,
            issue::IssueContextExt,
            module::Module,
            reference_type::{EcmaScriptModulesReferenceSubType, InnerAssets, ReferenceType},
            resolve::{find_context_file, FindContextFileResult},
            virtual_source::VirtualSource,
        },
        dev::DevChunkingContext,
        node::{
            debug::should_debug,
            evaluate::{evaluate, get_evaluate_pool},
            execution_context::ExecutionContext,
            source_map::{trace_stack_with_source_mapping_assets, StructuredError},
        },
        turbopack::{evaluate_context::node_evaluate_asset_context, transition::TransitionsByName},
    },
};

use crate::{
    embed_js::next_asset,
    mode::NextMode,
    next_config::NextConfig,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        route_transition::NextEdgeRouteTransition,
    },
    next_import_map::get_next_build_import_map,
    next_server::context::{get_server_module_options_context, ServerContextType},
    util::parse_config_from_source,
};

#[turbo_tasks::function]
fn next_configs() -> Vc<Vec<String>> {
    Vc::cell(
        ["next.config.mjs", "next.config.js"]
            .into_iter()
            .map(ToOwned::to_owned)
            .collect(),
    )
}

#[turbo_tasks::function]
async fn middleware_files(page_extensions: Vc<Vec<String>>) -> Result<Vc<Vec<String>>> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
        })
        .collect();
    Ok(Vc::cell(files))
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
async fn next_config_changed(
    context: Vc<Box<dyn AssetContext>>,
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let find_config_result = find_context_file(project_path, next_configs());
    Ok(match *find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => {
            let module = context.process(
                Vc::upcast(FileSource::new(config_path)),
                Value::new(ReferenceType::Internal(InnerAssets::empty())),
            );
            any_content_changed_of_module(module)
        }
        FindContextFileResult::NotFound(_) => Completion::immutable(),
    })
}

#[turbo_tasks::function]
async fn config_assets(
    context: Vc<Box<dyn AssetContext>>,
    project_path: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<String>>,
) -> Result<Vc<InnerAssets>> {
    let find_config_result = find_context_file(project_path, middleware_files(page_extensions));

    // The router.ts file expects a manifest of chunks for the middleware. If there
    // is no middleware file, then we need to generate a default empty manifest
    // and we cannot process it with the next-edge transition because it
    // requires a real file for some reason.
    let (manifest, config) = match *find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => {
            let config = context.process(
                Vc::upcast(FileSource::new(config_path)),
                Value::new(ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Undefined,
                )),
            );
            let config = parse_config_from_source(config);
            let manifest = context.with_transition("next-edge".to_string()).process(
                Vc::upcast(FileSource::new(config_path)),
                Value::new(ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Undefined,
                )),
            );
            (manifest, config)
        }
        FindContextFileResult::NotFound(_) => {
            let manifest = context.process(
                Vc::upcast(VirtualSource::new(
                    project_path.join("middleware.js".to_string()),
                    AssetContent::file(File::from("export default [];").into()),
                )),
                Value::new(ReferenceType::Internal(InnerAssets::empty())),
            );
            let config = Default::default();
            (manifest, config)
        }
    };

    let config_asset = context.process(
        Vc::upcast(VirtualSource::new(
            project_path.join("middleware_config.js".to_string()),
            AssetContent::file(
                File::from(format!(
                    "export default {};",
                    json!({ "matcher": &config.await?.matcher })
                ))
                .into(),
            ),
        )),
        Value::new(ReferenceType::Internal(InnerAssets::empty())),
    );

    Ok(Vc::cell(indexmap! {
        "MIDDLEWARE_CHUNK_GROUP".to_string() => manifest,
        "MIDDLEWARE_CONFIG".to_string() => config_asset,
    }))
}

#[turbo_tasks::function]
fn route_executor(
    context: Vc<Box<dyn AssetContext>>,
    configs: Vc<InnerAssets>,
) -> Vc<Box<dyn Module>> {
    context.process(
        next_asset("entry/router.ts".to_string()),
        Value::new(ReferenceType::Internal(configs)),
    )
}

#[turbo_tasks::function]
fn edge_transition_map(
    server_addr: Vc<ServerAddr>,
    project_path: Vc<FileSystemPath>,
    output_path: Vc<FileSystemPath>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Vc<TransitionsByName> {
    let mode = NextMode::DevServer;

    let edge_compile_time_info = get_edge_compile_time_info(project_path, server_addr);

    let edge_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            output_path.join("edge".to_string()),
            output_path.join("edge/chunks".to_string()),
            output_path.join("edge/assets".to_string()),
            edge_compile_time_info.environment(),
        )
        .reference_chunk_source_maps(should_debug("router"))
        .build(),
    );

    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        Value::new(ServerContextType::Middleware),
        mode,
        next_config,
        execution_context,
    );

    let server_module_options_context = get_server_module_options_context(
        project_path,
        execution_context,
        Value::new(ServerContextType::Middleware),
        mode,
        next_config,
    );

    let next_edge_transition = Vc::upcast(
        NextEdgeRouteTransition {
            edge_compile_time_info,
            edge_chunking_context,
            edge_module_options_context: Some(server_module_options_context),
            edge_resolve_options_context,
            output_path: output_path.root(),
            base_path: project_path,
            bootstrap_asset: next_asset("entry/edge-bootstrap.ts".to_string()),
            entry_name: "middleware".to_string(),
        }
        .cell(),
    );

    Vc::cell(
        [("next-edge".to_string(), next_edge_transition)]
            .into_iter()
            .collect(),
    )
}

#[turbo_tasks::function]
pub async fn route(
    execution_context: Vc<ExecutionContext>,
    request: Vc<RouterRequest>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    routes_changed: Vc<Completion>,
) -> Result<Vc<RouterResult>> {
    let RouterRequest {
        ref method,
        ref pathname,
        ..
    } = *request.await?;
    route_internal(
        execution_context,
        request,
        next_config,
        server_addr,
        routes_changed,
    )
    .attach_description(format!("Next.js Routing for {} {}", method, pathname))
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
    execution_context: Vc<ExecutionContext>,
    request: Vc<RouterRequest>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    routes_changed: Vc<Completion>,
) -> Result<Vc<RouterResult>> {
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
    let chunking_context = chunking_context.with_layer("router".to_string());
    let server_addr = server_addr.await?;
    let invalidation = Completions::all(vec![next_config_changed, routes_changed]);
    let debug = should_debug("router");
    let result = evaluate(
        router_asset,
        project_path,
        env,
        AssetIdent::from_path(project_path),
        context,
        chunking_context.with_layer("router".to_string()),
        None,
        vec![
            Vc::cell(request),
            Vc::cell(dir.to_string_lossy().into()),
            Vc::cell(serde_json::to_value(ServerInfo::try_from(&*server_addr)?)?),
        ],
        invalidation,
        debug,
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

        RouterIncomingMessage::Error { error } => {
            // Must be the same pool as above
            let pool = get_evaluate_pool(
                router_asset,
                project_path,
                env,
                context,
                chunking_context,
                None,
                invalidation,
                debug,
            )
            .await?;
            (
                RouterResult::Error(shared_anyhow!(
                    trace_stack_with_source_mapping_assets(
                        error,
                        pool.assets_for_source_mapping,
                        chunking_context.output_root(),
                        project_path
                    )
                    .await?
                )),
                Some(read),
            )
        }

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
