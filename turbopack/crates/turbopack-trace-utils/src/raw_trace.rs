use std::{
    borrow::Cow, fmt::Write, marker::PhantomData, sync::atomic::AtomicU64, thread, time::Instant,
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
    trace_writer::TraceWriter,
    tracing::{TraceRow, TraceValue},
};

pub struct RawTraceLayerOptions {}

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

/// A tracing layer that writes raw trace data to a writer. The data format is
/// defined by [FullTraceRow].
pub struct RawTraceLayer<S: Subscriber + for<'a> LookupSpan<'a>> {
    trace_writer: TraceWriter,
    start: Instant,
    next_id: AtomicU64,
    _phantom: PhantomData<fn(S)>,
}

impl<S: Subscriber + for<'a> LookupSpan<'a>> RawTraceLayer<S> {
    pub fn new(trace_writer: TraceWriter) -> Self {
        Self {
            trace_writer,
            start: Instant::now(),
            next_id: AtomicU64::new(1),
            _phantom: PhantomData,
        }
    }

    fn write(&self, data: TraceRow<'_>) {
        let start = TurboMalloc::allocation_counters();
        let guard = self.trace_writer.start_write();
        postcard::serialize_with_flavor(&data, WriteGuardFlavor { guard }).unwrap();
        TurboMalloc::reset_allocation_counters(start);
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
        self.report_allocations(ts, thread_id);
        self.write(TraceRow::Enter {
            ts,
            id: get_id(ctx, id),
            thread_id,
        });
    }

    fn on_exit(&self, id: &span::Id, ctx: tracing_subscriber::layer::Context<'_, S>) {
        let ts = self.start.elapsed().as_micros() as u64;
        let thread_id = thread::current().id().as_u64().into();
        self.report_allocations(ts, thread_id);
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
