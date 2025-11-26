use std::{
    ops::ControlFlow,
    pin::Pin,
    task::{Context, Poll},
};

use anyhow::{Context as _, Error, Result};
use futures::{SinkExt, prelude::*, ready, stream::FusedStream};
use hyper::{HeaderMap, Uri, upgrade::Upgraded};
use hyper_tungstenite::{HyperWebsocket, WebSocketStream, tungstenite::Message};
use pin_project_lite::pin_project;
use tokio::select;
use tokio_stream::StreamMap;
use tracing::{Level, instrument};
use turbo_tasks::{
    NonLocalValue, OperationVc, ReadRef, TransientInstance, TurboTasksApi, Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::json::parse_json_with_source_context;
use turbopack_core::{error::PrettyPrintError, issue::IssueReporter, version::Update};
use turbopack_ecmascript_hmr_protocol::{
    ClientMessage, ClientUpdateInstruction, Issue, ResourceIdentifier,
};

use crate::{
    SourceProvider,
    source::{
        Body,
        request::SourceRequest,
        resolve::{ResolveSourceRequestResult, resolve_source_request},
    },
    update::stream::{GetContentFn, UpdateStream, UpdateStreamItem},
};

/// A server that listens for updates and sends them to connected clients.
pub(crate) struct UpdateServer<P: SourceProvider> {
    source_provider: P,
    #[allow(dead_code)]
    issue_reporter: Vc<Box<dyn IssueReporter>>,
}

impl<P> UpdateServer<P>
where
    P: SourceProvider + NonLocalValue + TraceRawVcs + Clone + Send + Sync,
{
    /// Create a new update server with the given websocket and content source.
    pub fn new(source_provider: P, issue_reporter: Vc<Box<dyn IssueReporter>>) -> Self {
        Self {
            source_provider,
            issue_reporter,
        }
    }

    /// Run the update server loop.
    pub fn run(self, tt: &dyn TurboTasksApi, ws: HyperWebsocket) {
        tt.start_once_process(Box::pin(async move {
            if let Err(err) = self.run_internal(ws).await {
                println!("[UpdateServer]: error {err:#}");
            }
        }));
    }

    #[instrument(level = Level::TRACE, skip_all, name = "UpdateServer::run_internal")]
    async fn run_internal(self, ws: HyperWebsocket) -> Result<()> {
        let mut client: UpdateClient = ws.await?.into();

        let mut streams = StreamMap::new();

        loop {
            // most logic is in helper functions as rustfmt cannot format code inside the macro
            select! {
                message = client.try_next() => {
                    if Self::on_message(
                        &mut client,
                        &mut streams,
                        &self.source_provider,
                        message?,
                    ).await?.is_break() {
                        break;
                    }
                }
                Some((resource, update_result)) = streams.next() => {
                    Self::on_stream(
                        &mut client,
                        &mut streams,
                        resource,
                        update_result,
                    ).await?
                }
                else => break
            }
        }

        Ok(())
    }

    /// Helper for `on_message` used to construct a `GetContentFn`. Argument must match
    /// `get_content_capture`.
    fn get_content(
        (source_provider, request): &(P, SourceRequest),
    ) -> OperationVc<ResolveSourceRequestResult> {
        let request = request.clone();
        let source = source_provider.get_source();
        resolve_source_request(source, TransientInstance::new(request))
    }

    /// receives ClientMessages and passes subscriptions to `on_stream` via the `streams` map.
    async fn on_message(
        client: &mut UpdateClient,
        streams: &mut StreamMap<ResourceIdentifier, UpdateStream>,
        source_provider: &P,
        message: Option<ClientMessage>,
    ) -> Result<ControlFlow<()>> {
        match message {
            Some(ClientMessage::Subscribe { resource }) => {
                let get_content_capture =
                    (source_provider.clone(), resource_to_request(&resource)?);
                match UpdateStream::new(
                    resource.to_string().into(),
                    TransientInstance::new(GetContentFn::new(
                        get_content_capture,
                        Self::get_content,
                    )),
                )
                .await
                {
                    Ok(stream) => {
                        streams.insert(resource, stream);
                    }
                    Err(err) => {
                        eprintln!(
                            "Failed to create update stream for {resource}: {}",
                            PrettyPrintError(&err),
                        );
                        client
                            .send(ClientUpdateInstruction::not_found(&resource))
                            .await?;
                    }
                }
            }
            Some(ClientMessage::Unsubscribe { resource }) => {
                streams.remove(&resource);
            }
            None => {
                // WebSocket was closed, stop sending updates
                return Ok(ControlFlow::Break(()));
            }
        }
        Ok(ControlFlow::Continue(()))
    }

    async fn on_stream(
        client: &mut UpdateClient,
        streams: &mut StreamMap<ResourceIdentifier, UpdateStream>,
        resource: ResourceIdentifier,
        update_result: Result<ReadRef<UpdateStreamItem>>,
    ) -> Result<()> {
        match update_result {
            Ok(update_item) => Self::send_update(client, streams, resource, &update_item).await,
            Err(err) => {
                eprintln!(
                    "Failed to get update for {resource}: {}",
                    PrettyPrintError(&err)
                );
                Ok(())
            }
        }
    }

    async fn send_update(
        client: &mut UpdateClient,
        streams: &mut StreamMap<ResourceIdentifier, UpdateStream>,
        resource: ResourceIdentifier,
        update_item: &UpdateStreamItem,
    ) -> Result<()> {
        match update_item {
            UpdateStreamItem::NotFound => {
                // If the resource was not found, we remove the stream and indicate that to the
                // client.
                streams.remove(&resource);
                client
                    .send(ClientUpdateInstruction::not_found(&resource))
                    .await?;
            }
            UpdateStreamItem::Found { update, issues } => {
                let issues = issues
                    .iter()
                    .map(|p| Issue::from(&**p))
                    .collect::<Vec<Issue<'_>>>();
                match &**update {
                    Update::Partial(partial) => {
                        let partial_instruction = &partial.instruction;
                        client
                            .send(ClientUpdateInstruction::partial(
                                &resource,
                                partial_instruction,
                                &issues,
                            ))
                            .await?;
                    }
                    Update::Missing | Update::Total(_) => {
                        client
                            .send(ClientUpdateInstruction::restart(&resource, &issues))
                            .await?;
                    }
                    Update::None => {
                        client
                            .send(ClientUpdateInstruction::issues(&resource, &issues))
                            .await?;
                    }
                }
            }
        }

        Ok(())
    }
}

fn resource_to_request(resource: &ResourceIdentifier) -> Result<SourceRequest> {
    let mut headers = HeaderMap::new();

    if let Some(res_headers) = &resource.headers {
        for (name, value) in res_headers {
            headers.append(
                hyper::header::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                hyper::header::HeaderValue::from_bytes(value.as_bytes()).unwrap(),
            );
        }
    }

    Ok(SourceRequest {
        uri: Uri::try_from(format!("/{}", resource.path))?,
        headers,
        method: "GET".to_string(),
        body: Body::new(vec![]),
    })
}

pin_project! {
    struct UpdateClient {
        #[pin]
        ws: WebSocketStream<Upgraded>,
        ended: bool,
    }
}

impl Stream for UpdateClient {
    type Item = Result<ClientMessage>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.ended {
            return Poll::Ready(None);
        }

        let this = self.project();
        let item = ready!(this.ws.poll_next(cx));

        let msg = match item {
            Some(Ok(Message::Text(msg))) => msg,
            Some(Err(err)) => {
                *this.ended = true;

                let err = Error::new(err).context("reading from websocket");
                return Poll::Ready(Some(Err(err)));
            }
            _ => {
                *this.ended = true;
                return Poll::Ready(None);
            }
        };

        match parse_json_with_source_context(&msg).context("deserializing websocket message") {
            Ok(msg) => Poll::Ready(Some(Ok(msg))),
            Err(err) => {
                *this.ended = true;

                Poll::Ready(Some(Err(err)))
            }
        }
    }
}

impl FusedStream for UpdateClient {
    fn is_terminated(&self) -> bool {
        self.ended || self.ws.is_terminated()
    }
}

impl<'a> Sink<ClientUpdateInstruction<'a>> for UpdateClient {
    type Error = Error;

    fn poll_ready(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<std::result::Result<(), Self::Error>> {
        self.project()
            .ws
            .poll_ready(cx)
            .map(|res| res.context("polling WebSocket ready"))
    }

    fn start_send(
        self: Pin<&mut Self>,
        item: ClientUpdateInstruction<'a>,
    ) -> std::result::Result<(), Self::Error> {
        let msg = Message::text(serde_json::to_string(&item)?);

        self.project()
            .ws
            .start_send(msg)
            .context("sending to WebSocket")
    }

    fn poll_flush(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<std::result::Result<(), Self::Error>> {
        self.project()
            .ws
            .poll_flush(cx)
            .map(|res| res.context("flushing WebSocket"))
    }

    fn poll_close(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<std::result::Result<(), Self::Error>> {
        self.project()
            .ws
            .poll_close(cx)
            .map(|res| res.context("closing WebSocket"))
    }
}

impl From<WebSocketStream<Upgraded>> for UpdateClient {
    fn from(ws: WebSocketStream<Upgraded>) -> Self {
        Self { ws, ended: false }
    }
}
