use anyhow::{bail, Context, Result};
use mime::TEXT_HTML_UTF_8;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ChunkingContextVc,
};
use turbopack_dev_server::html::DevHtmlAssetVc;
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

use super::{
    issue::RenderingIssue, RenderDataVc, RenderResult, RenderStaticIncomingMessage,
    RenderStaticOutgoingMessage,
};
use crate::{get_intermediate_asset, get_renderer_pool, pool::NodeJsOperation, trace_stack};

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
pub async fn render_static(
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    data: RenderDataVc,
) -> Result<AssetContentVc> {
    let intermediate_asset = get_intermediate_asset(
        module.as_evaluated_chunk(chunking_context, Some(runtime_entries)),
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
