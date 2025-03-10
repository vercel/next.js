use std::{
    net::{SocketAddr, SocketAddrV4, TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread::spawn,
};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use tungstenite::{accept, Message};

use crate::{
    store::SpanId,
    store_container::StoreContainer,
    timestamp::Timestamp,
    u64_string,
    viewer::{Update, ViewLineUpdate, ViewMode, Viewer},
};

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
pub enum ServerToClientMessage {
    ViewLine {
        #[serde(flatten)]
        update: ViewLineUpdate,
    },
    ViewLinesCount {
        count: usize,
        max: u64,
    },
    #[serde(rename_all = "camelCase")]
    QueryResult {
        #[serde(with = "u64_string")]
        id: SpanId,
        is_graph: bool,
        start: Timestamp,
        end: Timestamp,
        duration: Timestamp,
        cpu: Timestamp,
        allocations: u64,
        deallocations: u64,
        allocation_count: u64,
        persistent_allocations: u64,
        args: Vec<(String, String)>,
        path: Vec<String>,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
pub enum ClientToServerMessage {
    #[serde(rename_all = "camelCase")]
    ViewRect {
        view_rect: ViewRect,
    },
    ViewMode {
        #[serde(with = "u64_string")]
        id: SpanId,
        mode: String,
        inherit: bool,
    },
    ResetViewMode {
        #[serde(with = "u64_string")]
        id: SpanId,
    },
    Query {
        #[serde(with = "u64_string")]
        id: SpanId,
    },
    Ack,
    CheckForMoreData,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpanViewEvent {
    pub start: Timestamp,
    pub duration: Timestamp,
    pub name: String,
    pub id: Option<SpanId>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Filter {
    pub op: Op,
    pub value: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Op {
    Gt,
    Lt,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ViewRect {
    pub x: u64,
    pub y: u64,
    pub width: u64,
    pub height: u64,
    pub horizontal_pixels: u64,
    pub query: String,
    pub view_mode: String,
    pub value_mode: String,
    pub value_filter: Option<Filter>,
    pub count_filter: Option<Filter>,
}

struct ConnectionState {
    store: Arc<StoreContainer>,
    viewer: Viewer,
    view_rect: ViewRect,
    last_update_generation: usize,
}

pub fn serve(store: Arc<StoreContainer>, port: u16) {
    let server = TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(
        std::net::Ipv4Addr::new(127, 0, 0, 1),
        port,
    )))
    .unwrap();
    for stream in server.incoming() {
        let store = store.clone();

        spawn(move || {
            let websocket = accept(stream.unwrap()).unwrap();
            if let Err(err) = handle_connection(websocket, store) {
                eprintln!("Error: {:?}", err);
            }
        });
    }
}

fn handle_connection(
    mut websocket: tungstenite::WebSocket<TcpStream>,
    store: Arc<StoreContainer>,
) -> Result<()> {
    let state = Arc::new(Mutex::new(ConnectionState {
        store,
        viewer: Viewer::new(),
        view_rect: ViewRect {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            horizontal_pixels: 1,
            query: String::new(),
            view_mode: "aggregated".to_string(),
            value_mode: "duration".to_string(),
            count_filter: None,
            value_filter: None,
        },
        last_update_generation: 0,
    }));
    let mut update_skipped = false;
    let mut ready_for_update = true;

    fn send_update(
        websocket: &mut tungstenite::WebSocket<TcpStream>,
        state: &mut ConnectionState,
        force_send: bool,
        ready_for_update: &mut bool,
        update_skipped: &mut bool,
    ) -> Result<()> {
        if !*ready_for_update {
            if force_send {
                *update_skipped = true;
            }
            return Ok(());
        }
        let store = state.store.read();
        if !force_send && state.last_update_generation == store.generation() {
            return Ok(());
        }
        state.last_update_generation = store.generation();
        let Update {
            lines: updates,
            max,
        } = state.viewer.compute_update(&store, &state.view_rect);
        let count = updates.len();
        for update in updates {
            let message = ServerToClientMessage::ViewLine { update };
            let message = serde_json::to_string(&message).unwrap();
            websocket.send(Message::Text(message))?;
        }
        let message = ServerToClientMessage::ViewLinesCount { count, max };
        let message = serde_json::to_string(&message).unwrap();
        websocket.send(Message::Text(message))?;
        *ready_for_update = false;
        Ok(())
    }
    loop {
        match websocket.read()? {
            Message::Frame(_frame) => {}
            Message::Text(text) => {
                let message: ClientToServerMessage = serde_json::from_str(&text)?;
                let mut state = state.lock().unwrap();
                match message {
                    ClientToServerMessage::CheckForMoreData => {
                        send_update(
                            &mut websocket,
                            &mut state,
                            false,
                            &mut ready_for_update,
                            &mut update_skipped,
                        )?;
                    }
                    ClientToServerMessage::ViewRect { view_rect } => {
                        state.view_rect = view_rect;
                        send_update(
                            &mut websocket,
                            &mut state,
                            true,
                            &mut ready_for_update,
                            &mut update_skipped,
                        )?;
                    }
                    ClientToServerMessage::ViewMode { id, mode, inherit } => {
                        let (mode, sorted) = if let Some(mode) = mode.strip_suffix("-sorted") {
                            (mode, true)
                        } else {
                            (mode.as_str(), false)
                        };
                        match mode {
                            "raw-spans" => {
                                state.viewer.set_view_mode(
                                    id,
                                    Some((ViewMode::RawSpans { sorted }, inherit)),
                                );
                            }
                            "aggregated" => {
                                state.viewer.set_view_mode(
                                    id,
                                    Some((ViewMode::Aggregated { sorted }, inherit)),
                                );
                            }
                            "bottom-up" => {
                                state.viewer.set_view_mode(
                                    id,
                                    Some((ViewMode::BottomUp { sorted }, inherit)),
                                );
                            }
                            "aggregated-bottom-up" => {
                                state.viewer.set_view_mode(
                                    id,
                                    Some((ViewMode::AggregatedBottomUp { sorted }, inherit)),
                                );
                            }
                            _ => {
                                bail!("unknown view mode: {}", mode)
                            }
                        }
                        send_update(
                            &mut websocket,
                            &mut state,
                            true,
                            &mut ready_for_update,
                            &mut update_skipped,
                        )?;
                    }
                    ClientToServerMessage::ResetViewMode { id } => {
                        state.viewer.set_view_mode(id, None);
                        send_update(
                            &mut websocket,
                            &mut state,
                            true,
                            &mut ready_for_update,
                            &mut update_skipped,
                        )?;
                    }
                    ClientToServerMessage::Query { id } => {
                        let message = {
                            let store = state.store.read();
                            if let Some((span, is_graph)) = store.span(id) {
                                let root_start = store.root_span().start();
                                let span_start = span.start() - root_start;
                                let span_end = span.end() - root_start;
                                let duration = span.corrected_total_time();
                                let cpu = span.total_time();
                                let allocations = span.total_allocations();
                                let deallocations = span.total_deallocations();
                                let allocation_count = span.total_allocation_count();
                                let persistent_allocations = span.total_persistent_allocations();
                                let args = span
                                    .args()
                                    .map(|(k, v)| (k.to_string(), v.to_string()))
                                    .collect();
                                let mut path = Vec::new();
                                let mut current = span;
                                while let Some(parent) = current.parent() {
                                    path.push(parent.nice_name().1.to_string());
                                    current = parent;
                                }
                                path.reverse();
                                ServerToClientMessage::QueryResult {
                                    id,
                                    is_graph,
                                    start: span_start,
                                    end: span_end,
                                    duration,
                                    cpu,
                                    allocations,
                                    deallocations,
                                    allocation_count,
                                    persistent_allocations,
                                    args,
                                    path,
                                }
                            } else {
                                ServerToClientMessage::QueryResult {
                                    id,
                                    is_graph: false,
                                    start: Timestamp::ZERO,
                                    end: Timestamp::ZERO,
                                    duration: Timestamp::ZERO,
                                    cpu: Timestamp::ZERO,
                                    allocations: 0,
                                    deallocations: 0,
                                    allocation_count: 0,
                                    persistent_allocations: 0,
                                    args: Vec::new(),
                                    path: Vec::new(),
                                }
                            }
                        };
                        let message = serde_json::to_string(&message).unwrap();
                        websocket.send(Message::Text(message))?;
                        send_update(
                            &mut websocket,
                            &mut state,
                            true,
                            &mut ready_for_update,
                            &mut update_skipped,
                        )?;

                        continue;
                    }
                    ClientToServerMessage::Ack => {
                        ready_for_update = true;
                        if update_skipped {
                            update_skipped = false;
                            send_update(
                                &mut websocket,
                                &mut state,
                                true,
                                &mut ready_for_update,
                                &mut update_skipped,
                            )?;
                        }
                    }
                }
            }
            Message::Binary(_) => {
                // This doesn't happen
            }
            Message::Close(_) => {
                return Ok(());
            }
            Message::Ping(d) => {
                websocket.send(Message::Pong(d))?;
            }
            Message::Pong(_) => {
                // thanks for the fish
            }
        }
    }
}
