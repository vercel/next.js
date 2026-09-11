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
    /// Sort mode: `"value"` for duration descending, `"name"` for alphabetical,
    /// `"allocations"` for total allocated bytes descending,
    /// `"persistent-allocations"` for net retained bytes descending.
    /// Omit for execution order (no sorting).
    pub sort: Option<String>,
    /// Optional substring search query applied to span name/category.
    ///
    /// Recursive: matches anywhere in the parent's subtree, and each result's
    /// `id` is the full path from `parent` down to the match.
    pub search: Option<String>,
    /// Maximum depth to descend below `parent` when searching, or when `depth`
    /// requests a nested subtree. Default `32`, which is also the cap.
    pub max_depth: Option<u32>,
    /// When greater than `1`, each returned span carries its descendants inline
    /// in `children`, up to this many levels. Default `1` (no nesting).
    pub depth: Option<u32>,
    /// 1-based page number. Default `1`.
    pub page: Option<u32>,
    /// Spans per page. Default `20`, capped at `500`.
    pub page_size: Option<u32>,
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
    /// Raw span ID of the group's **first** span — the example span whose
    /// `cpuDuration`, `correctedDuration` and `memorySamples` are reported on
    /// this entry. First in execution order, *not* the largest: drilling in
    /// here to explain a group's allocation total usually lands on an
    /// unremarkable span. Use `heaviestSpanId` for that.
    pub first_span_id: Option<String>,
    /// Raw span ID of the group member with the largest persistent
    /// allocations — the one actually responsible for most of the group's
    /// retained bytes, and the right span to drill into when a group's
    /// allocation numbers are what drew your attention.
    pub heaviest_span_id: Option<String>,
    /// Total bytes allocated by this span and all its children.
    ///
    /// For aggregated groups this is the **group total** across every span in
    /// the group. Note the asymmetry with the fields above: `cpuDuration`,
    /// `correctedDuration` and `memorySamples` describe the *example* span
    /// only, while every allocation field is a group total.
    pub allocations: i64,
    /// Total bytes deallocated by this span and all its children.
    /// Group total for aggregated spans.
    pub deallocations: i64,
    /// Net bytes attributed to this span and its children: the sum over each
    /// span of `max(0, selfAllocations - selfDeallocations)`. Group total for
    /// aggregated spans.
    ///
    /// **A ranking signal, not retained memory.** It is allocated-minus-freed
    /// as seen by TurboMalloc's per-span counters, which never observe
    /// turbo-tasks cell and cache drops, so a whole-trace total far above real
    /// peak RSS is expected rather than a leak. Use `memorySummary.peak` for
    /// absolute memory; use this to rank who allocates.
    ///
    /// Not simply `allocations - deallocations`: the per-span floor at zero
    /// means a span that frees more than it allocates contributes 0, not a
    /// negative.
    pub persistent_allocations: i64,
    /// Number of allocation operations by this span and all its children.
    /// Group total for aggregated spans.
    pub allocation_count: i64,
    /// Bytes allocated by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocations: i64,
    /// Bytes deallocated by this span itself, excluding children.
    /// Group total for aggregated spans.
    ///
    /// Frees are charged to whichever span was on top of the thread's stack
    /// **at free time**, which is often not the span that allocated. A child
    /// that allocates into a buffer its parent later drops appears as a child
    /// with large `selfAllocations` and a parent with large
    /// `selfDeallocations` — which reads like "the child leaks" but is proof
    /// the memory was released. Small `selfAllocations` with large
    /// `selfDeallocations` means this span is where a child's arena is
    /// dropped, i.e. that arena is bounded.
    pub self_deallocations: i64,
    /// Net retained bytes by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_persistent_allocations: i64,
    /// Number of allocation operations by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocation_count: i64,
    /// TurboMalloc memory-usage samples recorded while this span
    /// (or its example span, for aggregated groups) was live.
    ///
    /// Each entry is `[ts_offset_from_span_start_in_ticks, bytes, pressure]`,
    /// where `pressure` is the memory-pressure byte (0 = no pressure, higher
    /// = more pressure). `100 ticks = 1 µs`. The offset is always `>= 0` and
    /// `<= span_duration`. Capped and downsampled by the store.
    pub memory_samples: Vec<Vec<i64>>,
    /// Precomputed summary of `memorySamples`. Absent when the span's range
    /// holds no samples. Unlike the allocation counters these are absolute
    /// live-heap readings, so `peak` is the figure to quote for how much
    /// memory was actually in use.
    pub memory_summary: Option<TraceMemorySummary>,
    /// Descendants of this span, populated only when the query set `depth > 1`.
    /// Each child is a full span entry with its own navigable `id`.
    pub children: Vec<TraceSpanInfo>,
}

/// Aggregate view of a span's TurboMalloc memory samples.
#[napi(object)]
pub struct TraceMemorySummary {
    /// Number of samples in the span's range, after downsampling.
    pub count: u32,
    /// Live bytes at the first sample in the range.
    pub start: i64,
    /// Live bytes at the last sample in the range.
    pub end: i64,
    /// Smallest live-bytes reading in the range.
    pub min: i64,
    /// Largest live-bytes reading in the range — the span's peak memory.
    pub peak: i64,
    /// Highest memory-pressure byte in the range (0 = no pressure).
    pub max_pressure: u8,
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

/// Convert a core `SpanInfo` (and its nested children) into the napi shape.
fn convert_span(s: turbopack_trace_server::SpanInfo) -> TraceSpanInfo {
    TraceSpanInfo {
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
        heaviest_span_id: s.heaviest_span_id,
        allocations: s.allocations as i64,
        deallocations: s.deallocations as i64,
        persistent_allocations: s.persistent_allocations as i64,
        allocation_count: s.allocation_count as i64,
        self_allocations: s.self_allocations as i64,
        self_deallocations: s.self_deallocations as i64,
        self_persistent_allocations: s.self_persistent_allocations as i64,
        self_allocation_count: s.self_allocation_count as i64,
        memory_samples: s
            .memory_samples
            .into_iter()
            .map(|(ts, mem, pressure)| vec![ts, mem as i64, pressure as i64])
            .collect(),
        memory_summary: s.memory_summary.map(|m| TraceMemorySummary {
            count: m.count as u32,
            start: m.start as i64,
            end: m.end as i64,
            min: m.min as i64,
            peak: m.peak as i64,
            max_pressure: m.max_pressure,
        }),
        children: s.children.into_iter().map(convert_span).collect(),
    }
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
                Some("allocations") => SortMode::Allocations,
                Some("persistent-allocations") => SortMode::PersistentAllocations,
                _ => SortMode::ExecutionOrder,
            },
            search: options.search,
            max_depth: options.max_depth.unwrap_or(u32::MAX),
            depth: options.depth.unwrap_or(1),
            page: options.page.unwrap_or(1) as usize,
            page_size: options.page_size.map(|n| n as usize),
        },
    );

    TraceQueryResult {
        spans: result.spans.into_iter().map(convert_span).collect(),
        page: result.page as u32,
        total_pages: result.total_pages as u32,
        total_count: result.total_count as u32,
    }
}
