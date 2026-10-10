use std::{
    borrow::Cow,
    cell::{Cell, RefCell, RefMut},
    fmt::Write,
    marker::PhantomData,
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Instant,
};

use thread_local::ThreadLocal;
use tracing::{
    Subscriber,
    field::{Visit, display},
    span,
};
use tracing_subscriber::{Layer, registry::LookupSpan};
use turbo_tasks_malloc::TurboMalloc;

use crate::{
    flavor::WriteGuardFlavor,
    tokio_workers::active_worker_threads,
    trace_writer::TraceWriter,
    tracing::{Allocations, TraceRow, TraceValue},
};

/// 10ms in microseconds
const MEMORY_SAMPLE_INTERVAL_US: u64 = 10_000;

static GLOBAL_LAST_MEMORY_SAMPLE: AtomicU64 = AtomicU64::new(0);

thread_local! {
    static THREAD_LOCAL_LAST_MEMORY_SAMPLE: Cell<u64> = const { Cell::new(0) };
}

/// Options for [`RawTraceLayer`].
#[derive(Clone, Debug)]
pub struct RawTraceLayerOptions {
    /// Track memory: attach the per-thread allocation counters to every span enter and exit
    /// and write periodic process memory samples (`MemorySample` rows).
    /// These make up a large part of the trace size, so disabling them significantly reduces
    /// trace file size, at the cost of losing all memory information. Defaults to `true`.
    pub memory: bool,
}

impl Default for RawTraceLayerOptions {
    fn default() -> Self {
        Self { memory: true }
    }
}

struct RawTraceLayerExtension {
    id: u64,
}

fn get_id<S: Subscriber + for<'a> LookupSpan<'a>>(
    ctx: tracing_subscriber::layer::Context<'_, S>,
    id: &span::Id,
) -> u64 {
    ctx.span(id)
        .unwrap()
        .extensions()
        .get::<RawTraceLayerExtension>()
        .unwrap()
        .id
}

/// The maximum gap between an `Exit` and the next `Enter` of the same span for which both rows
/// are omitted. `entered` is the time between the last `Enter` row written on the thread (of any
/// span, omitted `Enter` rows don't count) and the `Exit`.
///
/// Omitting the rows makes the trace show the span as entered during the gap, so its self time
/// gains the gap. This is bounded to 1µs (the timestamp resolution) or 0.1% of the preceding
/// entered interval (which includes time spent in nested spans and earlier omitted gaps). For
/// nested spans, the last `Enter` on the thread can be of a nested span, which is later than the
/// span's own `Enter`, so that only makes the allowed gap smaller.
fn max_exit_enter_gap(entered: u64) -> u64 {
    (entered / 1000).max(1)
}

/// A tracing layer that writes raw trace data to a writer. We store data using the [`TraceRow`],
/// serialized with [`postcard`].
pub struct RawTraceLayer<S: Subscriber + for<'a> LookupSpan<'a>> {
    trace_writer: TraceWriter,
    start: Instant,
    next_id: AtomicU64,
    memory: bool,
    /// Reads the allocation counters of the current thread. Only replaced in tests.
    allocation_counters: fn() -> Allocations,
    /// Returns the current timestamp in microseconds since `start`. Only replaced in tests.
    clock: fn(Instant) -> u64,
    threads: ThreadLocal<RefCell<ThreadState>>,
    _phantom: PhantomData<fn(S)>,
}

/// Per-thread state of the [`RawTraceLayer`].
#[derive(Default)]
struct ThreadState {
    /// The thread this state belongs to. Slots of [`ThreadLocal`] are reused by new threads
    /// after a thread exited, so the state is reset when this doesn't match.
    thread_id: u64,
    /// The allocation counters of the thread at the time they were last reported.
    reported_allocations: Option<Allocations>,
    /// The timestamp of the last `Enter` row written on this thread, of any span. Omitted `Enter`
    /// rows don't update it. See [`max_exit_enter_gap`].
    last_enter_ts: Option<u64>,
    /// The last `Exit` row written on this thread. It can be removed again when it's followed
    /// by an `Enter` of the same span shortly after, see [`max_exit_enter_gap`]. The row is
    /// marked with the span id, see [`crate::trace_writer::WriteGuard::mark`].
    last_exit: Option<LastExit>,
}

#[derive(Clone, Copy)]
struct LastExit {
    id: u64,
    ts: u64,
    /// [`ThreadState::reported_allocations`] before the `Exit` row was written.
    reported_allocations_before: Option<Allocations>,
}

fn thread_allocation_counters() -> Allocations {
    let counters = TurboMalloc::allocation_counters();
    Allocations {
        allocations: counters.allocations as u64,
        allocation_count: counters.allocation_count as u64,
        deallocations: counters.deallocations as u64,
        deallocation_count: counters.deallocation_count as u64,
    }
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> RawTraceLayer<S> {
    /// Creates a layer with the default [`RawTraceLayerOptions`].
    pub fn new(trace_writer: TraceWriter) -> Self {
        Self::with_options(trace_writer, RawTraceLayerOptions::default())
    }

    pub fn with_options(trace_writer: TraceWriter, options: RawTraceLayerOptions) -> Self {
        let RawTraceLayerOptions { memory } = options;
        Self {
            trace_writer,
            start: Instant::now(),
            next_id: AtomicU64::new(1),
            memory,
            allocation_counters: thread_allocation_counters,
            clock: |start| start.elapsed().as_micros() as u64,
            threads: ThreadLocal::new(),
            _phantom: PhantomData,
        }
    }

    fn now(&self) -> u64 {
        (self.clock)(self.start)
    }

    /// Returns the state of the current thread, which has the id `thread_id`.
    fn thread_state(&self, thread_id: u64) -> RefMut<'_, ThreadState> {
        let mut state = self.threads.get_or_default().borrow_mut();
        if state.thread_id != thread_id {
            *state = ThreadState {
                thread_id,
                ..Default::default()
            };
        }
        state
    }

    fn write(&self, data: TraceRow<'_>) {
        let start = TurboMalloc::allocation_counters();
        let mut guard = self.trace_writer.start_write();
        postcard::serialize_with_flavor(&data, WriteGuardFlavor { guard: &mut guard }).unwrap();
        drop(guard);
        TurboMalloc::reset_allocation_counters(start);
    }

    /// Writes a row and marks it with `marker`, so that it can be removed by the next write on
    /// this thread. See [`crate::trace_writer::WriteGuard::mark`].
    fn write_marked(&self, data: TraceRow<'_>, marker: u64) {
        let start = TurboMalloc::allocation_counters();
        let mut guard = self.trace_writer.start_write();
        guard.mark(marker, |guard| {
            postcard::serialize_with_flavor(&data, WriteGuardFlavor { guard }).unwrap()
        });
        drop(guard);
        TurboMalloc::reset_allocation_counters(start);
    }

    /// Removes the last row written on this thread, if it is still in the thread local buffer
    /// and is marked with `marker`. Returns `true` when it was removed.
    fn remove_last_row(&self, marker: u64) -> bool {
        let start = TurboMalloc::allocation_counters();
        let mut guard = self.trace_writer.start_write();
        let removed = guard.remove_last_row(marker);
        drop(guard);
        TurboMalloc::reset_allocation_counters(start);
        removed
    }

    fn maybe_report_memory_sample(&self, ts: u64) {
        // Fast thread-local check
        let skip = THREAD_LOCAL_LAST_MEMORY_SAMPLE
            .with(|tl| ts.saturating_sub(tl.get()) < MEMORY_SAMPLE_INTERVAL_US);
        if skip {
            return;
        }

        // Check global atomic
        let global_last = GLOBAL_LAST_MEMORY_SAMPLE.load(Ordering::Relaxed);
        if ts.saturating_sub(global_last) < MEMORY_SAMPLE_INTERVAL_US {
            // Another thread sampled recently; update thread-local cache
            THREAD_LOCAL_LAST_MEMORY_SAMPLE.with(|tl| tl.set(global_last));
            return;
        }

        // Try to atomically claim the sample
        match GLOBAL_LAST_MEMORY_SAMPLE.compare_exchange(
            global_last,
            ts,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => {
                // We won the race — write the sample
                THREAD_LOCAL_LAST_MEMORY_SAMPLE.with(|tl| tl.set(ts));
                let memory = TurboMalloc::memory_usage() as u64;
                let memory_pressure = TurboMalloc::memory_pressure().unwrap_or(0);
                self.write(TraceRow::MemorySample {
                    ts,
                    memory,
                    memory_pressure,
                    active_worker_threads: active_worker_threads() as u64,
                });
            }
            Err(actual) => {
                // Lost the race; update thread-local with the winner's timestamp
                THREAD_LOCAL_LAST_MEMORY_SAMPLE.with(|tl| tl.set(actual));
            }
        }
    }

    /// Returns the allocations to attach to an Enter/Exit row: what the current thread
    /// (de)allocated since its previous report, given the `current` counters of the thread.
    /// Returns `None` when memory isn't tracked, on the first report of a thread (which only
    /// establishes the baseline), and when nothing was (de)allocated since the previous report.
    fn allocations(state: &mut ThreadState, current: Option<Allocations>) -> Option<Allocations> {
        let current = current?;
        let previous = state.reported_allocations.replace(current)?;
        let delta = Allocations {
            allocations: current.allocations.saturating_sub(previous.allocations),
            allocation_count: current
                .allocation_count
                .saturating_sub(previous.allocation_count),
            deallocations: current.deallocations.saturating_sub(previous.deallocations),
            deallocation_count: current
                .deallocation_count
                .saturating_sub(previous.deallocation_count),
        };
        (delta != Allocations::default()).then_some(delta)
    }
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> Layer<S> for RawTraceLayer<S> {
    fn on_new_span(
        &self,
        attrs: &span::Attributes<'_>,
        id: &span::Id,
        ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let ts = self.now();
        let mut values = ValuesVisitor::new();
        attrs.values().record(&mut values);
        let external_id = self
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        ctx.span(id)
            .unwrap()
            .extensions_mut()
            .insert(RawTraceLayerExtension { id: external_id });
        self.write(TraceRow::Start {
            ts,
            id: external_id,
            parent: if attrs.is_contextual() {
                ctx.current_span().id().map(|p| get_id(ctx, p))
            } else {
                attrs.parent().map(|p| get_id(ctx, p))
            },
            name: attrs.metadata().name().into(),
            target: attrs.metadata().target().into(),
            values: values.values,
        });
    }

    fn on_close(&self, id: span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.now();
        self.write(TraceRow::End {
            ts,
            id: get_id(ctx, &id),
        });
    }

    fn on_enter(&self, id: &span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Allocations made by the tracing itself are excluded from the counters.
        let malloc_counters = TurboMalloc::allocation_counters();
        let current = self.memory.then(self.allocation_counters);
        let ts = self.now();
        let thread_id = thread::current().id().as_u64().into();
        let id = get_id(ctx, id);
        let enter_allocations = {
            let mut state = self.thread_state(thread_id);
            // An `Exit` directly followed by an `Enter` of the same span (almost) at the same
            // time has (almost) no effect on the trace data, so both rows can be omitted. This is
            // common for async spans, which are exited and entered again on every poll.
            if let Some(last_exit) = state.last_exit.take()
                && last_exit.id == id
                && last_exit.ts <= ts
                && ts
                    <= last_exit.ts.saturating_add(max_exit_enter_gap(
                        last_exit
                            .ts
                            .saturating_sub(state.last_enter_ts.unwrap_or(last_exit.ts)),
                    ))
                // Nothing (de)allocated since the exit, otherwise the `Enter` would need to
                // report it for the span that was running in between
                && state.reported_allocations == current
                // The `Exit` row is marked with the span id
                && self.remove_last_row(id)
            {
                // What the span (de)allocated before the removed `Exit` is reported with the next
                // row of this thread instead. The span is on top of the stack again at that
                // point, so it's still attributed to it.
                state.reported_allocations = last_exit.reported_allocations_before;
                None
            } else {
                state.last_enter_ts = Some(ts);
                Some(Self::allocations(&mut state, current))
            }
        };
        // After the `Exit` row was removed, as the sample would be the last row otherwise
        if self.memory {
            self.maybe_report_memory_sample(ts);
        }
        // `None` when the rows were omitted
        if let Some(allocations) = enter_allocations {
            self.write(TraceRow::Enter {
                ts,
                id,
                thread_id,
                allocations,
            });
        }
        TurboMalloc::reset_allocation_counters(malloc_counters);
    }

    fn on_exit(&self, id: &span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Allocations made by the tracing itself are excluded from the counters.
        let malloc_counters = TurboMalloc::allocation_counters();
        let current = self.memory.then(self.allocation_counters);
        let ts = self.now();
        let thread_id = thread::current().id().as_u64().into();
        let id = get_id(ctx, id);
        let allocations = {
            let mut state = self.thread_state(thread_id);
            let reported_allocations_before = state.reported_allocations;
            let allocations = Self::allocations(&mut state, current);
            state.last_exit = Some(LastExit {
                id,
                ts,
                reported_allocations_before,
            });
            allocations
        };
        self.write_marked(
            TraceRow::Exit {
                ts,
                id,
                thread_id,
                allocations,
            },
            id,
        );
        TurboMalloc::reset_allocation_counters(malloc_counters);
    }

    fn on_event(&self, event: &tracing::Event<'_>, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.now();
        let mut values = ValuesVisitor::new();
        event.record(&mut values);
        self.write(TraceRow::Event {
            ts,
            parent: if event.is_contextual() {
                ctx.current_span().id().map(|p| get_id(ctx, p))
            } else {
                event.parent().map(|p| get_id(ctx, p))
            },
            values: values.values,
        });
    }

    fn on_record(
        &self,
        id: &span::Id,
        record: &span::Record<'_>,
        ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let mut values = ValuesVisitor::new();
        record.record(&mut values);
        self.write(TraceRow::Record {
            id: get_id(ctx, id),
            values: values.values,
        });
    }
}

struct ValuesVisitor {
    values: Vec<(Cow<'static, str>, TraceValue<'static>)>,
}

impl ValuesVisitor {
    fn new() -> Self {
        Self { values: Vec::new() }
    }
}

impl Visit for ValuesVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        let mut str = String::new();
        let _ = write!(str, "{value:?}");
        self.values
            .push((field.name().into(), TraceValue::String(str.into())));
    }

    fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
        self.values
            .push((field.name().into(), TraceValue::Float(value)));
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.values
            .push((field.name().into(), TraceValue::Int(value)));
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.values
            .push((field.name().into(), TraceValue::UInt(value)));
    }

    fn record_i128(&mut self, field: &tracing::field::Field, value: i128) {
        self.record_debug(field, &value)
    }

    fn record_u128(&mut self, field: &tracing::field::Field, value: u128) {
        self.record_debug(field, &value)
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.values
            .push((field.name().into(), TraceValue::Bool(value)));
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.values.push((
            field.name().into(),
            TraceValue::String(value.to_string().into()),
        ));
    }

    fn record_error(
        &mut self,
        field: &tracing::field::Field,
        value: &(dyn std::error::Error + 'static),
    ) {
        self.record_debug(field, &display(value))
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::{
        cell::Cell,
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use tracing_subscriber::{Registry, layer::SubscriberExt};

    use crate::{
        raw_trace::{RawTraceLayer, RawTraceLayerOptions},
        trace_writer::TraceWriter,
        tracing::{Allocations, TraceRow},
    };

    thread_local! {
        /// Fake allocation counters of the current thread, controlled by the test.
        static FAKE_ALLOCATIONS: Cell<Allocations> = const {
            Cell::new(Allocations {
                allocations: 0,
                allocation_count: 0,
                deallocations: 0,
                deallocation_count: 0,
            })
        };
        /// Fake time of the current thread, controlled by the test.
        static FAKE_TIME: Cell<u64> = const { Cell::new(0) };
        /// How much the fake time advances on every read. Tests can set it to 0 to freeze it.
        static FAKE_TIME_STEP: Cell<u64> = const { Cell::new(1) };
    }

    fn fake_clock(_start: std::time::Instant) -> u64 {
        let step = FAKE_TIME_STEP.with(|s| s.get());
        FAKE_TIME.with(|t| {
            let time = t.get();
            t.set(time + step);
            time
        })
    }

    /// Freezes the fake time of the current thread at `time`.
    fn freeze_time(time: u64) {
        FAKE_TIME.with(|t| t.set(time));
        FAKE_TIME_STEP.with(|s| s.set(0));
    }

    fn fake_allocation_counters() -> Allocations {
        FAKE_ALLOCATIONS.with(|c| c.get())
    }

    /// Simulates `count` allocations of `bytes` bytes each on the current thread.
    pub(crate) fn fake_allocate(bytes: u64, count: u64) {
        FAKE_ALLOCATIONS.with(|c| {
            let mut counters = c.get();
            counters.allocations += bytes * count;
            counters.allocation_count += count;
            c.set(counters);
        });
    }

    /// Simulates `count` deallocations of `bytes` bytes each on the current thread.
    pub(crate) fn fake_deallocate(bytes: u64, count: u64) {
        FAKE_ALLOCATIONS.with(|c| {
            let mut counters = c.get();
            counters.deallocations += bytes * count;
            counters.deallocation_count += count;
            c.set(counters);
        });
    }

    #[derive(Clone, Default)]
    struct SharedBuffer(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedBuffer {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    /// Runs `f` with a [`RawTraceLayer`] installed as the thread's default subscriber and
    /// returns the complete trace file content. Allocation counters are read from the fake
    /// counters controlled by [`fake_allocate`] and [`fake_deallocate`].
    pub(crate) fn capture(options: RawTraceLayerOptions, f: impl FnOnce()) -> Vec<u8> {
        FAKE_TIME_STEP.with(|s| s.set(1));
        let buffer = SharedBuffer::default();
        let (trace_writer, guard) = TraceWriter::new(buffer.clone());
        let mut layer = RawTraceLayer::with_options(trace_writer, options);
        layer.allocation_counters = fake_allocation_counters;
        layer.clock = fake_clock;
        let subscriber = Registry::default().with(layer);
        tracing::subscriber::with_default(subscriber, f);
        // Flushes all buffers and waits for the writer thread to finish.
        drop(guard);
        Arc::try_unwrap(buffer.0).unwrap().into_inner().unwrap()
    }

    /// Decodes the rows of a trace file, skipping the header.
    pub(crate) fn decode(data: &[u8]) -> Vec<TraceRow<'_>> {
        let header = b"TRACEv0";
        assert!(data.starts_with(header), "missing trace header");
        let mut remaining = &data[header.len()..];
        let mut rows = Vec::new();
        while !remaining.is_empty() {
            let (row, rest) = postcard::take_from_bytes(remaining).unwrap();
            rows.push(row);
            remaining = rest;
        }
        rows
    }

    fn enter_exit_span() {
        let span = tracing::info_span!("test span");
        let _guard = span.enter();
    }

    fn count(rows: &[TraceRow<'_>], predicate: impl Fn(&TraceRow<'_>) -> bool) -> usize {
        rows.iter().filter(|row| predicate(row)).count()
    }

    /// Returns the allocation counters attached to each Enter/Exit row, in order.
    pub(crate) fn enter_exit_allocations(
        rows: &[TraceRow<'_>],
    ) -> Vec<(&'static str, Option<Allocations>)> {
        rows.iter()
            .filter_map(|row| match row {
                TraceRow::Enter { allocations, .. } => Some(("enter", *allocations)),
                TraceRow::Exit { allocations, .. } => Some(("exit", *allocations)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn attaches_allocation_deltas_to_enter_and_exit() {
        let data = capture(RawTraceLayerOptions::default(), || {
            fake_allocate(10, 1);
            let span = tracing::info_span!("first");
            let guard = span.enter();
            fake_allocate(100, 2);
            fake_deallocate(5, 1);
            drop(guard);
            fake_deallocate(1, 1);
            let span = tracing::info_span!("second");
            let guard = span.enter();
            drop(guard);
            fake_allocate(3, 1);
            let guard = span.enter();
            drop(guard);
        });
        let rows = decode(&data);
        assert_eq!(
            enter_exit_allocations(&rows),
            vec![
                // The first report of the thread is the baseline
                ("enter", None),
                (
                    "exit",
                    Some(Allocations {
                        allocations: 200,
                        allocation_count: 2,
                        deallocations: 5,
                        deallocation_count: 1,
                    })
                ),
                (
                    "enter",
                    Some(Allocations {
                        allocations: 0,
                        allocation_count: 0,
                        deallocations: 1,
                        deallocation_count: 1,
                    })
                ),
                // Nothing (de)allocated in between
                ("exit", None),
                (
                    "enter",
                    Some(Allocations {
                        allocations: 3,
                        allocation_count: 1,
                        deallocations: 0,
                        deallocation_count: 0,
                    })
                ),
                ("exit", None),
            ]
        );
    }

    #[test]
    fn memory_tracking_can_be_disabled() {
        let data = capture(RawTraceLayerOptions { memory: false }, enter_exit_span);
        let rows = decode(&data);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Start { .. })), 1);
        assert_eq!(
            enter_exit_allocations(&rows),
            vec![("enter", None), ("exit", None)]
        );
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::End { .. })), 1);
        assert_eq!(
            count(&rows, |r| matches!(r, TraceRow::MemorySample { .. })),
            0
        );
        assert_eq!(rows.len(), 4);
    }

    /// Returns the Enter/Exit rows as `(kind, span id, ts)` tuples.
    fn enter_exit_rows(rows: &[TraceRow<'_>]) -> Vec<(&'static str, u64, u64)> {
        rows.iter()
            .filter_map(|row| match row {
                TraceRow::Enter { id, ts, .. } => Some(("enter", *id, *ts)),
                TraceRow::Exit { id, ts, .. } => Some(("exit", *id, *ts)),
                _ => None,
            })
            .collect()
    }

    /// Enters and exits the same span twice.
    fn reenter_span(between: impl FnOnce()) {
        let span = tracing::info_span!("span");
        drop(span.enter());
        between();
        drop(span.enter());
    }

    fn assert_not_elided(rows: &[TraceRow<'_>]) {
        let kinds: Vec<_> = enter_exit_rows(rows).iter().map(|r| r.0).collect();
        assert_eq!(kinds, vec!["enter", "exit", "enter", "exit"]);
    }

    #[test]
    fn elides_exit_enter_pair_of_same_span_at_same_timestamp() {
        for memory in [true, false] {
            let data = capture(RawTraceLayerOptions { memory }, || {
                freeze_time(10);
                reenter_span(|| {});
            });
            let rows = decode(&data);
            assert_eq!(
                enter_exit_rows(&rows),
                vec![("enter", 1, 10), ("exit", 1, 10)],
                "memory: {memory}"
            );
            assert_eq!(rows.len(), 4, "memory: {memory}");
        }
    }

    #[test]
    fn keeps_exit_enter_pair_with_larger_gap() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            // Entered for 0µs, so only a gap of up to 1µs is allowed
            reenter_span(|| freeze_time(12));
        });
        assert_not_elided(&decode(&data));
    }

    #[test]
    fn elides_exit_enter_pair_with_1us_gap() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            reenter_span(|| freeze_time(11));
        });
        assert_eq!(
            enter_exit_rows(&decode(&data)),
            vec![("enter", 1, 10), ("exit", 1, 11)]
        );
    }

    /// Enters a span at `enter`, exits it at `exit`, enters it again at `reenter` and exits it
    /// at `reenter + 1000`.
    fn reenter_at(enter: u64, exit: u64, reenter: u64) -> Vec<(&'static str, u64, u64)> {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(enter);
            let span = tracing::info_span!("span");
            let guard = span.enter();
            freeze_time(exit);
            drop(guard);
            freeze_time(reenter);
            let guard = span.enter();
            freeze_time(reenter + 1000);
            drop(guard);
        });
        enter_exit_rows(&decode(&data))
    }

    #[test]
    fn elides_exit_enter_pair_with_gap_up_to_a_thousandth_of_the_entered_duration() {
        assert_eq!(
            reenter_at(0, 3000, 3003),
            vec![("enter", 1, 0), ("exit", 1, 4003)]
        );
        assert_eq!(
            reenter_at(0, 3000, 3004),
            vec![
                ("enter", 1, 0),
                ("exit", 1, 3000),
                ("enter", 1, 3004),
                ("exit", 1, 4004)
            ]
        );
    }

    /// An omitted `Enter` doesn't count as the last `Enter` on the thread, so the entered duration
    /// for the allowed gap keeps growing over chained elisions.
    #[test]
    fn chained_elisions_measure_from_the_last_written_enter() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(0);
            let span = tracing::info_span!("span");
            for (enter, exit) in [(0, 2000), (2002, 3000), (3002, 4000)] {
                freeze_time(enter);
                let guard = span.enter();
                freeze_time(exit);
                drop(guard);
            }
        });
        assert_eq!(
            enter_exit_rows(&decode(&data)),
            vec![
                // The first gap of 2µs is allowed after 2000µs, the second one after 3000µs
                // (measured from the `Enter` at 0, not the omitted one at 2002)
                ("enter", 1, 0),
                ("exit", 1, 4000)
            ]
        );
    }

    /// Memory samples are taken on every `Enter`, even when its row is omitted.
    #[test]
    fn reports_memory_samples_when_the_enter_is_omitted() {
        // Far beyond the timestamps of the other tests, as the last sample time is global
        const START: u64 = 1 << 50;
        let data = capture(RawTraceLayerOptions::default(), || {
            let span = tracing::info_span!("span");
            freeze_time(START);
            let guard = span.enter();
            freeze_time(START + 100_000);
            drop(guard);
            // An omitted `Enter`, long after the sample on the first `Enter`
            drop(span.enter());
        });
        let rows = decode(&data);
        assert_eq!(
            enter_exit_rows(&rows),
            vec![("enter", 1, START), ("exit", 1, START + 100_000)]
        );
        let samples: Vec<_> = rows
            .iter()
            .filter_map(|row| match row {
                TraceRow::MemorySample { ts, .. } => Some(*ts),
                _ => None,
            })
            .collect();
        assert_eq!(samples, vec![START, START + 100_000]);
    }

    /// The entered duration for the allowed gap is measured from the last `Enter` on the thread,
    /// regardless of the span. For nested spans that's shorter than the span's own entered time,
    /// so the allowed gap only shrinks.
    #[test]
    fn measures_the_gap_from_the_last_enter_on_the_thread() {
        let data = capture(RawTraceLayerOptions::default(), || {
            let outer = tracing::info_span!("outer");
            let inner = tracing::info_span!("inner");
            freeze_time(0);
            let outer_guard = outer.enter();
            freeze_time(2000);
            let inner_guard = inner.enter();
            freeze_time(2500);
            drop(inner_guard);
            freeze_time(3000);
            drop(outer_guard);
            // Entered for 3000µs since its own `Enter`, but only 1000µs since the last `Enter` on
            // this thread, so the gap of 2µs is not allowed
            freeze_time(3002);
            let outer_guard = outer.enter();
            freeze_time(4002);
            drop(outer_guard);
        });
        assert_eq!(
            enter_exit_rows(&decode(&data)),
            vec![
                ("enter", 1, 0),
                ("enter", 2, 2000),
                ("exit", 2, 2500),
                ("exit", 1, 3000),
                ("enter", 1, 3002),
                ("exit", 1, 4002)
            ]
        );
    }

    #[test]
    fn keeps_exit_enter_pair_of_different_spans() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            let a = tracing::info_span!("a");
            let b = tracing::info_span!("b");
            drop(a.enter());
            drop(b.enter());
        });
        assert_not_elided(&decode(&data));
    }

    #[test]
    fn keeps_exit_enter_pair_with_allocations_in_between() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            reenter_span(|| fake_allocate(8, 1));
        });
        let rows = decode(&data);
        assert_not_elided(&rows);
        // The allocation is reported with the `Enter`, for whatever ran before
        assert_eq!(
            enter_exit_allocations(&rows)[2],
            (
                "enter",
                Some(Allocations {
                    allocations: 8,
                    allocation_count: 1,
                    deallocations: 0,
                    deallocation_count: 0,
                })
            )
        );
    }

    #[test]
    fn keeps_exit_enter_pair_with_row_in_between() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            reenter_span(|| tracing::info!("event"));
        });
        let rows = decode(&data);
        assert_not_elided(&rows);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Event { .. })), 1);
    }

    #[test]
    fn keeps_exit_enter_pair_on_different_threads() {
        let data = capture(RawTraceLayerOptions::default(), || {
            freeze_time(10);
            let span = tracing::info_span!("span");
            drop(span.enter());
            let dispatch = tracing::dispatcher::get_default(|d| d.clone());
            std::thread::scope(|scope| {
                scope.spawn(|| {
                    freeze_time(10);
                    tracing::dispatcher::with_default(&dispatch, || drop(span.enter()));
                });
            });
        });
        assert_not_elided(&decode(&data));
    }

    #[test]
    fn resets_state_when_a_thread_slot_is_reused() {
        let data = capture(RawTraceLayerOptions::default(), || {
            let span = tracing::info_span!("span");
            let dispatch = tracing::dispatcher::get_default(|d| d.clone());
            // Sequential threads reuse the same thread local slot
            for i in 1..=2 {
                std::thread::scope(|scope| {
                    scope.spawn(|| {
                        freeze_time(10);
                        fake_allocate(1000 * i, 1);
                        tracing::dispatcher::with_default(&dispatch, || drop(span.enter()));
                    });
                });
            }
        });
        let rows = decode(&data);
        // Neither elided across threads nor diffed against the other thread's counters: each
        // thread reports its own baseline (`None`) first.
        assert_eq!(
            enter_exit_allocations(&rows),
            vec![
                ("enter", None),
                ("exit", None),
                ("enter", None),
                ("exit", None)
            ]
        );
        let threads: Vec<_> = rows
            .iter()
            .filter_map(|row| match row {
                TraceRow::Enter { thread_id, .. } => Some(*thread_id),
                _ => None,
            })
            .collect();
        assert_ne!(threads[0], threads[1]);
    }

    #[test]
    fn uses_the_enter_of_the_same_thread_for_the_entered_duration() {
        let data = capture(RawTraceLayerOptions::default(), || {
            let span = tracing::info_span!("span");
            let dispatch = tracing::dispatcher::get_default(|d| d.clone());
            // The span is entered at 0 on this thread and at 2900 on another thread
            freeze_time(0);
            let guard = span.enter();
            std::thread::scope(|scope| {
                scope.spawn(|| {
                    freeze_time(2900);
                    tracing::dispatcher::with_default(&dispatch, || {
                        let _guard = span.enter();
                        freeze_time(2950);
                    });
                });
            });
            freeze_time(3000);
            drop(guard);
            // A gap of 3µs is allowed after 3000µs entered on this thread
            freeze_time(3003);
            drop(span.enter());
        });
        let rows = decode(&data);
        let mut by_thread: Vec<(u64, Vec<(&str, u64)>)> = Vec::new();
        for row in &rows {
            let (kind, thread, ts) = match row {
                TraceRow::Enter { thread_id, ts, .. } => ("enter", *thread_id, *ts),
                TraceRow::Exit { thread_id, ts, .. } => ("exit", *thread_id, *ts),
                _ => continue,
            };
            match by_thread.iter_mut().find(|(t, _)| *t == thread) {
                Some((_, rows)) => rows.push((kind, ts)),
                None => by_thread.push((thread, vec![(kind, ts)])),
            }
        }
        let mut by_thread: Vec<_> = by_thread.into_iter().map(|(_, rows)| rows).collect();
        by_thread.sort();
        assert_eq!(
            by_thread,
            vec![
                // This thread: the re-enter is omitted
                vec![("enter", 0), ("exit", 3003)],
                // The other thread
                vec![("enter", 2900), ("exit", 2950)],
            ]
        );
    }

    #[test]
    fn elision_preserves_allocations_of_the_exited_span() {
        let run = |freeze: bool| {
            let data = capture(RawTraceLayerOptions::default(), || {
                freeze_time(10);
                let span = tracing::info_span!("span");
                let guard = span.enter();
                fake_allocate(50, 1);
                drop(guard);
                if !freeze {
                    // Too large to be elided
                    freeze_time(12);
                }
                let guard = span.enter();
                fake_allocate(7, 1);
                fake_deallocate(3, 1);
                drop(guard);
            });
            let rows = decode(&data);
            let rows_count = enter_exit_rows(&rows).len();
            // All allocations happen inside of the span, so the total of all reports is what
            // is attributed to the span.
            let total = enter_exit_allocations(&rows)
                .into_iter()
                .filter_map(|(_, allocations)| allocations)
                .fold(Allocations::default(), |a, b| Allocations {
                    allocations: a.allocations + b.allocations,
                    allocation_count: a.allocation_count + b.allocation_count,
                    deallocations: a.deallocations + b.deallocations,
                    deallocation_count: a.deallocation_count + b.deallocation_count,
                });
            (rows_count, total)
        };
        let (elided_rows, elided_total) = run(true);
        let (rows, total) = run(false);
        assert_eq!((elided_rows, rows), (2, 4));
        assert_eq!(
            elided_total,
            Allocations {
                allocations: 57,
                allocation_count: 2,
                deallocations: 3,
                deallocation_count: 1,
            }
        );
        assert_eq!(elided_total, total);
    }
}
