use std::{
    net::{Shutdown, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use websocket::{
    server::upgrade::WsUpgrade,
    sync::{server::upgrade::Buffer, Server, Writer},
    OwnedMessage,
};

use crate::{
    store::SpanId,
    store_container::StoreContainer,
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
        start: u64,
        end: u64,
        duration: u64,
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
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpanViewEvent {
    pub start: u64,
    pub duration: u64,
    pub name: String,
    pub id: Option<SpanId>,
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
}

struct ConnectionState {
    writer: Writer<TcpStream>,
    store: Arc<StoreContainer>,
    viewer: Viewer,
    view_rect: ViewRect,
    last_update_generation: usize,
}

pub fn serve(store: Arc<StoreContainer>) -> Result<()> {
    let mut server = Server::bind("127.0.0.1:57475")?;
    loop {
        let Ok(connection) = server.accept() else {
            continue;
        };
        let store = store.clone();
        thread::spawn(move || {
            fn handle_connection(
                connection: WsUpgrade<TcpStream, Option<Buffer>>,
                store: Arc<StoreContainer>,
            ) -> Result<()> {
                let connection = match connection.accept() {
                    Ok(connection) => connection,
                    Err((connection, error)) => {
                        connection.shutdown(Shutdown::Both)?;
                        return Err(error.into());
                    }
                };
                println!("client connected");
                let (mut reader, writer) = connection.split()?;
                let state = Arc::new(Mutex::new(ConnectionState {
                    writer,
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
                    },
                    last_update_generation: 0,
                }));
                let should_shutdown = Arc::new(AtomicBool::new(false));
                let update_skipped = Arc::new(AtomicBool::new(false));
                let ready_for_update = Arc::new(AtomicBool::new(true));
                fn send_update(
                    state: &mut ConnectionState,
                    force_send: bool,
                    ready_for_update: &AtomicBool,
                    update_skipped: &AtomicBool,
                ) -> Result<()> {
                    if !ready_for_update.load(Ordering::SeqCst) {
                        if force_send {
                            update_skipped.store(true, Ordering::SeqCst);
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
                        state.writer.send_message(&OwnedMessage::Text(message))?;
                    }
                    let message = ServerToClientMessage::ViewLinesCount { count, max };
                    let message = serde_json::to_string(&message).unwrap();
                    state.writer.send_message(&OwnedMessage::Text(message))?;
                    ready_for_update.store(false, Ordering::SeqCst);
                    Ok(())
                }
                let inner_thread = {
                    let should_shutdown = should_shutdown.clone();
                    let ready_for_update = ready_for_update.clone();
                    let update_skipped = update_skipped.clone();
                    let state = state.clone();
                    thread::spawn(move || loop {
                        if should_shutdown.load(Ordering::SeqCst) {
                            return;
                        }
                        if send_update(
                            &mut state.lock().unwrap(),
                            false,
                            &ready_for_update,
                            &update_skipped,
                        )
                        .is_err()
                        {
                            break;
                        }
                        thread::sleep(Duration::from_millis(500));
                    })
                };
                loop {
                    match reader.recv_message()? {
                        OwnedMessage::Text(text) => {
                            let message: ClientToServerMessage = serde_json::from_str(&text)?;
                            let mut state = state.lock().unwrap();
                            match message {
                                ClientToServerMessage::ViewRect { view_rect } => {
                                    state.view_rect = view_rect;
                                    send_update(
                                        &mut state,
                                        true,
                                        &ready_for_update,
                                        &update_skipped,
                                    )?;
                                }
                                ClientToServerMessage::ViewMode { id, mode, inherit } => {
                                    let (mode, sorted) =
                                        if let Some(mode) = mode.strip_suffix("-sorted") {
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
                                                Some((
                                                    ViewMode::AggregatedBottomUp { sorted },
                                                    inherit,
                                                )),
                                            );
                                        }
                                        _ => {
                                            bail!("unknown view mode: {}", mode)
                                        }
                                    }
                                    send_update(
                                        &mut state,
                                        true,
                                        &ready_for_update,
                                        &update_skipped,
                                    )?;
                                }
                                ClientToServerMessage::ResetViewMode { id } => {
                                    state.viewer.set_view_mode(id, None);
                                    send_update(
                                        &mut state,
                                        true,
                                        &ready_for_update,
                                        &update_skipped,
                                    )?;
                                }
                                ClientToServerMessage::Query { id } => {
                                    let message = if let Some((span, is_graph)) =
                                        state.store.read().span(id)
                                    {
                                        let span_start = span.start();
                                        let span_end = span.end();
                                        let duration = span.corrected_total_time();
                                        let allocations = span.total_allocations();
                                        let deallocations = span.total_deallocations();
                                        let allocation_count = span.total_allocation_count();
                                        let persistent_allocations =
                                            span.total_persistent_allocations();
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
                                            start: 0,
                                            end: 0,
                                            duration: 0,
                                            allocations: 0,
                                            deallocations: 0,
                                            allocation_count: 0,
                                            persistent_allocations: 0,
                                            args: Vec::new(),
                                            path: Vec::new(),
                                        }
                                    };
                                    let message = serde_json::to_string(&message).unwrap();
                                    state.writer.send_message(&OwnedMessage::Text(message))?;
                                    send_update(
                                        &mut state,
                                        true,
                                        &ready_for_update,
                                        &update_skipped,
                                    )?;

                                    continue;
                                }
                                ClientToServerMessage::Ack => {
                                    ready_for_update.store(true, Ordering::SeqCst);
                                    if update_skipped.load(Ordering::SeqCst) {
                                        update_skipped.store(false, Ordering::SeqCst);
                                        send_update(
                                            &mut state,
                                            true,
                                            &ready_for_update,
                                            &update_skipped,
                                        )?;
                                    }
                                }
                            }
                        }
                        OwnedMessage::Binary(_) => {
                            // This doesn't happen
                        }
                        OwnedMessage::Close(_) => {
                            reader.shutdown_all()?;
                            should_shutdown.store(true, Ordering::SeqCst);
                            inner_thread.join().unwrap();
                            return Ok(());
                        }
                        OwnedMessage::Ping(d) => {
                            state
                                .lock()
                                .unwrap()
                                .writer
                                .send_message(&OwnedMessage::Pong(d))?;
                        }
                        OwnedMessage::Pong(_) => {
                            // thanks for the fish
                        }
                    }
                }
            }
            if let Err(err) = handle_connection(connection, store) {
                eprintln!("Error: {:?}", err);
            }
        });
    }
}
