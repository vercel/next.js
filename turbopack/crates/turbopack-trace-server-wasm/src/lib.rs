use std::{
    ops::ControlFlow,
    time::{Duration, Instant},
};

use napi::{
    Result,
    bindgen_prelude::{Function, Uint8Array},
};
use napi_derive::napi;
use turbopack_trace_server::{
    protocol::ProtocolSession, read_trace_bytes, read_trace_bytes_with_progress,
};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

#[napi(object)]
pub struct TraceLoadProgress {
    pub bytes_read: f64,
    pub total_bytes: f64,
    pub uncompressed_bytes_read: f64,
    pub percentage: f64,
    pub elapsed_ms: f64,
    pub bytes_per_second: f64,
    pub eta_ms: Option<f64>,
    pub stats: String,
    pub done: bool,
}

/// In-memory implementation of the turbo trace viewer protocol.
#[napi]
pub struct TurbopackTraceServer {
    session: ProtocolSession,
}

#[napi]
impl TurbopackTraceServer {
    /// Loads a complete raw or gzip-compressed trace, optionally reporting progress.
    #[napi(constructor)]
    pub fn new(
        trace: Uint8Array,
        on_progress: Option<Function<'_, TraceLoadProgress, ()>>,
    ) -> Result<Self> {
        let started = Instant::now();
        let mut last_reported = Duration::ZERO;
        let mut callback_error = None;
        let store = if let Some(on_progress) = on_progress {
            read_trace_bytes_with_progress(trace.as_ref(), |progress| {
                let elapsed = started.elapsed();
                if !progress.done && elapsed.saturating_sub(last_reported) < PROGRESS_INTERVAL {
                    return ControlFlow::Continue(());
                }
                last_reported = elapsed;

                let bytes_read = progress.bytes_read as f64;
                let total_bytes = progress.total_bytes as f64;
                let elapsed_ms = elapsed.as_secs_f64() * 1000.0;
                let bytes_per_second = if elapsed_ms > 0.0 {
                    bytes_read * 1000.0 / elapsed_ms
                } else {
                    0.0
                };
                let eta_ms = if bytes_read > 0.0 && bytes_read < total_bytes {
                    Some(elapsed_ms * (total_bytes - bytes_read) / bytes_read)
                } else {
                    None
                };

                if let Err(error) = on_progress.call(TraceLoadProgress {
                    bytes_read,
                    total_bytes,
                    uncompressed_bytes_read: progress.uncompressed_bytes_read as f64,
                    percentage: if total_bytes > 0.0 {
                        bytes_read * 100.0 / total_bytes
                    } else {
                        100.0
                    },
                    elapsed_ms,
                    bytes_per_second,
                    eta_ms,
                    stats: progress.stats(),
                    done: progress.done,
                }) {
                    callback_error = Some(error);
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            })
        } else {
            read_trace_bytes(trace.as_ref())
        };

        if let Some(error) = callback_error {
            return Err(error);
        }
        let store = store.map_err(|error| {
            napi::Error::from_reason(format!("failed to load Turbopack trace: {error:#}"))
        })?;
        Ok(Self {
            session: ProtocolSession::new(store),
        })
    }

    /// Handles one existing trace viewer client message and returns the
    /// serialized server messages in wire-protocol order.
    #[napi]
    pub fn handle_message(&mut self, message: String) -> Result<Vec<String>> {
        self.session.handle_text(&message).map_err(|error| {
            napi::Error::from_reason(format!("failed to handle trace viewer message: {error:#}"))
        })
    }
}
