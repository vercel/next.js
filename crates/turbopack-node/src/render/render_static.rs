use std::str::FromStr;

use anyhow::{bail, Context, Result};
use mime::Mime;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ChunkingContextVc,
};
use turbopack_dev_server::{html::DevHtmlAssetVc, source::RewriteVc};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

use super::{
    issue::RenderingIssue, RenderDataVc, RenderStaticIncomingMessage, RenderStaticOutgoingMessage,
};
use crate::{get_intermediate_asset, get_renderer_pool, pool::NodeJsOperation, trace_stack};

#[turbo_tasks::value]
pub enum StaticResult {
    Content(AssetContentVc),
    Rewrite(RewriteVc),
}

#[turbo_tasks::value_impl]
impl StaticResultVc {
    #[turbo_tasks::function]
    pub fn content(content: AssetContentVc) -> Self {
        StaticResult::Content(content).cell()
    }

    #[turbo_tasks::function]
    pub fn rewrite(rewrite: RewriteVc) -> Self {
        StaticResult::Rewrite(rewrite).cell()
    }
}

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
pub async fn render_static(
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    data: RenderDataVc,
) -> Result<StaticResultVc> {
    let intermediate_asset = get_intermediate_asset(
        module.as_evaluated_chunk(chunking_context, Some(runtime_entries)),
        intermediate_output_path,
    );
    let renderer_pool = get_renderer_pool(
        intermediate_asset,
        intermediate_output_path,
        output_root,
        /* debug */ false,
    );
    // Read this strongly consistent, since we don't want to run inconsistent
    // node.js code.
    let pool = renderer_pool.strongly_consistent().await?;
    let mut operation = match pool.operation().await {
        Ok(operation) => operation,
        Err(err) => {
            return Ok(StaticResultVc::content(
                static_error(path, err, None, fallback_page).await?,
            ))
        }
    };

    Ok(
        match run_static_operation(
            &mut operation,
            data,
            intermediate_asset,
            intermediate_output_path,
        )
        .await
        {
            Ok(result) => result,
            Err(err) => StaticResultVc::content(
                static_error(path, err, Some(operation), fallback_page).await?,
            ),
        },
    )
}

async fn run_static_operation(
    operation: &mut NodeJsOperation,
    data: RenderDataVc,
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<StaticResultVc> {
    let data = data.await?;

    operation
        .send(RenderStaticOutgoingMessage::Headers { data: &data })
        .await
        .context("sending headers to node.js process")?;
    Ok(
        match operation
            .recv()
            .await
            .context("receiving from node.js process")?
        {
            RenderStaticIncomingMessage::Rewrite { path } => {
                StaticResultVc::rewrite(RewriteVc::new(path))
            }
            RenderStaticIncomingMessage::Response {
                status_code,
                content_type,
                body,
            } => StaticResultVc::content(
                FileContent::Content({
                    File::from(body)
                        .with_status_code(status_code)
                        .with_content_type(Mime::from_str(&content_type)?)
                })
                .into(),
            ),
            RenderStaticIncomingMessage::Error(error) => {
                bail!(trace_stack(error, intermediate_asset, intermediate_output_path).await?)
            }
        },
    )
}

async fn static_error(
    path: FileSystemPathVc,
    error: anyhow::Error,
    operation: Option<NodeJsOperation>,
    fallback_page: DevHtmlAssetVc,
) -> Result<AssetContentVc> {
    let message = format!("{error:?}")
        // TODO this is pretty inefficient
        .replace('&', "&amp;")
        .replace('>', "&gt;")
        .replace('<', "&lt;");
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
