use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::Write,
    path::PathBuf,
};

use anyhow::{anyhow, bail, Result};
use futures::{stream::FuturesUnordered, TryStreamExt};
use indexmap::{IndexMap, IndexSet};
use mime::TEXT_HTML_UTF_8;
pub use node_api_source::create_node_api_source;
pub use node_entry::{NodeEntry, NodeEntryVc};
pub use node_rendered_source::create_node_rendered_source;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use turbo_tasks::{primitives::StringVc, CompletionVc, CompletionsVc, TryJoinIterExt};
use turbo_tasks_fs::{DiskFileSystemVc, File, FileContent, FileSystemPathVc};
use turbopack::ecmascript::EcmascriptModuleAssetVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsSetVc},
    chunk::{ChunkGroupVc, ChunkingContextVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{query::Query, BodyVc, HeaderValue, ProxyResult, ProxyResultVc},
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use self::{
    bootstrap::NodeJsBootstrapAsset,
    issue::RenderingIssue,
    pool::{NodeJsPool, NodeJsPoolVc},
};
use crate::nodejs::pool::OperationEvent;

pub(crate) mod bootstrap;
pub(crate) mod issue;
pub(crate) mod node_api_source;
pub(crate) mod node_entry;
pub(crate) mod node_rendered_source;
pub(crate) mod pool;

#[turbo_tasks::function]
async fn emit(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CompletionVc> {
    Ok(CompletionsVc::cell(
        internal_assets(intermediate_asset, intermediate_output_path)
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

    let output = intermediate_output_path.await?;
    if let Some(disk) = DiskFileSystemVc::resolve_from(output.fs).await? {
        let dir = PathBuf::from(&disk.await?.root).join(&output.path);
        let entrypoint = dir.join("index.js");
        let pool = NodeJsPool::new(dir, entrypoint, HashMap::new(), 4);
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
pub(super) struct RenderData {
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
    let renderer_pool = get_renderer_pool(
        get_intermediate_asset(
            module,
            runtime_entries,
            chunking_context,
            intermediate_output_path,
        ),
        intermediate_output_path,
    );
    // Read this strongly consistent, since we don't want to run inconsistent
    // node.js code.
    let pool = renderer_pool.strongly_consistent().await?;
    let mut operation = pool.operation().await?;
    let data = data.await?;

    // First, write the render data to the process as a JSON string.
    let data = serde_json::to_string(&*data)?;
    operation.write_all(data.as_bytes())?;
    operation.write_all(&[b'\n'])?;

    let mut buffer = Vec::new();

    // Read the result headers as a UTF8 string.
    let (_, event) = operation.read_event(&mut buffer)?;
    let result = match event {
        OperationEvent::Success => String::from_utf8(buffer)?,
        event => {
            bail!(
                "unexpected event from Node.js rendering process: {:?}",
                event
            );
        }
    };

    // Parse the result.
    let lines: Vec<_> = result.lines().collect();
    let issue = if let Some(last_line) = lines.last() {
        if let Some(data) = last_line.strip_prefix("RESULT=") {
            let result: serde_json::Result<RenderResult> = serde_json::from_str(data);
            match result {
                Ok(RenderResult::Simple(body)) => {
                    return Ok(FileContent::Content(
                        File::from(body).with_content_type(TEXT_HTML_UTF_8),
                    )
                    .into());
                }
                Ok(RenderResult::Advanced { body, content_type }) => {
                    return Ok(FileContent::Content(File::from(body).with_content_type(
                        content_type.map_or(Ok(TEXT_HTML_UTF_8), |c| c.parse())?,
                    ))
                    .into());
                }
                Err(err) => RenderingIssue {
                    context: path,
                    message: StringVc::cell(format!(
                        "Unexpected result provided by Node.js rendering process: {err}"
                    )),
                    logs: StringVc::cell(lines.join("\n")),
                },
            }
        } else if let Some(data) = last_line.strip_prefix("ERROR=") {
            let data: JsonValue = serde_json::from_str(data)?;
            if let Some(s) = data.as_str() {
                RenderingIssue {
                    context: path,
                    message: StringVc::cell(s.to_string()),
                    logs: StringVc::cell(lines[..lines.len() - 1].join("\n")),
                }
            } else {
                RenderingIssue {
                    context: path,
                    message: StringVc::cell(data.to_string()),
                    logs: StringVc::cell(lines[..lines.len() - 1].join("\n")),
                }
            }
        } else {
            RenderingIssue {
                context: path,
                message: StringVc::cell("No result provided by Node.js process".to_string()),
                logs: StringVc::cell(lines.join("\n")),
            }
        }
    } else {
        RenderingIssue {
            context: path,
            message: StringVc::cell("No content received from Node.js process.".to_string()),
            logs: StringVc::cell("".to_string()),
        }
    };

    // Emit an issue for error reporting
    issue.cell().as_issue().emit();

    let body = format!(
        "<script id=\"__NEXT_DATA__\" type=\"application/json\">{{ \"props\": {{}} }}</script>
    <div id=\"__next\">
        <h1>Error rendering page</h1>
        <h2>Message</h2>
        <pre>{}</pre>
        <h2>Logs</h2>
        <pre>{}</pre>
    </div>",
        issue.message.await?,
        issue.logs.await?,
    );

    let html = fallback_page.with_body(body);

    Ok(html.content())
}

#[turbo_tasks::value(shared)]
pub(super) struct ResponseHeaders {
    status: u16,
    headers: Vec<String>,
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
    let renderer_pool = get_renderer_pool(
        get_intermediate_asset(
            module,
            runtime_entries,
            chunking_context,
            intermediate_output_path,
        ),
        intermediate_output_path,
    );
    let pool = renderer_pool.await?;
    let mut operation = pool.operation().await?;
    let data = data.await?;

    // First, write the render data to the process as a JSON string.
    let data = serde_json::to_string(&*data)?;
    operation.write_all(data.as_bytes())?;
    operation.write_step()?;

    // Then, write the binary body.
    for chunk in body.await?.chunks() {
        operation.write_all(chunk.as_bytes())?;
    }
    operation.write_step()?;

    let mut buffer = Vec::new();

    // Read the response headers as a JSON string.
    let (_, event) = operation.read_event(&mut buffer)?;
    let headers: ResponseHeaders = match event {
        OperationEvent::Step => serde_json::from_slice(&buffer)?,
        OperationEvent::Error => return proxy_error(path, buffer),
        event => {
            bail!(
                "unexpected event from Node.js rendering process: {:?}",
                event
            );
        }
    };

    // Reuse the buffer.
    buffer.truncate(0);

    // Read the response body as a binary blob.
    let (_, event) = operation.read_event(&mut buffer)?;
    let body = match event {
        OperationEvent::Success => buffer,
        OperationEvent::Error => return proxy_error(path, buffer),
        event => {
            bail!(
                "unexpected event from Node.js rendering process: {:?}",
                event
            );
        }
    };

    Ok(ProxyResult {
        status: headers.status,
        headers: headers.headers,
        body,
    }
    .cell())
}

fn proxy_error(path: FileSystemPathVc, buffer: Vec<u8>) -> Result<ProxyResultVc> {
    let error_message = String::from_utf8(buffer.clone())?;

    RenderingIssue {
        context: path,
        message: StringVc::cell(error_message),
        logs: StringVc::cell("".to_string()),
    }
    .cell()
    .as_issue()
    .emit();

    return Ok(ProxyResult {
        status: 500,
        headers: vec![
            "content-type".to_string(),
            "text/html; charset=utf-8".to_string(),
        ],
        body: buffer,
    }
    .cell());
}
