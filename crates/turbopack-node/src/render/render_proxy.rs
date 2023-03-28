use anyhow::{bail, Result};
use futures::StreamExt;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{asset::AssetVc, chunk::ChunkingContextVc, error::PrettyPrintError};
use turbopack_dev_server::source::{BodyVc, ProxyResult, ProxyResultVc};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

use super::{
    issue::RenderingIssue, RenderDataVc, RenderProxyIncomingMessage, RenderProxyOutgoingMessage,
    ResponseHeaders,
};
use crate::{
    get_intermediate_asset, get_renderer_pool, pool::NodeJsOperation,
    render::error_page::error_html, source_map::trace_stack,
};

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
pub async fn render_proxy(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_dir: FileSystemPathVc,
    data: RenderDataVc,
    body: BodyVc,
) -> Result<ProxyResultVc> {
    let intermediate_asset = get_intermediate_asset(
        module.as_evaluated_chunk(chunking_context, Some(runtime_entries)),
        intermediate_output_path,
    );

    let pool = get_renderer_pool(
        cwd,
        env,
        intermediate_asset,
        intermediate_output_path,
        output_root,
        project_dir,
        /* debug */ false,
    )
    .await?;

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
        project_dir,
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
    project_dir: FileSystemPathVc,
) -> Result<ProxyResult> {
    let data = data.await?;
    // First, send the render data.
    operation
        .send(RenderProxyOutgoingMessage::Headers { data: &data })
        .await?;

    let mut body = body.await?.read();
    // Then, send the binary body in chunks.
    while let Some(data) = body.next().await {
        operation
            .send(RenderProxyOutgoingMessage::BodyChunk { data: &data? })
            .await?;
    }

    operation.send(RenderProxyOutgoingMessage::BodyEnd).await?;

    let (status, headers) = match operation.recv().await? {
        RenderProxyIncomingMessage::Headers {
            data: ResponseHeaders { status, headers },
        } => (status, headers),
        RenderProxyIncomingMessage::Error(error) => {
            bail!(
                trace_stack(
                    error,
                    intermediate_asset,
                    intermediate_output_path,
                    project_dir
                )
                .await?
            )
        }
        _ => {
            bail!("unexpected response from the Node.js process while reading response headers")
        }
    };

    let body = match operation.recv().await? {
        RenderProxyIncomingMessage::Body { data: body } => body,
        RenderProxyIncomingMessage::Error(error) => {
            bail!(
                trace_stack(
                    error,
                    intermediate_asset,
                    intermediate_output_path,
                    project_dir
                )
                .await?
            )
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
    let message = format!("{}", PrettyPrintError(&error));

    let status = match operation {
        Some(operation) => Some(operation.wait_or_kill().await?),
        None => None,
    };

    let mut details = vec![];
    if let Some(status) = status {
        details.push(format!("status: {status}"));
    }

    let status_code = 500;
    let body = &*error_html(
        status_code,
        "An error occurred while proxying the request to Node.js".to_string(),
        format!("{message}\n\n{}", details.join("\n")),
    )
    .await?;

    RenderingIssue {
        context: path,
        message: StringVc::cell(message),
        status: status.and_then(|status| status.code()),
    }
    .cell()
    .as_issue()
    .emit();

    Ok(ProxyResult {
        status: status_code,
        headers: vec![(
            "content-type".to_string(),
            "text/html; charset=utf-8".to_string(),
        )],
        body: body.clone().into(),
    }
    .cell())
}
