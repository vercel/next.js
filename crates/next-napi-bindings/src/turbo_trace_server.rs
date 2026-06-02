use std::{path::PathBuf, sync::Arc};

use napi_derive::napi;
use turbopack_trace_server::{
    QueryOptions, SortMode, query_spans, start_turbopack_trace_server,
    store_container::StoreContainer,
};

/// An opaque handle to a running trace server instance.
/// Holds a reference to the shared store so that `query_trace_spans` can
/// query it without blocking Node.js with the WebSocket server loop.
#[napi]
pub struct TraceServerHandle {
    store: Arc<StoreContainer>,
}

/// Options for `query_trace_spans`.
#[napi(object)]
pub struct TraceQueryOptions {
    /// Optional parent span ID (as returned by a previous query).
    /// Omit or set to `null`/`undefined` for root-level spans.
    pub parent: Option<String>,
    /// When `true` (default), aggregate child spans with the same name.
    pub aggregated: Option<bool>,
    /// Sort mode: `"value"` for duration descending, `"name"` for alphabetical.
    /// Omit for execution order (no sorting).
    pub sort: Option<String>,
    /// Optional substring search query applied to span name/category.
    pub search: Option<String>,
    /// 1-based page number. Default `1`.
    pub page: Option<u32>,
}

/// Information about a single span or aggregated span group.
#[napi(object)]
pub struct TraceSpanInfo {
    /// Span ID. Pass this as `parent` in a follow-up call to get children.
    pub id: String,
    /// Display name of the span.
    pub name: String,
    /// Raw CPU total time in internal ticks (100 ticks = 1 µs).
    pub cpu_duration: i64,
    /// Concurrency-corrected total time in internal ticks (100 ticks = 1 µs).
    pub corrected_duration: i64,
    /// Start time relative to parent start, in internal ticks.
    pub start_relative_to_parent: i64,
    /// End time relative to parent start, in internal ticks.
    pub end_relative_to_parent: i64,
    /// Key-value attributes attached to the span.
    pub args: Vec<Vec<String>>,
    /// True if this entry represents an aggregated group of spans.
    pub is_aggregated: bool,
    /// Number of spans in this aggregated group (only set when `is_aggregated`).
    pub count: Option<i64>,
    /// Sum of CPU duration across all spans in the group.
    pub total_cpu_duration: Option<i64>,
    /// Average CPU duration across spans in the group.
    pub avg_cpu_duration: Option<i64>,
    /// Sum of corrected duration across all spans in the group.
    pub total_corrected_duration: Option<i64>,
    /// Average corrected duration across spans in the group.
    pub avg_corrected_duration: Option<i64>,
    /// Raw span ID for aggregated groups (the index of the first span).
    pub first_span_id: Option<String>,
    /// TurboMalloc memory-usage samples recorded while this span
    /// (or its example span, for aggregated groups) was live.
    ///
    /// Each entry is `[ts_offset_from_span_start_in_ticks, bytes, pressure]`,
    /// where `pressure` is the memory-pressure byte (0 = no pressure, higher
    /// = more pressure). `100 ticks = 1 µs`. The offset is always `>= 0` and
    /// `<= span_duration`. Capped and downsampled by the store.
    pub memory_samples: Vec<Vec<i64>>,
}

/// The result of a `query_trace_spans` call.
#[napi(object)]
pub struct TraceQueryResult {
    pub spans: Vec<TraceSpanInfo>,
    /// Current page (1-based).
    pub page: u32,
    /// Total number of pages available.
    pub total_pages: u32,
    /// Total number of matching spans across all pages.
    pub total_count: u32,
}

/// Starts the turbopack trace server on a background thread and returns a
/// handle immediately (non-blocking). The WebSocket server will be available
/// at `ws://127.0.0.1:<port>` (default port 5747).
#[napi]
pub fn start_turbopack_trace_server_handle(path: String, port: Option<u16>) -> TraceServerHandle {
    let store = start_turbopack_trace_server(PathBuf::from(path), port);
    TraceServerHandle { store }
}

/// Query spans from the trace store held by a `TraceServerHandle`.
#[napi]
pub fn query_trace_spans(
    handle: &TraceServerHandle,
    options: TraceQueryOptions,
) -> TraceQueryResult {
    let result = query_spans(
        &handle.store,
        QueryOptions {
            parent: options.parent,
            aggregated: options.aggregated.unwrap_or(true),
            sort: match options.sort.as_deref() {
                Some("value") => SortMode::Value,
                Some("name") => SortMode::Name,
                _ => SortMode::ExecutionOrder,
            },
            search: options.search,
            page: options.page.unwrap_or(1) as usize,
        },
    );

    TraceQueryResult {
        spans: result
            .spans
            .into_iter()
            .map(|s| TraceSpanInfo {
                id: s.id,
                name: s.name,
                cpu_duration: s.cpu_duration as i64,
                corrected_duration: s.corrected_duration as i64,
                start_relative_to_parent: s.start_relative_to_parent,
                end_relative_to_parent: s.end_relative_to_parent,
                args: s.args.into_iter().map(|(k, v)| vec![k, v]).collect(),
                is_aggregated: s.is_aggregated,
                count: s.count.map(|c| c as i64),
                total_cpu_duration: s.total_cpu_duration.map(|v| v as i64),
                avg_cpu_duration: s.avg_cpu_duration.map(|v| v as i64),
                total_corrected_duration: s.total_corrected_duration.map(|v| v as i64),
                avg_corrected_duration: s.avg_corrected_duration.map(|v| v as i64),
                first_span_id: s.first_span_id,
                memory_samples: s
                    .memory_samples
                    .into_iter()
                    .map(|(ts, mem, pressure)| vec![ts, mem as i64, pressure as i64])
                    .collect(),
            })
            .collect(),
        page: result.page as u32,
        total_pages: result.total_pages as u32,
        total_count: result.total_count as u32,
    }
}
