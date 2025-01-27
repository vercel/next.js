use anyhow::{anyhow, bail, Context, Result};
use async_stream::try_stream as generator;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    pin_mut, SinkExt, StreamExt, TryStreamExt,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    duration_span, mark_finished, prevent_gc, util::SharedError, RawVc, ResolvedVc, TaskInput,
    ValueToString, Vc,
};
use turbo_tasks_bytes::{Bytes, Stream};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EvaluatableAssets},
    error::PrettyPrintError,
    issue::{IssueExt, StyledString},
    module::Module,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{Body, HeaderList, Rewrite, RewriteBuilder},
};

use super::{
    issue::RenderingIssue, RenderData, RenderStaticIncomingMessage, RenderStaticOutgoingMessage,
};
use crate::{
    get_intermediate_asset, get_renderer_pool_operation, pool::NodeJsOperation,
    render::error_page::error_html_body, source_map::trace_stack, ResponseHeaders,
};

#[derive(Clone, Debug)]
#[turbo_tasks::value]
pub enum StaticResult {
    Content {
        content: ResolvedVc<AssetContent>,
        status_code: u16,
        headers: ResolvedVc<HeaderList>,
    },
    StreamedContent {
        status: u16,
        headers: ResolvedVc<HeaderList>,
        body: Body,
    },
    Rewrite(ResolvedVc<Rewrite>),
}

#[turbo_tasks::value_impl]
impl StaticResult {
    #[turbo_tasks::function]
    pub fn content(
        content: ResolvedVc<AssetContent>,
        status_code: u16,
        headers: ResolvedVc<HeaderList>,
    ) -> Vc<Self> {
        StaticResult::Content {
            content,
            status_code,
            headers,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn rewrite(rewrite: ResolvedVc<Rewrite>) -> Vc<Self> {
        StaticResult::Rewrite(rewrite).cell()
    }
}

/// Renders a module as static HTML in a node.js process.
#[turbo_tasks::function(operation)]
pub async fn render_static_operation(
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    path: ResolvedVc<FileSystemPath>,
    module: ResolvedVc<Box<dyn Module>>,
    runtime_entries: ResolvedVc<EvaluatableAssets>,
    fallback_page: ResolvedVc<DevHtmlAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
    output_root: ResolvedVc<FileSystemPath>,
    project_dir: ResolvedVc<FileSystemPath>,
    data: ResolvedVc<RenderData>,
    debug: bool,
) -> Result<Vc<StaticResult>> {
    let render = render_stream(RenderStreamOptions {
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
        debug,
    })
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
        RenderItem::Response(response) => *response,
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
                headers: ResolvedVc::cell(data.headers),
                body: Body::from_stream(body),
            }
            .cell()
        }
        v => bail!("unexpected render item: {:#?}", v),
    })
}

async fn static_error(
    path: ResolvedVc<FileSystemPath>,
    error: anyhow::Error,
    operation: Option<NodeJsOperation>,
    fallback_page: Vc<DevHtmlAsset>,
) -> Result<Vc<AssetContent>> {
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
        error_html_body(500, "Error rendering page".into(), message.into())
            .await?
            .as_str(),
    );

    let issue = RenderingIssue {
        file_path: path,
        message: StyledString::Text(error.into()).resolved_cell(),
        status: status.and_then(|status| status.code()),
    };

    issue.resolved_cell().emit();

    let html = fallback_page.with_body(body.into());

    Ok(html.content())
}

#[derive(Clone, Debug)]
#[turbo_tasks::value]
enum RenderItem {
    Response(ResolvedVc<StaticResult>),
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

#[derive(Clone, Debug, TaskInput, PartialEq, Eq, Hash, Deserialize, Serialize)]
struct RenderStreamOptions {
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    path: ResolvedVc<FileSystemPath>,
    module: ResolvedVc<Box<dyn Module>>,
    runtime_entries: ResolvedVc<EvaluatableAssets>,
    fallback_page: ResolvedVc<DevHtmlAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    intermediate_output_path: ResolvedVc<FileSystemPath>,
    output_root: ResolvedVc<FileSystemPath>,
    project_dir: ResolvedVc<FileSystemPath>,
    data: ResolvedVc<RenderData>,
    debug: bool,
}

#[turbo_tasks::function]
fn render_stream(options: RenderStreamOptions) -> Vc<RenderStream> {
    // TODO: The way we invoke render_stream_internal as side effect is not
    // GC-safe, so we disable GC for this task.
    prevent_gc();

    // Note the following code uses some hacks to create a child task that produces
    // a stream that is returned by this task.

    // We create a new cell in this task, which will be updated from the
    // [render_stream_internal] task.
    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*RENDERSTREAM_VALUE_TYPE_ID);

    // We initialize the cell with a stream that is open, but has no values.
    // The first [render_stream_internal] pipe call will pick up that stream.
    let (sender, receiver) = unbounded();
    cell.update(RenderStream(Stream::new_open(vec![], Box::new(receiver))));
    let initial = Mutex::new(Some(sender));

    // run the evaluation as side effect
    let _ = render_stream_internal(
        options,
        RenderStreamSender {
            get: Box::new(move || {
                if let Some(sender) = initial.lock().take() {
                    sender
                } else {
                    // In cases when only [render_stream_internal] is (re)executed, we need to
                    // update the old stream with a new value.
                    let (sender, receiver) = unbounded();
                    cell.update(RenderStream(Stream::new_open(vec![], Box::new(receiver))));
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
    options: RenderStreamOptions,
    sender: Vc<RenderStreamSender>,
) -> Result<Vc<()>> {
    let RenderStreamOptions {
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
        debug,
    } = options;

    mark_finished();
    let Ok(sender) = sender.await else {
        // Impossible to handle the error in a good way.
        return Ok(Default::default());
    };

    let stream = generator! {
        let intermediate_asset = get_intermediate_asset(
            *chunking_context,
            *module,
            *runtime_entries,
        ).to_resolved().await?;
        let renderer_pool_op = get_renderer_pool_operation(
            cwd,
            env,
            intermediate_asset,
            intermediate_output_path,
            output_root,
            project_dir,
            debug,
        );

        // Read this strongly consistent, since we don't want to run inconsistent
        // node.js code.
        let pool = renderer_pool_op.read_strongly_consistent().await?;
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
                yield RenderItem::Response(
                    StaticResult::rewrite(RewriteBuilder::new(path).build()).to_resolved().await?
                );
                return;
            }
            RenderStaticIncomingMessage::Response {
                status_code,
                headers,
                body,
            } => {
                drop(guard);
                yield RenderItem::Response(
                    StaticResult::content(
                        AssetContent::file(File::from(body).into()),
                        status_code,
                        Vc::cell(headers),
                    ).to_resolved().await?
                );
                return;
            }
            RenderStaticIncomingMessage::Error(error) => {
                drop(guard);
                // If we don't get headers, then something is very wrong. Instead, we send down a
                // 500 proxy error as if it were the proper result.
                let trace = trace_stack(
                    error,
                    *intermediate_asset,
                    *intermediate_output_path,
                    *project_dir,
                )
                .await?;
                yield RenderItem::Response(
                    StaticResult::content(
                        static_error(path, anyhow!(trace), Some(operation), *fallback_page).await?,
                        500,
                        HeaderList::empty(),
                    ).to_resolved().await?
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
                        trace_stack(error, *intermediate_asset, *intermediate_output_path, *project_dir).await?;
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
            return Ok(Default::default());
        }
        if sender.flush().await.is_err() {
            return Ok(Default::default());
        }
    }

    Ok(Default::default())
}
