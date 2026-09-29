use std::sync::Arc;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use crate::{
    store::SpanId,
    store_container::StoreContainer,
    timestamp::Timestamp,
    u64_string,
    viewer::{SortMode, Update, ViewLineUpdate, ViewMode, Viewer},
};

#[derive(Serialize, Debug)]
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
        memory_samples: Vec<u64>,
        memory_pressure_samples: Vec<u8>,
    },
}

#[derive(Deserialize, Debug)]
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

#[derive(Deserialize, Debug)]
pub struct Filter {
    pub op: Op,
    pub value: u64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Op {
    Gt,
    Lt,
}

#[derive(Deserialize, Debug)]
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

/// Stateful implementation of the trace viewer protocol, independent of its
/// transport. Native WebSockets and browser WASM both use this session.
pub struct ProtocolSession {
    store: Arc<StoreContainer>,
    viewer: Viewer,
    view_rect: ViewRect,
    last_update_generation: usize,
    update_skipped: bool,
    ready_for_update: bool,
}

impl ProtocolSession {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
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
            update_skipped: false,
            ready_for_update: true,
        }
    }

    pub fn handle_text(&mut self, text: &str) -> Result<Vec<String>> {
        let message = serde_json::from_str(text)?;
        let messages = self.handle_message(message)?;
        messages
            .into_iter()
            .map(|message| serde_json::to_string(&message).map_err(Into::into))
            .collect()
    }

    pub fn handle_message(
        &mut self,
        message: ClientToServerMessage,
    ) -> Result<Vec<ServerToClientMessage>> {
        let mut responses = Vec::new();
        match message {
            ClientToServerMessage::CheckForMoreData => {
                self.send_update(false, &mut responses);
            }
            ClientToServerMessage::ViewRect { view_rect } => {
                self.view_rect = view_rect;
                self.send_update(true, &mut responses);
            }
            ClientToServerMessage::ViewMode { id, mode, inherit } => {
                let (mode, sort_mode) = if let Some(mode) = mode.strip_suffix("-sorted-by-name") {
                    (mode, SortMode::Name)
                } else if let Some(mode) = mode.strip_suffix("-sorted-by-value") {
                    (mode, SortMode::Value)
                } else if let Some(mode) = mode.strip_suffix("-sorted") {
                    (mode, SortMode::Value)
                } else {
                    (mode.as_str(), SortMode::ExecutionOrder)
                };
                let view_mode = match mode {
                    "raw-spans" => ViewMode::RawSpans { sort_mode },
                    "aggregated" => ViewMode::Aggregated { sort_mode },
                    "bottom-up" => ViewMode::BottomUp { sort_mode },
                    "aggregated-bottom-up" => ViewMode::AggregatedBottomUp { sort_mode },
                    _ => bail!("unknown view mode: {mode}"),
                };
                self.viewer.set_view_mode(id, Some((view_mode, inherit)));
                self.send_update(true, &mut responses);
            }
            ClientToServerMessage::ResetViewMode { id } => {
                self.viewer.set_view_mode(id, None);
                self.send_update(true, &mut responses);
            }
            ClientToServerMessage::Query { id } => {
                responses.push(self.query(id));
                self.send_update(true, &mut responses);
            }
            ClientToServerMessage::Ack => {
                self.ready_for_update = true;
                if self.update_skipped {
                    self.update_skipped = false;
                    self.send_update(true, &mut responses);
                }
            }
        }
        Ok(responses)
    }

    fn send_update(&mut self, force_send: bool, responses: &mut Vec<ServerToClientMessage>) {
        if !self.ready_for_update {
            if force_send {
                self.update_skipped = true;
            }
            return;
        }
        let store = self.store.read();
        if !force_send && self.last_update_generation == store.generation() {
            return;
        }
        self.last_update_generation = store.generation();
        let Update {
            lines: updates,
            max,
        } = self.viewer.compute_update(&store, &self.view_rect);
        let count = updates.len();
        responses.extend(
            updates
                .into_iter()
                .map(|update| ServerToClientMessage::ViewLine { update }),
        );
        responses.push(ServerToClientMessage::ViewLinesCount { count, max });
        self.ready_for_update = false;
    }

    fn query(&self, id: SpanId) -> ServerToClientMessage {
        let store = self.store.read();
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
            let memory_samples = store.memory_samples_for_range(span.start(), span.end());
            let memory_pressure_samples =
                store.memory_pressure_samples_for_range(span.start(), span.end());
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
                memory_samples,
                memory_pressure_samples,
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
                memory_samples: Vec::new(),
                memory_pressure_samples: Vec::new(),
            }
        }
    }
}
