use anyhow::{anyhow, bail, Context, Result};
use async_stream::try_stream as generator;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    pin_mut, SinkExt, StreamExt, TryStreamExt,
};
use parking_lot::Mutex;
use turbo_tasks::{
    duration_span, mark_finished, primitives::StringVc, util::SharedError, RawVc, ValueToString,
};
use turbo_tasks_bytes::{Bytes, Stream};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc},
    chunk::{ChunkingContextVc, EvaluatableAssetsVc},
    error::PrettyPrintError,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{Body, HeaderListVc, RewriteBuilder, RewriteVc},
};
use turbopack_ecmascript::EcmascriptModuleAssetVc;

use super::{
    issue::RenderingIssue, RenderDataVc, RenderStaticIncomingMessage, RenderStaticOutgoingMessage,
};
use crate::{
    get_intermediate_asset, get_renderer_pool, pool::NodeJsOperation,
    render::error_page::error_html_body, source_map::trace_stack, ResponseHeaders,
};

#[derive(Clone, Debug)]
#[turbo_tasks::value]
pub enum StaticResult {
    Content {
        content: AssetContentVc,
        status_code: u16,
        headers: HeaderListVc,
    },
    StreamedContent {
        status: u16,
        headers: HeaderListVc,
        body: Body,
    },
    Rewrite(RewriteVc),
}

#[turbo_tasks::value_impl]
impl StaticResultVc {
    #[turbo_tasks::function]
    pub fn content(content: AssetContentVc, status_code: u16, headers: HeaderListVc) -> Self {
        StaticResult::Content {
            content,
            status_code,
            headers,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn rewrite(rewrite: RewriteVc) -> Self {
        StaticResult::Rewrite(rewrite).cell()
    }
}

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function]
pub async fn render_static(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EvaluatableAssetsVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_dir: FileSystemPathVc,
    data: RenderDataVc,
) -> Result<StaticResultVc> {
    let render = render_stream(
        cwd,
        env,
        path,
        module,
        runtime_entries,
        fallback_page,
        chunking_context,
        intermediate_output_path,
        output_root,
        project_dir,
        data,
    )
    .await?;

    let mut stream = render.read();
    let first = match stream.try_next().await? {
        Some(f) => f,
        None => {
            // If an Error was received first, then it would have been
            // transformed into a proxy err error response.
            bail!("did not receive response from render");
        }
    };

    Ok(match first {
        RenderItem::Response(response) => response,
        RenderItem::Headers(data) => {
            let body = stream.map(|item| match item {
                Ok(RenderItem::BodyChunk(b)) => Ok(b),
                Ok(v) => Err(SharedError::new(anyhow!(
                    "unexpected render item: {:#?}",
                    v
                ))),
                Err(e) => Err(e),
            });
            StaticResult::StreamedContent {
                status: data.status,
                headers: HeaderListVc::cell(data.headers),
                body: Body::from_stream(body),
            }
            .cell()
        }
        v => bail!("unexpected render item: {:#?}", v),
    })
}

async fn static_error(
    path: FileSystemPathVc,
    error: anyhow::Error,
    operation: Option<NodeJsOperation>,
    fallback_page: DevHtmlAssetVc,
) -> Result<AssetContentVc> {
    let status = match operation {
        Some(operation) => Some(operation.wait_or_kill().await?),
        None => None,
    };

    let error = format!("{}", PrettyPrintError(&error));
    let mut message = error
        // TODO this is pretty inefficient
        .replace('&', "&amp;")
        .replace('>', "&gt;")
        .replace('<', "&lt;");

    if let Some(status) = status {
        message.push_str(&format!("\n\nStatus: {}", status));
    }

    let mut body = "<script id=\"__NEXT_DATA__\" type=\"application/json\">{ \"props\": {} \
                    }</script>"
        .to_string();

    body.push_str(
        error_html_body(500, "Error rendering page".to_string(), message)
            .await?
            .as_str(),
    );

    let issue = RenderingIssue {
        context: path,
        message: StringVc::cell(error),
        status: status.and_then(|status| status.code()),
    };

    issue.cell().as_issue().emit();

    let html = fallback_page.with_body(body);

    Ok(html.content())
}

#[derive(Clone, Debug)]
#[turbo_tasks::value]
enum RenderItem {
    Response(StaticResultVc),
    Headers(ResponseHeaders),
    BodyChunk(Bytes),
}

type RenderItemResult = Result<RenderItem, SharedError>;

#[turbo_tasks::value(eq = "manual", cell = "new", serialization = "none")]
struct RenderStreamSender {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    get: Box<dyn Fn() -> UnboundedSender<RenderItemResult> + Send + Sync>,
}

#[turbo_tasks::value(transparent)]
struct RenderStream(#[turbo_tasks(trace_ignore)] Stream<RenderItemResult>);

#[turbo_tasks::function]
fn render_stream(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EvaluatableAssetsVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_dir: FileSystemPathVc,
    data: RenderDataVc,
) -> RenderStreamVc {
    // Note the following code uses some hacks to create a child task that produces
    // a stream that is returned by this task.

    // We create a new cell in this task, which will be updated from the
    // [render_stream_internal] task.
    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*RENDERSTREAM_VALUE_TYPE_ID);

    // We initialize the cell with a stream that is open, but has no values.
    // The first [render_stream_internal] pipe call will pick up that stream.
    let (sender, receiver) = unbounded();
    cell.update_shared(RenderStream(Stream::new_open(vec![], Box::new(receiver))));
    let initial = Mutex::new(Some(sender));

    // run the evaluation as side effect
    render_stream_internal(
        cwd,
        env,
        path,
        module,
        runtime_entries,
        fallback_page,
        chunking_context,
        intermediate_output_path,
        output_root,
        project_dir,
        data,
        RenderStreamSender {
            get: Box::new(move || {
                if let Some(sender) = initial.lock().take() {
                    sender
                } else {
                    // In cases when only [render_stream_internal] is (re)executed, we need to
                    // update the old stream with a new value.
                    let (sender, receiver) = unbounded();
                    cell.update_shared(RenderStream(Stream::new_open(vec![], Box::new(receiver))));
                    sender
                }
            }),
        }
        .cell(),
    );

    let raw: RawVc = cell.into();
    raw.into()
}

#[turbo_tasks::function]
async fn render_stream_internal(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    path: FileSystemPathVc,
    module: EcmascriptModuleAssetVc,
    runtime_entries: EvaluatableAssetsVc,
    fallback_page: DevHtmlAssetVc,
    chunking_context: ChunkingContextVc,
    intermediate_output_path: FileSystemPathVc,
    output_root: FileSystemPathVc,
    project_dir: FileSystemPathVc,
    data: RenderDataVc,
    sender: RenderStreamSenderVc,
) {
    mark_finished();
    let Ok(sender) = sender.await else {
        // Impossible to handle the error in a good way.
        return;
    };

    let stream = generator! {
        let intermediate_asset = get_intermediate_asset(
            chunking_context,
            module.into(),
            runtime_entries,
        );
        let renderer_pool = get_renderer_pool(
            cwd,
            env,
            intermediate_asset,
            intermediate_output_path,
            output_root,
            project_dir,
            /* debug */ false,
        );

        // Read this strongly consistent, since we don't want to run inconsistent
        // node.js code.
        let pool = renderer_pool.strongly_consistent().await?;
        let data = data.await?;
        let mut operation = pool.operation().await?;

        operation
            .send(RenderStaticOutgoingMessage::Headers { data: &data })
            .await
            .context("sending headers to node.js process")?;

        let entry = module.ident().to_string().await?;
        let guard = duration_span!("Node.js rendering", entry = display(entry));

        match operation.recv().await? {
            RenderStaticIncomingMessage::Headers { data } => yield RenderItem::Headers(data),
            RenderStaticIncomingMessage::Rewrite { path } => {
                drop(guard);
                yield RenderItem::Response(StaticResultVc::rewrite(RewriteBuilder::new(path).build()));
                return;
            }
            RenderStaticIncomingMessage::Response {
                status_code,
                headers,
                body,
            } => {
                drop(guard);
                yield RenderItem::Response(StaticResultVc::content(
                    FileContent::Content(File::from(body)).into(),
                    status_code,
                    HeaderListVc::cell(headers),
                ));
                return;
            }
            RenderStaticIncomingMessage::Error(error) => {
                drop(guard);
                // If we don't get headers, then something is very wrong. Instead, we send down a
                // 500 proxy error as if it were the proper result.
                let trace = trace_stack(
                    error,
                    intermediate_asset,
                    intermediate_output_path,
                    project_dir,
                )
                .await?;
                yield RenderItem::Response(
                    StaticResultVc::content(
                        static_error(path, anyhow!(trace), Some(operation), fallback_page).await?,
                        500,
                        HeaderListVc::empty(),
                    )
                );
                return;
            }
            v => {
                drop(guard);
                Err(anyhow!("unexpected message during rendering: {:#?}", v))?;
                return;
            },
        };

        // If we get here, then the first message was a Headers. Now we need to stream out the body
        // chunks.
        loop {
            match operation.recv().await? {
                RenderStaticIncomingMessage::BodyChunk { data } => {
                    yield RenderItem::BodyChunk(data.into());
                }
                RenderStaticIncomingMessage::BodyEnd => break,
                RenderStaticIncomingMessage::Error(error) => {
                    // We have already started to send a result, so we can't change the
                    // headers/body to a proxy error.
                    operation.disallow_reuse();
                    let trace =
                        trace_stack(error, intermediate_asset, intermediate_output_path, project_dir).await?;
                        drop(guard);
                    Err(anyhow!("error during streaming render: {}", trace))?;
                    return;
                }
                v => {
                    drop(guard);
                    Err(anyhow!("unexpected message during rendering: {:#?}", v))?;
                    return;
                },
            }
        }
        drop(guard);
    };

    let mut sender = (sender.get)();
    pin_mut!(stream);
    while let Some(value) = stream.next().await {
        if sender.send(value).await.is_err() {
            return;
        }
        if sender.flush().await.is_err() {
            return;
        }
    }
}
