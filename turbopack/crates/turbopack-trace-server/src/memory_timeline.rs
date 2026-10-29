//! The process memory series over a time range, with the spans running in it
//! as phase markers.

use std::cmp::Reverse;

use crate::{
    MemoryPoint, Parent, build_span_id, format_span_name, store_container::StoreContainer,
    timestamp::Timestamp, wait_for_data,
};

/// Default for `MemoryTimelineOptions::max_samples`.
const DEFAULT_TIMELINE_SAMPLES: usize = 100;
/// Cap for `MemoryTimelineOptions::max_samples`.
const MAX_TIMELINE_SAMPLES: usize = 2000;
/// Default for `MemoryTimelineOptions::max_phases`.
const DEFAULT_TIMELINE_PHASES: usize = 20;
/// Cap for `MemoryTimelineOptions::max_phases`.
const MAX_TIMELINE_PHASES: usize = 200;

pub struct MemoryTimelineOptions {
    /// Span ID whose time range to cover and whose children are the phases,
    /// as produced by `SpanInfo::id`. `None` covers the whole trace, with the
    /// top-level spans as phases. For an aggregated group, the children of
    /// every member.
    pub parent: Option<String>,
    /// Absolute start in internal ticks, overriding the parent's.
    pub start: Option<u64>,
    /// Absolute end in internal ticks, overriding the parent's.
    pub end: Option<u64>,
    /// Number of samples to downsample to. Clamped to `MAX_TIMELINE_SAMPLES`.
    pub max_samples: Option<usize>,
    /// Number of phases to return, the ones with the largest corrected
    /// duration. Clamped to `MAX_TIMELINE_PHASES`.
    pub max_phases: Option<usize>,
}

/// A reading at one point in time. `ts` is absolute, in internal ticks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemoryReading {
    pub ts: u64,
    /// Bytes the allocator has committed from the OS.
    pub bytes: u64,
    /// Process memory footprint (RSS) in bytes (0 = not reported).
    pub footprint: u64,
}

/// A span running in the timeline's range.
///
/// Always a single span, never an aggregated group: a group's extent covers
/// the gaps between its members, so it would mark a phase where none ran.
pub struct TimelinePhase {
    /// Raw span ID, usable as a `parent`.
    pub id: String,
    pub name: String,
    /// Absolute start in internal ticks.
    pub start: u64,
    /// Absolute end in internal ticks.
    pub end: u64,
    /// Concurrency-corrected duration.
    pub corrected_duration: u64,
    /// Interpolated memory at `start`.
    pub memory_at_start: Option<MemoryPoint>,
    /// Interpolated memory at `end`.
    pub memory_at_end: Option<MemoryPoint>,
    /// Largest committed-bytes sample between `start` and `end`.
    pub peak_bytes: Option<u64>,
    /// Largest footprint sample between `start` and `end`.
    pub peak_footprint: Option<u64>,
}

pub struct MemoryTimeline {
    /// Absolute start of the covered range, in internal ticks.
    pub start: u64,
    /// Absolute end of the covered range, in internal ticks.
    pub end: u64,
    /// `(ts, bytes, pressure, footprint, active_worker_threads)`, downsampled
    /// like `SpanInfo::memory_samples`.
    pub samples: Vec<(u64, u64, u8, u64, u64)>,
    /// Number of samples in the range before downsampling.
    pub raw_sample_count: usize,
    /// The sample with the most committed bytes.
    pub peak_bytes: Option<MemoryReading>,
    /// The sample with the largest footprint.
    pub peak_footprint: Option<MemoryReading>,
    /// The sample where footprint minus committed bytes is largest. A positive
    /// gap is memory the process holds outside the allocator's committed pages
    /// (stacks, mapped files, other allocators); a negative one means
    /// committed pages that aren't resident (never touched, or swapped or
    /// compressed). `None` when the platform doesn't report footprint.
    pub max_gap: Option<MemoryReading>,
    /// The phases with the largest corrected duration, in start order.
    pub phases: Vec<TimelinePhase>,
}

pub fn memory_timeline(store: &StoreContainer, options: MemoryTimelineOptions) -> MemoryTimeline {
    wait_for_data(store);

    let store_guard = store.read();
    let store_ref = &*store_guard;
    let max_samples = options
        .max_samples
        .unwrap_or(DEFAULT_TIMELINE_SAMPLES)
        .clamp(1, MAX_TIMELINE_SAMPLES);
    let max_phases = options
        .max_phases
        .unwrap_or(DEFAULT_TIMELINE_PHASES)
        .min(MAX_TIMELINE_PHASES);

    let parent = Parent::resolve(store_ref, options.parent.as_deref());
    let (default_start, default_end) = match (&parent, options.parent.as_deref()) {
        (Some(parent), Some(_)) => parent.extent(),
        // The whole trace: wherever there are samples, or the spans' range.
        _ => store_ref
            .memory_sample_range()
            .unwrap_or_else(|| (Timestamp::ZERO, store_ref.root_span().end())),
    };
    let start = options.start.map_or(default_start, Timestamp::from_value);
    let end = options.end.map_or(default_end, Timestamp::from_value);

    let raw = store_ref.memory_samples_slice(start, end);
    let reading = |&(ts, bytes, _, footprint, _): &(Timestamp, u64, u8, u64, u64)| MemoryReading {
        ts: *ts,
        bytes,
        footprint,
    };
    let peak_bytes = raw.iter().max_by_key(|sample| sample.1).map(reading);
    let peak_footprint = raw
        .iter()
        .filter(|sample| sample.3 > 0)
        .max_by_key(|sample| sample.3)
        .map(reading);
    let max_gap = raw
        .iter()
        .filter(|sample| sample.3 > 0)
        // Signed, since committed pages that were never touched or were
        // swapped out make footprint smaller than committed bytes.
        .max_by_key(|sample| sample.3 as i128 - sample.1 as i128)
        .map(reading);

    let samples = store_ref
        .memory_samples_for_range_downsampled(start, end, max_samples)
        .into_iter()
        .map(|(ts, mem, pressure, footprint, workers)| (*ts, mem, pressure, footprint, workers))
        .collect();

    let mut phases: Vec<_> = parent
        .map(|parent| parent.members())
        .unwrap_or_default()
        .iter()
        .flat_map(|span| span.children())
        .filter(|span| span.start() <= end && span.end() >= start)
        .collect();
    phases.sort_by_key(|span| Reverse(span.corrected_total_time()));
    phases.truncate(max_phases);
    phases.sort_by_key(|span| span.start());
    let phases = phases
        .into_iter()
        .map(|span| {
            let (cat, title) = span.nice_name();
            let (phase_start, phase_end) = (span.start(), span.end());
            let in_phase = store_ref.memory_samples_slice(phase_start, phase_end);
            TimelinePhase {
                id: build_span_id(options.parent.as_deref(), &span.index.to_string()),
                name: format_span_name(cat, title),
                start: *phase_start,
                end: *phase_end,
                corrected_duration: *span.corrected_total_time(),
                memory_at_start: MemoryPoint::at(store_ref, phase_start),
                memory_at_end: MemoryPoint::at(store_ref, phase_end),
                peak_bytes: in_phase.iter().map(|sample| sample.1).max(),
                peak_footprint: in_phase.iter().map(|sample| sample.3).max(),
            }
        })
        .collect();

    MemoryTimeline {
        start: *start,
        end: *end,
        samples,
        raw_sample_count: raw.len(),
        peak_bytes,
        peak_footprint,
        max_gap,
        phases,
    }
}
