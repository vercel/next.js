use std::{path::PathBuf, sync::Arc};

use napi_derive::napi;
use turbopack_trace_server::{
    FlatProfileOptions, MemoryPoint, MemoryReading, MemoryTimelineOptions, ProfileSort,
    QueryOptions, SortMode, flat_profile, memory_timeline, query_spans,
    start_turbopack_trace_server, store_container::StoreContainer,
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
    /// `"persistent-allocations"` for `persistentAllocations` descending.
    /// Omit for execution order (no sorting).
    pub sort: Option<String>,
    /// Optional substring search query applied to span name/category.
    ///
    /// Matches anywhere in the parent's subtree. Each result's `id` is the full
    /// path from `parent` to the match, so it can be passed back as `parent`.
    ///
    /// Cost scales with subtree size, so a root search on a large trace walks
    /// everything. Setting `parent`, or lowering `maxDepth`, bounds it.
    pub search: Option<String>,
    /// When `true`, list every span in the subtree below `parent`, as if
    /// `search` matched everything. Ignored when `search` is set.
    pub recursive: Option<bool>,
    /// Maximum depth to descend below `parent` for `search` and `recursive`.
    /// Unlimited by default. `depthLimited` in the result reports whether it
    /// cut anything off.
    pub max_depth: Option<u32>,
    /// When greater than `1`, each returned span carries this many levels of
    /// descendants inline in `children`. Default `1` (no nesting), capped at
    /// `32`.
    pub depth: Option<u32>,
    /// 1-based page number. Default `1`.
    pub page: Option<u32>,
    /// Spans per page. Default `20`, capped at `10000`.
    pub page_size: Option<u32>,
    /// When `false`, leave `memorySamples` empty (`memorySummary` is still
    /// computed). Default `true`.
    pub include_memory_samples: Option<bool>,
}

/// Information about a single span or aggregated span group.
#[napi(object)]
pub struct TraceSpanInfo {
    /// Span ID. Pass this as `parent` in a follow-up call to get children.
    /// For an aggregated group, the children of every member, merged.
    pub id: String,
    /// Display name of the span. A lone span's name may include its `name`
    /// arg (e.g. a module path); `groupName` never does.
    pub name: String,
    /// The name spans are aggregated by: `name` without the `name` arg.
    pub group_name: String,
    /// Raw CPU total time in internal ticks (100 ticks = 1 µs). For aggregated
    /// groups, the example span's.
    pub cpu_duration: i64,
    /// Concurrency-corrected total time in internal ticks (100 ticks = 1 µs).
    /// For aggregated groups, the example span's.
    pub corrected_duration: i64,
    /// Absolute start in internal ticks since the trace started, on the same
    /// clock as memory samples. For aggregated groups, the earliest member
    /// start.
    pub start: i64,
    /// Absolute end in internal ticks. For aggregated groups, the latest
    /// member end.
    pub end: i64,
    /// `start` relative to the parent's start, in internal ticks.
    pub start_relative_to_parent: i64,
    /// `end` relative to the parent's start, in internal ticks.
    pub end_relative_to_parent: i64,
    /// Key-value attributes attached to the span (the example span, for
    /// aggregated groups).
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
    /// Raw span ID of the group's example span: the member with the largest
    /// corrected duration. Its `cpuDuration`, `correctedDuration`, `args` and
    /// `memorySamples` are the ones reported here.
    pub example_span_id: Option<String>,
    /// Raw span ID of the group member that came first in execution order.
    pub first_span_id: Option<String>,
    /// Raw span ID of the group member with the largest persistent
    /// allocations.
    pub heaviest_span_id: Option<String>,
    /// Total bytes allocated by this span and all its children.
    ///
    /// For aggregated groups this is the group total, unlike `cpuDuration`,
    /// `correctedDuration` and `memorySamples`, which describe the example span
    /// only. Every allocation field below follows this field, not those.
    pub allocations: i64,
    /// Total bytes deallocated by this span and all its children.
    /// Group total for aggregated spans.
    pub deallocations: i64,
    /// Sum over each span of `max(0, selfAllocations - selfDeallocations)`,
    /// for this span and its children. Group total for aggregated spans.
    ///
    /// **A ranking signal, not retained memory.** TurboMalloc's per-span
    /// counters never observe turbo-tasks cell and cache drops, so a
    /// whole-trace total far above real peak RSS is expected, not a leak. Use
    /// `memorySummary.peak` for absolute memory.
    ///
    /// The per-span floor at zero is also why this is not
    /// `allocations - deallocations`.
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
    /// Frees are charged to whichever span was on top of the thread's stack at
    /// free time, which is often not the span that allocated. So small
    /// `selfAllocations` with large `selfDeallocations` means this span is
    /// where a child's arena gets dropped — that arena is bounded, not leaking.
    /// The shape to suspect is a large `selfPersistentAllocations` with no such
    /// counterpart above it.
    pub self_deallocations: i64,
    /// `max(0, selfAllocations - selfDeallocations)` for this span alone.
    /// Group total for aggregated spans.
    pub self_persistent_allocations: i64,
    /// Number of allocation operations by this span itself, excluding children.
    /// Group total for aggregated spans.
    pub self_allocation_count: i64,
    /// Process samples recorded while this span (or its example span, for
    /// aggregated groups) was live.
    ///
    /// **Process-wide, not per-span.** One global series is sliced by the
    /// span's time range, so spans that overlap in time report identical values
    /// no matter what each allocated. Rank concurrent work by the allocation
    /// fields instead.
    ///
    /// Each entry is `[ts, bytes, pressure, footprint, active_worker_threads]`:
    /// `ts` is absolute in internal ticks, on the same clock as `start`/`end`;
    /// `bytes` is the memory the allocator has committed from the OS
    /// (mimalloc's `current_commit`); `pressure` is the memory-pressure byte
    /// (0 = no pressure, higher = more pressure); `footprint` is the process
    /// memory footprint (RSS) in bytes (0 = not reported by the platform); and
    /// `active_worker_threads` counts non-parked Tokio scheduler workers.
    /// `100 ticks = 1 µs`. Capped and downsampled by the store.
    pub memory_samples: Vec<Vec<i64>>,
    /// Summary of `memorySamples`; absent when the span's range holds none.
    /// Unlike the allocation counters these are absolute readings of committed
    /// memory, so `peak` is the figure to quote for memory actually in use.
    pub memory_summary: Option<TraceMemorySummary>,
    /// Committed bytes and footprint at the span's start, interpolated between
    /// the surrounding samples, so present even for spans too short to hold a
    /// sample. Outside the sampled range, the nearest sample. Absent only for
    /// a trace without samples.
    pub memory_at_start: Option<TraceMemoryPoint>,
    /// Like `memoryAtStart`, at the span's end.
    pub memory_at_end: Option<TraceMemoryPoint>,
    /// Descendants of this span, populated only when `depth > 1`.
    pub children: Vec<TraceSpanInfo>,
}

/// Aggregate view of a span's memory samples.
#[napi(object)]
pub struct TraceMemorySummary {
    /// Number of samples in the span's range, after downsampling.
    pub count: u32,
    /// Committed bytes at the first sample in the range.
    pub start: i64,
    /// Committed bytes at the last sample in the range.
    pub end: i64,
    /// Smallest committed-bytes reading in the range.
    pub min: i64,
    /// Largest committed-bytes reading in the range — the span's peak memory.
    pub peak: i64,
    /// Highest memory-pressure byte in the range (0 = no pressure).
    pub max_pressure: u8,
    /// Largest process memory footprint (RSS) in bytes in the range (0 = not
    /// reported by the platform).
    pub max_footprint: i64,
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
    /// True when `maxDepth` stopped the walk above spans that have
    /// descendants, so matches below that depth may be missing.
    pub depth_limited: bool,
}

/// Memory readings at one point in time, interpolated between samples.
#[napi(object)]
pub struct TraceMemoryPoint {
    /// Bytes the allocator has committed from the OS.
    pub bytes: i64,
    /// Process memory footprint (RSS) in bytes (0 = not reported).
    pub footprint: i64,
}

fn convert_memory_point(point: MemoryPoint) -> TraceMemoryPoint {
    TraceMemoryPoint {
        bytes: point.bytes as i64,
        footprint: point.footprint as i64,
    }
}

/// Options for `query_trace_flat_profile`.
#[napi(object)]
pub struct TraceFlatProfileOptions {
    /// Span ID whose subtree to profile. Omit for the whole trace. For an
    /// aggregated group, every member's subtree is included.
    pub parent: Option<String>,
    /// Keep only entries whose name matches (substring, comma-separated terms
    /// ANDed).
    pub search: Option<String>,
    /// `"self"` (default) for corrected self time, `"total"` for corrected
    /// total time, `"self-allocations"`, `"self-persistent-allocations"` or
    /// `"count"`. All descending.
    pub sort: Option<String>,
    /// 1-based page number. Default `1`.
    pub page: Option<u32>,
    /// Entries per page. Default `20`, capped at `10000`.
    pub page_size: Option<u32>,
}

/// All spans with one name in a flat profile. Durations are in internal ticks
/// (100 ticks = 1 µs).
#[napi(object)]
pub struct TraceProfileEntry {
    /// Group name, without the `name` arg.
    pub name: String,
    /// Number of spans with this name.
    pub count: i64,
    /// Summed self time.
    pub self_duration: i64,
    /// Summed concurrency-corrected self time.
    pub corrected_self_duration: i64,
    /// Summed total time, counting only the outermost of nested same-named
    /// spans.
    pub total_duration: i64,
    /// Like `totalDuration`, concurrency-corrected.
    pub corrected_total_duration: i64,
    pub self_allocations: i64,
    pub self_deallocations: i64,
    pub self_persistent_allocations: i64,
    pub self_allocation_count: i64,
    /// Raw span ID of the span with the largest corrected total time.
    pub example_span_id: String,
    /// Corrected total time of the example span.
    pub example_corrected_duration: i64,
}

/// The result of a `query_trace_flat_profile` call.
#[napi(object)]
pub struct TraceFlatProfileResult {
    pub entries: Vec<TraceProfileEntry>,
    pub page: u32,
    pub total_pages: u32,
    /// Number of entries (distinct names) across all pages.
    pub total_count: u32,
    /// Number of spans in the profiled subtree.
    pub span_count: i64,
    /// Corrected self time of the whole subtree.
    pub total_corrected_self_duration: i64,
    /// Self allocations of the whole subtree.
    pub total_self_allocations: i64,
}

/// Options for `query_trace_memory_timeline`.
#[napi(object)]
pub struct TraceMemoryTimelineOptions {
    /// Span ID whose range to cover and whose children are the phases. Omit
    /// for the whole trace with top-level spans as phases.
    pub parent: Option<String>,
    /// Absolute start in internal ticks, overriding the parent's.
    pub start: Option<i64>,
    /// Absolute end in internal ticks, overriding the parent's.
    pub end: Option<i64>,
    /// Samples to downsample to. Default `100`, capped at `2000`.
    pub max_samples: Option<u32>,
    /// Phases to return, the ones with the largest corrected duration.
    /// Default `20`, capped at `200`.
    pub max_phases: Option<u32>,
}

/// A memory reading at one point in time.
#[napi(object)]
pub struct TraceMemoryReading {
    /// Absolute time in internal ticks.
    pub ts: i64,
    /// Bytes the allocator has committed from the OS.
    pub bytes: i64,
    /// Process memory footprint (RSS) in bytes (0 = not reported).
    pub footprint: i64,
}

fn convert_memory_reading(reading: MemoryReading) -> TraceMemoryReading {
    TraceMemoryReading {
        ts: reading.ts as i64,
        bytes: reading.bytes as i64,
        footprint: reading.footprint as i64,
    }
}

/// A span running during a memory timeline. Always a single span, never an
/// aggregated group, whose extent would cover the gaps between its members.
#[napi(object)]
pub struct TraceTimelinePhase {
    /// Raw span ID, usable as `parent`.
    pub id: String,
    pub name: String,
    /// Absolute start in internal ticks.
    pub start: i64,
    /// Absolute end in internal ticks.
    pub end: i64,
    /// Concurrency-corrected duration.
    pub corrected_duration: i64,
    pub memory_at_start: Option<TraceMemoryPoint>,
    pub memory_at_end: Option<TraceMemoryPoint>,
    /// Largest committed-bytes sample during the phase.
    pub peak_bytes: Option<i64>,
    /// Largest footprint sample during the phase.
    pub peak_footprint: Option<i64>,
}

/// The result of a `query_trace_memory_timeline` call.
#[napi(object)]
pub struct TraceMemoryTimeline {
    /// Absolute start of the covered range, in internal ticks.
    pub start: i64,
    /// Absolute end of the covered range, in internal ticks.
    pub end: i64,
    /// `[ts, bytes, pressure, footprint, active_worker_threads]`, like
    /// `memorySamples` on a span.
    pub samples: Vec<Vec<i64>>,
    /// Number of samples in the range before downsampling.
    pub raw_sample_count: u32,
    /// The sample with the most committed bytes.
    pub peak_bytes: Option<TraceMemoryReading>,
    /// The sample with the largest footprint.
    pub peak_footprint: Option<TraceMemoryReading>,
    /// The sample where footprint minus committed bytes is largest (negative
    /// when committed pages aren't resident). Absent when the platform doesn't
    /// report footprint.
    pub max_gap: Option<TraceMemoryReading>,
    /// The phases with the largest corrected duration, in start order.
    pub phases: Vec<TraceTimelinePhase>,
}

fn convert_samples(samples: Vec<(u64, u64, u8, u64, u64)>) -> Vec<Vec<i64>> {
    samples
        .into_iter()
        .map(|(ts, mem, pressure, footprint, workers)| {
            vec![
                ts as i64,
                mem as i64,
                pressure as i64,
                footprint as i64,
                workers as i64,
            ]
        })
        .collect()
}

/// Starts the turbopack trace server on a background thread and returns a
/// handle immediately (non-blocking). The WebSocket server will be available
/// at `ws://127.0.0.1:<port>` (default port 5747).
#[napi]
pub fn start_turbopack_trace_server_handle(path: String, port: Option<u16>) -> TraceServerHandle {
    let store = start_turbopack_trace_server(PathBuf::from(path), port);
    TraceServerHandle { store }
}

/// Convert a core `SpanInfo` and its nested children into the napi shape.
fn convert_span(s: turbopack_trace_server::SpanInfo) -> TraceSpanInfo {
    TraceSpanInfo {
        id: s.id,
        name: s.name,
        group_name: s.group_name,
        cpu_duration: s.cpu_duration as i64,
        corrected_duration: s.corrected_duration as i64,
        start: s.start as i64,
        end: s.end as i64,
        start_relative_to_parent: s.start_relative_to_parent,
        end_relative_to_parent: s.end_relative_to_parent,
        args: s.args.into_iter().map(|(k, v)| vec![k, v]).collect(),
        is_aggregated: s.is_aggregated,
        count: s.count.map(|c| c as i64),
        total_cpu_duration: s.total_cpu_duration.map(|v| v as i64),
        avg_cpu_duration: s.avg_cpu_duration.map(|v| v as i64),
        total_corrected_duration: s.total_corrected_duration.map(|v| v as i64),
        avg_corrected_duration: s.avg_corrected_duration.map(|v| v as i64),
        example_span_id: s.example_span_id,
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
        memory_samples: convert_samples(s.memory_samples),
        memory_summary: s.memory_summary.map(|m| TraceMemorySummary {
            count: m.count as u32,
            start: m.start as i64,
            end: m.end as i64,
            min: m.min as i64,
            peak: m.peak as i64,
            max_pressure: m.max_pressure,
            max_footprint: m.max_footprint as i64,
        }),
        memory_at_start: s.memory_at_start.map(convert_memory_point),
        memory_at_end: s.memory_at_end.map(convert_memory_point),
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
            recursive: options.recursive.unwrap_or(false),
            max_depth: options.max_depth.unwrap_or(u32::MAX),
            depth: options.depth.unwrap_or(1),
            page: options.page.unwrap_or(1) as usize,
            page_size: options.page_size.map(|n| n as usize),
            include_memory_samples: options.include_memory_samples.unwrap_or(true),
        },
    );

    TraceQueryResult {
        spans: result.spans.into_iter().map(convert_span).collect(),
        page: result.page as u32,
        total_pages: result.total_pages as u32,
        total_count: result.total_count as u32,
        depth_limited: result.depth_limited,
    }
}

/// Group every span below a parent by name, wherever in the tree each one
/// sits, and sum their self time and allocations.
#[napi]
pub fn query_trace_flat_profile(
    handle: &TraceServerHandle,
    options: TraceFlatProfileOptions,
) -> TraceFlatProfileResult {
    let result = flat_profile(
        &handle.store,
        FlatProfileOptions {
            parent: options.parent,
            search: options.search,
            sort: match options.sort.as_deref() {
                Some("total") => ProfileSort::TotalTime,
                Some("self-allocations") => ProfileSort::SelfAllocations,
                Some("self-persistent-allocations") => ProfileSort::SelfPersistentAllocations,
                Some("count") => ProfileSort::Count,
                _ => ProfileSort::SelfTime,
            },
            page: options.page.unwrap_or(1) as usize,
            page_size: options.page_size.map(|n| n as usize),
        },
    );
    TraceFlatProfileResult {
        entries: result
            .entries
            .into_iter()
            .map(|e| TraceProfileEntry {
                name: e.name,
                count: e.count as i64,
                self_duration: e.self_duration as i64,
                corrected_self_duration: e.corrected_self_duration as i64,
                total_duration: e.total_duration as i64,
                corrected_total_duration: e.corrected_total_duration as i64,
                self_allocations: e.self_allocations as i64,
                self_deallocations: e.self_deallocations as i64,
                self_persistent_allocations: e.self_persistent_allocations as i64,
                self_allocation_count: e.self_allocation_count as i64,
                example_span_id: e.example_span_id,
                example_corrected_duration: e.example_corrected_duration as i64,
            })
            .collect(),
        page: result.page as u32,
        total_pages: result.total_pages as u32,
        total_count: result.total_count as u32,
        span_count: result.span_count as i64,
        total_corrected_self_duration: result.total_corrected_self_duration as i64,
        total_self_allocations: result.total_self_allocations as i64,
    }
}

/// The process memory series over a time range, with the spans running in it
/// as phase markers.
#[napi]
pub fn query_trace_memory_timeline(
    handle: &TraceServerHandle,
    options: TraceMemoryTimelineOptions,
) -> TraceMemoryTimeline {
    let timeline = memory_timeline(
        &handle.store,
        MemoryTimelineOptions {
            parent: options.parent,
            start: options.start.map(|ts| ts.max(0) as u64),
            end: options.end.map(|ts| ts.max(0) as u64),
            max_samples: options.max_samples.map(|n| n as usize),
            max_phases: options.max_phases.map(|n| n as usize),
        },
    );
    TraceMemoryTimeline {
        start: timeline.start as i64,
        end: timeline.end as i64,
        samples: convert_samples(timeline.samples),
        raw_sample_count: timeline.raw_sample_count as u32,
        peak_bytes: timeline.peak_bytes.map(convert_memory_reading),
        peak_footprint: timeline.peak_footprint.map(convert_memory_reading),
        max_gap: timeline.max_gap.map(convert_memory_reading),
        phases: timeline
            .phases
            .into_iter()
            .map(|p| TraceTimelinePhase {
                id: p.id,
                name: p.name,
                start: p.start as i64,
                end: p.end as i64,
                corrected_duration: p.corrected_duration as i64,
                memory_at_start: p.memory_at_start.map(convert_memory_point),
                memory_at_end: p.memory_at_end.map(convert_memory_point),
                peak_bytes: p.peak_bytes.map(|v| v as i64),
                peak_footprint: p.peak_footprint.map(|v| v as i64),
            })
            .collect(),
    }
}
