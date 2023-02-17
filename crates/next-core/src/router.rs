use std::collections::HashMap;

use anyhow::{bail, Result};
use serde::Deserialize;
use turbo_tasks::{
    primitives::{JsonValueVc, StringsVc},
    Value,
};
use turbo_tasks_fs::{
    json::parse_json_rope_with_source_context, to_sys_path, File, FileSystemPathVc,
};
use turbopack::{evaluate_context::node_evaluate_asset_context, transition::TransitionsByNameVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::dev::DevChunkingContextVc,
    context::{AssetContext, AssetContextVc},
    environment::{EnvironmentIntention::Middleware, ServerAddrVc},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{find_context_file, FindContextFileResult},
    source_asset::SourceAssetVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransform, EcmascriptInputTransformsVc,
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
    OptionEcmascriptModuleAssetVc,
};
use turbopack_node::{
    evaluate::{evaluate, JavaScriptValue},
    execution_context::{ExecutionContext, ExecutionContextVc},
    StructuredError,
};

use crate::{
    embed_js::{next_asset, wrap_with_next_js_fs},
    next_config::NextConfigVc,
    next_edge::{
        context::{get_edge_compile_time_info, get_edge_resolve_options_context},
        transition::NextEdgeTransition,
    },
    next_import_map::get_next_build_import_map,
    next_server::context::ServerContextType,
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
        .flat_map(|f| extensions.iter().map(move |ext| String::from(f) + ext))
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
pub struct MiddlewareBodyResponse(pub Vec<u8>);

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct FullMiddlewareResponse {
    pub headers: MiddlewareHeadersResponse,
    pub body: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum RouterIncomingMessage {
    Rewrite {
        data: RewriteResponse,
    },
    // TODO: Implement
    #[allow(dead_code)]
    MiddlewareHeaders {
        data: MiddlewareHeadersResponse,
    },
    // TODO: Implement
    #[allow(dead_code)]
    MiddlewareBody {
        data: MiddlewareBodyResponse,
    },
    FullMiddleware {
        data: FullMiddlewareResponse,
    },
    None,
    Error(StructuredError),
}

#[derive(Debug)]
#[turbo_tasks::value]
pub enum RouterResult {
    Rewrite(RewriteResponse),
    FullMiddleware(FullMiddlewareResponse),
    None,
    Error,
}

impl From<RouterIncomingMessage> for RouterResult {
    fn from(value: RouterIncomingMessage) -> Self {
        match value {
            RouterIncomingMessage::Rewrite { data } => Self::Rewrite(data),
            RouterIncomingMessage::FullMiddleware { data } => Self::FullMiddleware(data),
            RouterIncomingMessage::None => Self::None,
            _ => Self::Error,
        }
    }
}

#[turbo_tasks::function]
async fn get_config(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    configs: StringsVc,
) -> Result<OptionEcmascriptModuleAssetVc> {
    let find_config_result = find_context_file(project_path, configs);
    let config_asset = match &*find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => Some(as_es_module_asset(
            SourceAssetVc::new(*config_path).as_asset(),
            context,
        )),
        FindContextFileResult::NotFound(_) => None,
    };
    Ok(OptionEcmascriptModuleAssetVc::cell(config_asset))
}

fn as_es_module_asset(asset: AssetVc, context: AssetContextVc) -> EcmascriptModuleAssetVc {
    EcmascriptModuleAssetVc::new(
        asset,
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
        context.compile_time_info(),
    )
}

#[turbo_tasks::function]
async fn watch_files_hack(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
) -> Result<EcmascriptChunkPlaceablesVc> {
    let next_config = get_config(context, project_path, next_configs()).await?;
    Ok(match &*next_config {
        Some(c) => EcmascriptChunkPlaceablesVc::cell(vec![c.as_ecmascript_chunk_placeable()]),
        None => EcmascriptChunkPlaceablesVc::empty(),
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
    let middleware_manifest = match &*middleware_config {
        Some(c) => context.with_transition("next-edge").process(
            c.as_asset(),
            Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            )),
        ),
        None => as_es_module_asset(
            VirtualAssetVc::new(
                project_path.join("middleware.js"),
                File::from("export default [];").into(),
            )
            .as_asset(),
            context,
        )
        .as_asset(),
    };

    let mut inner = HashMap::new();
    inner.insert("MIDDLEWARE_CHUNK_GROUP".to_string(), middleware_manifest);
    Ok(InnerAssetsVc::cell(inner))
}

#[turbo_tasks::function]
fn route_executor(
    context: AssetContextVc,
    project_path: FileSystemPathVc,
    configs: InnerAssetsVc,
) -> AssetVc {
    EcmascriptModuleAssetVc::new_with_inner_assets(
        next_asset(project_path.join("router.js"), "entry/router.ts"),
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
        context.compile_time_info(),
        configs,
    )
    .into()
}

#[turbo_tasks::function]
fn edge_transition_map(
    server_addr: ServerAddrVc,
    project_path: FileSystemPathVc,
    output_path: FileSystemPathVc,
    next_config: NextConfigVc,
) -> TransitionsByNameVc {
    let edge_compile_time_info = get_edge_compile_time_info(server_addr, Value::new(Middleware));

    let edge_chunking_context = DevChunkingContextVc::builder(
        project_path,
        output_path.join("edge"),
        output_path.join("edge/chunks"),
        output_path.join("edge/assets"),
        edge_compile_time_info.environment(),
    )
    .build();

    let edge_resolve_options_context = get_edge_resolve_options_context(
        project_path,
        Value::new(ServerContextType::Middleware),
        next_config,
    );

    let next_edge_transition = NextEdgeTransition {
        edge_compile_time_info,
        edge_chunking_context,
        edge_resolve_options_context,
        output_path,
        base_path: project_path,
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
) -> Result<RouterResultVc> {
    let ExecutionContext {
        project_root,
        intermediate_output_path,
    } = *execution_context.await?;
    let project_path = wrap_with_next_js_fs(project_root);
    let intermediate_output_path = intermediate_output_path.join("router");

    let context = node_evaluate_asset_context(
        Some(get_next_build_import_map(project_path)),
        Some(edge_transition_map(
            server_addr,
            project_path,
            intermediate_output_path,
            next_config,
        )),
    );

    let configs = config_assets(context, project_path, next_config.page_extensions());
    let router_asset = route_executor(context, project_path, configs);

    // TODO this is a hack to get these files watched.
    let next_config = watch_files_hack(context, project_path);

    let request = serde_json::value::to_value(&*request.await?)?;
    let Some(dir) = to_sys_path(project_root).await? else {
        bail!("Next.js requires a disk path to check for valid routes");
    };
    let result = evaluate(
        project_path,
        router_asset,
        project_root,
        project_root,
        context,
        intermediate_output_path,
        Some(next_config),
        vec![
            JsonValueVc::cell(request),
            JsonValueVc::cell(dir.to_string_lossy().into()),
        ],
        false,
    )
    .await?;

    match &*result {
        JavaScriptValue::Value(val) => {
            let result: RouterIncomingMessage = parse_json_rope_with_source_context(val)?;
            Ok(RouterResult::from(result).cell())
        }
        JavaScriptValue::Error => Ok(RouterResult::Error.cell()),
        JavaScriptValue::Stream(_) => {
            unimplemented!("Stream not supported now");
        }
    }
}
