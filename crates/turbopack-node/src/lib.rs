#![feature(async_closure)]
#![feature(min_specialization)]

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Write as _,
    path::PathBuf,
};

use anyhow::{anyhow, bail, Context, Result};
use futures::{stream::FuturesUnordered, TryStreamExt};
use indexmap::{IndexMap, IndexSet};
use mime::TEXT_HTML_UTF_8;
pub use node_api_source::create_node_api_source;
pub use node_entry::{NodeEntry, NodeEntryVc};
pub use node_rendered_source::create_node_rendered_source;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringVc, CompletionVc, CompletionsVc, TryJoinIterExt};
use turbo_tasks_fs::{to_sys_path, File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsSetVc},
    chunk::{ChunkGroupVc, ChunkingContextVc},
    source_map::GenerateSourceMapVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{query::Query, BodyVc, HeaderValue, ProxyResult, ProxyResultVc},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

use self::{
    bootstrap::NodeJsBootstrapAsset,
    issue::RenderingIssue,
    pool::{NodeJsOperation, NodeJsPool, NodeJsPoolVc},
};
use crate::source_map::{SourceMapTraceVc, StackFrame, TraceResult};

pub mod bootstrap;
pub mod issue;
pub mod node_api_source;
pub mod node_entry;
pub mod node_rendered_source;
pub mod path_regex;
pub mod pool;
pub mod source_map;

#[turbo_tasks::function]
async fn emit(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CompletionVc> {
    Ok(CompletionsVc::cell(
        internal_assets(intermediate_asset, intermediate_output_path)
            .strongly_consistent()
            .await?
            .iter()
            .map(|a| async {
                Ok(if *a.path().extension().await? != "map" {
                    Some(a.content().write(a.path()))
                } else {
                    None
                })
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect(),
    )
    .all())
}

/// List of the all assets of the "internal" subgraph and a list of boundary
/// assets that are not considered "internal" ("external")
#[derive(Debug)]
#[turbo_tasks::value]
struct SeparatedAssets {
    internal_assets: AssetsSetVc,
    external_asset_entrypoints: AssetsSetVc,
}

/// Extracts the subgraph of "internal" assets (assets within the passes
/// directory). Also lists all boundary assets that are not part of the
/// "internal" subgraph.
#[turbo_tasks::function]
async fn internal_assets(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsSetVc> {
    Ok(
        separate_assets(intermediate_asset, intermediate_output_path)
            .strongly_consistent()
            .await?
            .internal_assets,
    )
}

/// Returns a set of "external" assets on the boundary of the "internal"
/// subgraph
#[turbo_tasks::function]
async fn external_asset_entrypoints(
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetsSetVc> {
    Ok(separate_assets(
        get_intermediate_asset(
            module,
            runtime_entries,
            chunking_context,
            intermediate_output_path,
        )
        .resolve()
        .await?,
        intermediate_output_path,
    )
    .strongly_consistent()
    .await?
    .external_asset_entrypoints)
}

/// Splits the asset graph into "internal" assets and boundaries to "external"
/// assets.
#[turbo_tasks::function]
async fn separate_assets(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<SeparatedAssetsVc> {
    enum Type {
        Internal(AssetVc, Vec<AssetVc>),
        External(AssetVc),
    }
    let intermediate_output_path = intermediate_output_path.await?;
    let mut queue = FuturesUnordered::new();
    let process_asset = |asset: AssetVc| {
        let intermediate_output_path = &intermediate_output_path;
        async move {
            // Assets within the output directory are considered as "internal" and all
            // others as "external". We follow references on "internal" assets, but do not
            // look into references of "external" assets, since there are no "internal"
            // assets behind "externals"
            if asset.path().await?.is_inside(intermediate_output_path) {
                let mut assets = Vec::new();
                for reference in asset.references().await?.iter() {
                    for asset in reference.resolve_reference().primary_assets().await?.iter() {
                        assets.push(*asset);
                    }
                }
                Ok::<_, anyhow::Error>(Type::Internal(asset, assets))
            } else {
                Ok(Type::External(asset))
            }
        }
    };
    queue.push(process_asset(intermediate_asset));
    let mut processed = HashSet::new();
    let mut internal_assets = IndexSet::new();
    let mut external_asset_entrypoints = IndexSet::new();
    // TODO(sokra) This is not deterministic, since it's using FuturesUnordered.
    // This need to be fixed!
    while let Some(item) = queue.try_next().await? {
        match item {
            Type::Internal(asset, assets) => {
                internal_assets.insert(asset);
                for asset in assets {
                    if processed.insert(asset) {
                        queue.push(process_asset(asset));
                    }
                }
            }
            Type::External(asset) => {
                external_asset_entrypoints.insert(asset);
            }
        }
    }
    Ok(SeparatedAssets {
        internal_assets: AssetsSetVc::cell(internal_assets),
        external_asset_entrypoints: AssetsSetVc::cell(external_asset_entrypoints),
    }
    .cell())
}

/// Creates a node.js renderer pool for an entrypoint.
#[turbo_tasks::function]
async fn get_renderer_pool(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<NodeJsPoolVc> {
    // Emit a basic package.json that sets the type of the package to commonjs.
    // Currently code generated for Node is CommonJS, while authored code may be
    // ESM, for example.
    //
    // Note that this is placed at .next/server/package.json, while Next.js
    // currently creates this file at .next/package.json.
    emit(
        VirtualAssetVc::new(
            intermediate_output_path.join("package.json"),
            FileContent::Content(File::from("{\"type\": \"commonjs\"}")).into(),
        )
        .into(),
        intermediate_output_path,
    )
    .await?;

    emit(intermediate_asset, intermediate_output_path).await?;

    let cwd = intermediate_output_path.root();
    let entrypoint = intermediate_output_path.join("index.js");

    if let (Some(cwd), Some(entrypoint)) = (to_sys_path(cwd).await?, to_sys_path(entrypoint).await?)
    {
        let pool = NodeJsPool::new(cwd, entrypoint, HashMap::new(), 4);
        Ok(pool.cell())
    } else {
        Err(anyhow!("can only render from a disk filesystem"))
    }
}

/// Converts a module graph into node.js executable assets
#[turbo_tasks::function]
pub async fn get_intermediate_asset(
    entry_module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetVc> {
    let chunk = entry_module.as_evaluated_chunk(chunking_context, Some(runtime_entries));
    let chunk_group = ChunkGroupVc::from_chunk(chunk);
    Ok(NodeJsBootstrapAsset {
        path: intermediate_output_path.join("index.js"),
        chunk_group,
    }
    .cell()
    .into())
}

#[turbo_tasks::value(shared)]
pub struct RenderData {
    params: IndexMap<String, String>,
    method: String,
    url: String,
    query: Query,
    headers: BTreeMap<String, HeaderValue>,
    path: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum RenderResult {
    Simple(String),
    Advanced {
        body: String,
        #[serde(rename = "contentType")]
        content_type: Option<String>,
    },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderStaticOutgoingMessage<'a> {
    Headers { data: &'a RenderData },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderStaticIncomingMessage {
    Result { result: RenderResult },
    Error(StructuredError),
}

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
async fn render_static(
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    data: RenderDataVc,
) -> Result<AssetContentVc> {
    let intermediate_asset = get_intermediate_asset(
        module,
        runtime_entries,
        chunking_context,
        intermediate_output_path,
    );
    let renderer_pool = get_renderer_pool(intermediate_asset, intermediate_output_path);
    // Read this strongly consistent, since we don't want to run inconsistent
    // node.js code.
    let pool = renderer_pool.strongly_consistent().await?;
    let mut operation = match pool.operation().await {
        Ok(operation) => operation,
        Err(err) => return static_error(path, err, None, fallback_page).await,
    };

    match run_static_operation(
        &mut operation,
        data,
        intermediate_asset,
        intermediate_output_path,
    )
    .await
    {
        Ok(asset) => Ok(asset),
        Err(err) => static_error(path, err, Some(operation), fallback_page).await,
    }
}

async fn run_static_operation(
    operation: &mut NodeJsOperation,
    data: RenderDataVc,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetContentVc> {
    let data = data.await?;

    operation
        .send(RenderStaticOutgoingMessage::Headers { data: &data })
        .await
        .context("sending headers to node.js process")?;
    match operation
        .recv()
        .await
        .context("receiving from node.js process")?
    {
        RenderStaticIncomingMessage::Result {
            result: RenderResult::Simple(body),
        } => Ok(FileContent::Content(File::from(body).with_content_type(TEXT_HTML_UTF_8)).into()),
        RenderStaticIncomingMessage::Result {
            result: RenderResult::Advanced { body, content_type },
        } => Ok(FileContent::Content(
            File::from(body)
                .with_content_type(content_type.map_or(Ok(TEXT_HTML_UTF_8), |c| c.parse())?),
        )
        .into()),
        RenderStaticIncomingMessage::Error(error) => {
            bail!(trace_stack(error, intermediate_asset, intermediate_output_path).await?)
        }
    }
}

async fn static_error(
    path: FileSystemPathVc,
    error: anyhow::Error,
    operation: Option<NodeJsOperation>,
    fallback_page: DevHtmlAssetVc,
) -> Result<AssetContentVc> {
    let message = format!("{error:?}");
    let status = match operation {
        Some(operation) => Some(operation.wait_or_kill().await?),
        None => None,
    };

    let html_status = match status {
        Some(status) => format!("<h2>Exit status</h2><pre>{status}</pre>"),
        None => "<h3>No exit status</pre>".to_owned(),
    };

    let body = format!(
        "<script id=\"__NEXT_DATA__\" type=\"application/json\">{{ \"props\": {{}} }}</script>
    <div id=\"__next\">
        <h1>Error rendering page</h1>
        <h2>Message</h2>
        <pre>{message}</pre>
        {html_status}
    </div>",
    );

    let issue = RenderingIssue {
        context: path,
        message: StringVc::cell(format!("{error:?}")),
        status: status.and_then(|status| status.code()),
    };

    issue.cell().as_issue().emit();

    let html = fallback_page.with_body(body);

    Ok(html.content())
}

async fn trace_stack(
    error: StructuredError,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<String> {
    let root = match to_sys_path(intermediate_output_path.root()).await? {
        Some(r) => r.to_string_lossy().to_string(),
        None => bail!("couldn't extract disk fs from path"),
    };

    let assets = internal_assets(intermediate_asset, intermediate_output_path.root())
        .await?
        .iter()
        .map(|a| async {
            let gen = match GenerateSourceMapVc::resolve_from(*a).await? {
                Some(gen) => gen,
                None => return Ok(None),
            };

            let path = match to_sys_path(a.path()).await? {
                Some(p) => p,
                None => PathBuf::from(&a.path().await?.path),
            };

            let p = path.strip_prefix(&root).unwrap();
            Ok(Some((
                p.to_str().unwrap().to_string(),
                gen.generate_source_map(),
            )))
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<HashMap<_, _>>();

    let mut message = String::new();

    macro_rules! write_frame {
        ($f:ident, $path:expr) => {
            match $f.get_pos() {
                Some((l, c)) => match &$f.name {
                    Some(n) => writeln!(message, "  at {} ({}:{}:{})", n, $path, l, c),
                    None => writeln!(message, "  at {}:{}:{}", $path, l, c),
                },
                None => writeln!(message, "  at {}", $path),
            }
        };
    }

    writeln!(message, "{}: {}", error.name, error.message)?;

    for frame in &error.stack {
        if let Some((line, column)) = frame.get_pos() {
            if let Some(path) = frame.file.strip_prefix(&root) {
                if let Some(map) = assets.get(path) {
                    let trace = SourceMapTraceVc::new(*map, line, column, frame.name.clone())
                        .trace()
                        .await?;
                    if let TraceResult::Found(f) = &*trace {
                        write_frame!(f, f.file)?;
                        continue;
                    }
                }

                write_frame!(frame, path)?;
                continue;
            }
        }

        write_frame!(frame, frame.file)?;
    }

    Ok(message)
}

#[turbo_tasks::value(shared)]
pub struct ResponseHeaders {
    status: u16,
    headers: Vec<String>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderProxyOutgoingMessage<'a> {
    Headers { data: &'a RenderData },
    BodyChunk { data: &'a [u8] },
    BodyEnd,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RenderProxyIncomingMessage {
    Headers { data: ResponseHeaders },
    Body { data: Vec<u8> },
    Error(StructuredError),
}

#[turbo_tasks::value(shared)]
struct StructuredError {
    name: String,
    message: String,
    stack: Vec<StackFrame>,
}

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
async fn render_proxy(
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    data: RenderDataVc,
    body: BodyVc,
) -> Result<ProxyResultVc> {
    let intermediate_asset = get_intermediate_asset(
        module,
        runtime_entries,
        chunking_context,
        intermediate_output_path,
    );
    let renderer_pool = get_renderer_pool(intermediate_asset, intermediate_output_path);
    let pool = renderer_pool.await?;
    let mut operation = match pool.operation().await {
        Ok(operation) => operation,
        Err(err) => {
            return proxy_error(path, err, None).await;
        }
    };

    match run_proxy_operation(
        &mut operation,
        data,
        body,
        intermediate_asset,
        intermediate_output_path,
    )
    .await
    {
        Ok(proxy_result) => Ok(proxy_result.cell()),
        Err(err) => Ok(proxy_error(path, err, Some(operation)).await?),
    }
}

async fn run_proxy_operation(
    operation: &mut NodeJsOperation,
    data: RenderDataVc,
    body: BodyVc,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<ProxyResult> {
    let data = data.await?;
    // First, send the render data.
    operation
        .send(RenderProxyOutgoingMessage::Headers { data: &data })
        .await?;

    let body = body.await?;
    // Then, send the binary body in chunks.
    for chunk in body.chunks() {
        operation
            .send(RenderProxyOutgoingMessage::BodyChunk {
                data: chunk.as_bytes(),
            })
            .await?;
    }

    operation.send(RenderProxyOutgoingMessage::BodyEnd).await?;

    let (status, headers) = match operation.recv().await? {
        RenderProxyIncomingMessage::Headers {
            data: ResponseHeaders { status, headers },
        } => (status, headers),
        RenderProxyIncomingMessage::Error(error) => {
            bail!(trace_stack(error, intermediate_asset, intermediate_output_path).await?)
        }
        _ => {
            bail!("unexpected response from the Node.js process while reading response headers")
        }
    };

    let body = match operation.recv().await? {
        RenderProxyIncomingMessage::Body { data: body } => body,
        RenderProxyIncomingMessage::Error(error) => {
            bail!(trace_stack(error, intermediate_asset, intermediate_output_path).await?)
        }
        _ => {
            bail!("unexpected response from the Node.js process while reading response body")
        }
    };

    Ok(ProxyResult {
        status,
        headers,
        body: body.into(),
    })
}

async fn proxy_error(
    path: FileSystemPathVc,
    error: anyhow::Error,
    operation: Option<NodeJsOperation>,
) -> Result<ProxyResultVc> {
    let message = format!("{error:?}");

    let status = match operation {
        Some(operation) => Some(operation.wait_or_kill().await?),
        None => None,
    };

    let mut details = vec![];
    if let Some(status) = status {
        details.push(format!("status: {status}"));
    }

    let body = format!(
        "An error occurred while proxying a request to Node.js:\n{message}\n{}",
        details.join("\n")
    );

    RenderingIssue {
        context: path,
        message: StringVc::cell(message),
        status: status.and_then(|status| status.code()),
    }
    .cell()
    .as_issue()
    .emit();

    Ok(ProxyResult {
        status: 500,
        headers: vec![
            "content-type".to_string(),
            "text/html; charset=utf-8".to_string(),
        ],
        body: body.into(),
    }
    .cell())
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
