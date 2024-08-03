use dashmap::DashMap;
use signposter::{Log, LogCategory, Signpost, SignpostInterval};
use tracing::{span, subscriber::Subscriber, Event, Id};
use tracing_subscriber::{layer::Context, Layer};

/// A [`tracing::Layer`] implementation that emits signposts for each span and
/// event.
pub struct SignpostLayer {
    signposts: DashMap<Id, SignpostDescriptor>,
    current_intervals: DashMap<Id, SignpostInterval>,
    log: Log,
}

impl Default for SignpostLayer {
    /// Create a new `SignpostLayer`.
    fn default() -> SignpostLayer {
        SignpostLayer {
            signposts: Default::default(),
            current_intervals: Default::default(),
            log: Log::new_with_subsystem_and_category(
                "com.global.Global",
                LogCategory::PointsOfInterest,
            ),
        }
    }
}

impl<S> Layer<S> for SignpostLayer
where
    S: Subscriber,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor: KeyValueVisitor = KeyValueVisitor::new();

        event.record(&mut visitor);

        self.log
            .signpost()
            .event_with_message(event.metadata().name(), &visitor.output);
    }

    fn on_new_span(&self, attrs: &span::Attributes<'_>, id: &span::Id, _ctx: Context<'_, S>) {
        let mut visitor: KeyValueVisitor = KeyValueVisitor::new();

        attrs.record(&mut visitor);

        self.signposts.insert(
            id.clone(),
            SignpostDescriptor {
                name: attrs.metadata().name().to_string(),
                description: visitor.output,
                signpost: self.log.signpost(),
            },
        );
    }

    fn on_enter(&self, id: &span::Id, _ctx: Context<'_, S>) {
        let signpost = self.signposts.get(id).unwrap();
        self.current_intervals.insert(
            id.clone(),
            signpost
                .signpost
                .interval_with_message(&signpost.name, &signpost.description),
        );
    }

    fn on_exit(&self, id: &span::Id, _ctx: Context<'_, S>) {
        let (_, interval) = self.current_intervals.remove(id).unwrap();
        interval.end();
    }
}

struct SignpostDescriptor {
    name: String,
    description: String,
    signpost: Signpost,
}

use std::fmt;

use tracing::field::{Field, Visit};

struct KeyValueVisitor {
    output: String,
    first: bool,
}

impl KeyValueVisitor {
    fn new() -> Self {
        KeyValueVisitor {
            output: String::new(),
            first: true,
        }
    }
}

impl Visit for KeyValueVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        self.record_any(field, format!("{:?}", value));
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.record_any(field, value.to_string());
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.record_any(field, value.to_string());
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.record_any(field, value.to_string());
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.record_any(field, value.to_string());
    }
}

impl KeyValueVisitor {
    fn record_any<T: fmt::Display>(&mut self, field: &Field, value: T) {
        if !self.first {
            self.output.push_str(", ");
        } else {
            self.first = false;
        }

        self.output
            .push_str(&format!("{}: {}", field.name(), value));
    }
}
