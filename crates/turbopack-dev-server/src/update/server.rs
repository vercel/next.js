use anyhow::Result;
use futures::{
    stream::{FuturesUnordered, StreamExt, StreamFuture},
    SinkExt,
};
use hyper::upgrade::Upgraded;
use hyper_tungstenite::{tungstenite::Message, HyperWebsocket, WebSocketStream};
use serde::{Deserialize, Serialize};
use tokio::select;
use turbo_tasks::TurboTasksApi;
use turbopack_core::version::Update;

use super::stream::UpdateStream;
use crate::{source::ContentSourceResult, GetContentSource};

/// A server that listens for updates and sends them to connected clients.
pub(crate) struct UpdateServer<S: GetContentSource> {
    ws: Option<HyperWebsocket>,
    streams: FuturesUnordered<StreamFuture<UpdateStream>>,
    get_source: S,
}

impl<S: GetContentSource> UpdateServer<S> {
    /// Create a new update server with the given websocket and content source.
    pub fn new(ws: HyperWebsocket, source: S) -> Self {
        Self {
            ws: Some(ws),
            streams: FuturesUnordered::new(),
            get_source: source,
        }
    }

    /// Run the update server loop.
    pub fn run(self, tt: &dyn TurboTasksApi) {
        tt.run_once_process(Box::pin(async move {
            if let Err(err) = self.run_internal().await {
                println!("[UpdateServer]: error {}", err);
            }
            Ok(())
        }));
    }

    async fn run_internal(mut self) -> Result<()> {
        let source = (self.get_source)();
        let mut client: UpdateClient = self.ws.take().unwrap().await?.into();

        // TODO(alexkirsz) To avoid sending an empty update in the beginning, skip the
        // first update. Note that the first update *may not* be empty, but since we
        // don't support client HMR yet, this would result in a reload loop.
        loop {
            select! {
                message = client.recv() => {
                    if let Some(message) = message? {
                        let content = source.get_by_id(&message.id);
                        match *content.await? {
                            ContentSourceResult::NotFound => {
                                // Client requested a non-existing asset
                                // It might be removed in meantime, reload client
                                // TODO add special instructions for removed assets to handled it in a better way
                                client.send_update(&message.id, ClientUpdateInstructionType::Restart).await?;
                            },
                            ContentSourceResult::Static(content) => {
                                let stream = UpdateStream::new(message.id, content).await?;
                                self.add_stream(stream);
                            },
                            ContentSourceResult::NeedData{ .. } => {
                              todo!()
                            }
                        }
                    } else {
                        break
                    }
                }
                Some((Some(update), stream)) = self.streams.next() => {
                    match &*update {
                        Update::Partial(partial) => {
                            let partial_instruction = partial.instruction.await?;
                            client.send_update(stream.id(), ClientUpdateInstructionType::Partial {
                                instruction: partial_instruction.as_ref(),
                            }).await?;
                        }
                        Update::Total(_total) => {
                            client.send_update(stream.id(), ClientUpdateInstructionType::Restart).await?;
                        }
                        Update::None => {}
                    }
                    self.add_stream(stream);
                }
                else => break
            }
        }
        Ok(())
    }

    fn add_stream(&mut self, stream: UpdateStream) {
        self.streams.push(stream.into_future());
    }
}

struct UpdateClient {
    ws: WebSocketStream<Upgraded>,
}

impl UpdateClient {
    async fn recv(&mut self) -> Result<Option<ClientMessage>> {
        Ok(if let Some(msg) = self.ws.next().await {
            if let Message::Text(msg) = msg? {
                let msg = serde_json::from_str(&msg)?;
                Some(msg)
            } else {
                None
            }
        } else {
            None
        })
    }

    async fn send_update(
        &mut self,
        id: &str,
        type_: ClientUpdateInstructionType<'_>,
    ) -> Result<()> {
        let instruction = ClientUpdateInstruction { id, type_ };
        self.ws
            .send(Message::text(serde_json::to_string(&instruction)?))
            .await?;
        Ok(())
    }
}

impl From<WebSocketStream<Upgraded>> for UpdateClient {
    fn from(ws: WebSocketStream<Upgraded>) -> Self {
        Self { ws }
    }
}

#[derive(Deserialize)]
#[serde(transparent)]
pub(super) struct ClientMessage {
    pub(super) id: String,
}

#[derive(Serialize)]
pub(super) struct ClientUpdateInstruction<'a> {
    pub(super) id: &'a str,
    #[serde(flatten, rename = "type")]
    pub(super) type_: ClientUpdateInstructionType<'a>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub(super) enum ClientUpdateInstructionType<'a> {
    Restart,
    Partial { instruction: &'a str },
}
