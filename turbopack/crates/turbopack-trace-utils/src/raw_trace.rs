use std::{
    borrow::Cow,
    cell::Cell,
    fmt::Write,
    marker::PhantomData,
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Instant,
};

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
    tracing::{TraceRow, TraceValue},
};

/// 10ms in microseconds
const MEMORY_SAMPLE_INTERVAL_US: u64 = 10_000;

/// 1000ms in microseconds. Reading the process memory footprint is a syscall
/// (or a `/proc` read on Linux), so it is refreshed less often than the other
/// memory sample values; samples in between repeat the last reading.
const MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US: u64 = 1_000_000;

static GLOBAL_LAST_MEMORY_SAMPLE: AtomicU64 = AtomicU64::new(0);

static MEMORY_FOOTPRINT_THROTTLE: FootprintThrottle = FootprintThrottle::new();

/// Caches the process memory footprint and refreshes it at most once per
/// [`MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US`].
struct FootprintThrottle {
    /// Timestamp of the last claimed read, or [`FootprintThrottle::NEVER`].
    last_read_ts: AtomicU64,
    /// The most recently read value (`0` until the first read completes).
    value: AtomicU64,
}

impl FootprintThrottle {
    const NEVER: u64 = u64::MAX;

    const fn new() -> Self {
        Self {
            last_read_ts: AtomicU64::new(Self::NEVER),
            value: AtomicU64::new(0),
        }
    }

    /// Returns the footprint for a sample at `ts`. Calls `read` only when no
    /// read happened yet or the last one is at least
    /// [`MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US`] old, and only if this caller
    /// wins the claim on `last_read_ts`. All other callers (including
    /// concurrent ones while a read is in progress) get the cached value.
    fn get(&self, ts: u64, read: impl FnOnce() -> u64) -> u64 {
        let last = self.last_read_ts.load(Ordering::Relaxed);
        if last != Self::NEVER && ts.saturating_sub(last) < MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US {
            return self.value.load(Ordering::Relaxed);
        }
        if self
            .last_read_ts
            .compare_exchange(last, ts, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            // Another caller claimed this read.
            return self.value.load(Ordering::Relaxed);
        }
        let value = read();
        self.value.store(value, Ordering::Relaxed);
        value
    }
}

thread_local! {
    static THREAD_LOCAL_LAST_MEMORY_SAMPLE: Cell<u64> = const { Cell::new(0) };
}

/// Options for [`RawTraceLayer`].
#[derive(Clone, Debug)]
pub struct RawTraceLayerOptions {
    /// Track memory: write the per-thread allocation counters on every span enter and exit
    /// (`AllocationCounters` rows) and periodic process memory samples (`MemorySample` rows).
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

/// A tracing layer that writes raw trace data to a writer. We store data using the [`TraceRow`],
/// serialized with [`postcard`].
pub struct RawTraceLayer<S: Subscriber + for<'a> LookupSpan<'a>> {
    trace_writer: TraceWriter,
    start: Instant,
    next_id: AtomicU64,
    memory: bool,
    _phantom: PhantomData<fn(S)>,
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
            _phantom: PhantomData,
        }
    }

    fn write(&self, data: TraceRow<'_>) {
        let start = TurboMalloc::allocation_counters();
        let guard = self.trace_writer.start_write();
        postcard::serialize_with_flavor(&data, WriteGuardFlavor { guard }).unwrap();
        TurboMalloc::reset_allocation_counters(start);
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
                let memory_footprint = MEMORY_FOOTPRINT_THROTTLE.get(ts, || {
                    TurboMalloc::memory_footprint()
                        .map(|v| v as u64)
                        .unwrap_or(0)
                });
                self.write(TraceRow::MemorySample {
                    ts,
                    memory,
                    memory_pressure,
                    memory_footprint,
                    active_worker_threads: active_worker_threads() as u64,
                });
            }
            Err(actual) => {
                // Lost the race; update thread-local with the winner's timestamp
                THREAD_LOCAL_LAST_MEMORY_SAMPLE.with(|tl| tl.set(actual));
            }
        }
    }

    fn report_allocations(&self, ts: u64, thread_id: u64) {
        let allocation_counters = turbo_tasks_malloc::TurboMalloc::allocation_counters();
        self.write(TraceRow::AllocationCounters {
            ts,
            thread_id,
            allocations: allocation_counters.allocations as u64,
            deallocations: allocation_counters.deallocations as u64,
            allocation_count: allocation_counters.allocation_count as u64,
            deallocation_count: allocation_counters.deallocation_count as u64,
        });
    }
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> Layer<S> for RawTraceLayer<S> {
    fn on_new_span(
        &self,
        attrs: &span::Attributes<'_>,
        id: &span::Id,
        ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let ts = self.start.elapsed().as_micros() as u64;
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
        let ts = self.start.elapsed().as_micros() as u64;
        self.write(TraceRow::End {
            ts,
            id: get_id(ctx, &id),
        });
    }

    fn on_enter(&self, id: &span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.start.elapsed().as_micros() as u64;
        let thread_id = thread::current().id().as_u64().into();
        if self.memory {
            self.maybe_report_memory_sample(ts);
            self.report_allocations(ts, thread_id);
        }
        self.write(TraceRow::Enter {
            ts,
            id: get_id(ctx, id),
            thread_id,
        });
    }

    fn on_exit(&self, id: &span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.start.elapsed().as_micros() as u64;
        let thread_id = thread::current().id().as_u64().into();
        if self.memory {
            self.report_allocations(ts, thread_id);
        }
        self.write(TraceRow::Exit {
            ts,
            id: get_id(ctx, id),
            thread_id,
        });
    }

    fn on_event(&self, event: &tracing::Event<'_>, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.start.elapsed().as_micros() as u64;
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
        sync::{
            Arc, Barrier, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
        thread,
        time::Duration,
    };

    use tracing_subscriber::{Registry, layer::SubscriberExt};

    use crate::{
        raw_trace::{
            FootprintThrottle, MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US, RawTraceLayer,
            RawTraceLayerOptions,
        },
        trace_writer::TraceWriter,
        tracing::TraceRow,
    };

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
    /// returns the complete trace file content.
    pub(crate) fn capture(options: RawTraceLayerOptions, f: impl FnOnce()) -> Vec<u8> {
        let buffer = SharedBuffer::default();
        let (trace_writer, guard) = TraceWriter::new(buffer.clone());
        let subscriber =
            Registry::default().with(RawTraceLayer::with_options(trace_writer, options));
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

    #[test]
    fn writes_allocation_counters_by_default() {
        let data = capture(RawTraceLayerOptions::default(), enter_exit_span);
        let rows = decode(&data);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Enter { .. })), 1);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Exit { .. })), 1);
        assert_eq!(
            count(&rows, |r| matches!(r, TraceRow::AllocationCounters { .. })),
            2
        );
    }

    #[test]
    fn memory_tracking_can_be_disabled() {
        let data = capture(RawTraceLayerOptions { memory: false }, enter_exit_span);
        let rows = decode(&data);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Start { .. })), 1);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Enter { .. })), 1);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::Exit { .. })), 1);
        assert_eq!(count(&rows, |r| matches!(r, TraceRow::End { .. })), 1);
        assert_eq!(
            count(&rows, |r| matches!(
                r,
                TraceRow::AllocationCounters { .. }
                    | TraceRow::Allocation { .. }
                    | TraceRow::MemorySample { .. }
            )),
            0
        );
    }

    #[test]
    fn footprint_is_read_at_most_once_per_interval() {
        let throttle = FootprintThrottle::new();
        let reads = Cell::new(0);
        let read = |value: u64| {
            reads.set(reads.get() + 1);
            value
        };

        // The very first sample reads, even at ts 0.
        assert_eq!(throttle.get(0, || read(100)), 100);
        assert_eq!(reads.get(), 1);

        // Within the interval the cached value is reused.
        assert_eq!(throttle.get(10_000, || read(200)), 100);
        assert_eq!(
            throttle.get(MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US - 1, || read(300)),
            100
        );
        assert_eq!(reads.get(), 1);

        // Once the interval has elapsed it reads again.
        assert_eq!(
            throttle.get(MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US, || read(400)),
            400
        );
        assert_eq!(reads.get(), 2);
        assert_eq!(
            throttle.get(MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US + 10_000, || read(500)),
            400
        );
        assert_eq!(reads.get(), 2);
    }

    #[test]
    fn concurrent_caller_during_a_read_gets_cached_value() {
        let throttle = FootprintThrottle::new();
        assert_eq!(throttle.get(0, || 100), 100);

        // While the claimed read for the next interval is in progress, another
        // caller (simulated by a nested call) must not read and gets the
        // previous value.
        let ts = MEMORY_FOOTPRINT_SAMPLE_INTERVAL_US;
        let value = throttle.get(ts, || {
            let nested = throttle.get(ts + 10_000, || panic!("must not read concurrently"));
            assert_eq!(nested, 100);
            200
        });
        assert_eq!(value, 200);
        assert_eq!(throttle.get(ts + 20_000, || panic!("cached")), 200);
    }

    #[test]
    fn simultaneous_first_calls_read_once() {
        const THREADS: usize = 8;
        let throttle = FootprintThrottle::new();
        let reads = AtomicUsize::new(0);
        let barrier = Barrier::new(THREADS);

        let values: Vec<u64> = thread::scope(|scope| {
            let handles: Vec<_> = (0..THREADS)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        throttle.get(0, || {
                            reads.fetch_add(1, Ordering::Relaxed);
                            // Keep the read in progress while the others race.
                            thread::sleep(Duration::from_millis(20));
                            100
                        })
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        assert_eq!(reads.load(Ordering::Relaxed), 1);
        // The winner gets the fresh value; losers get the (initially 0) cache.
        assert!(values.iter().all(|&v| v == 0 || v == 100), "{values:?}");
        assert!(values.contains(&100), "{values:?}");
        assert_eq!(throttle.get(10_000, || panic!("cached")), 100);
    }
}
