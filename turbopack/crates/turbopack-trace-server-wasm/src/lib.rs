use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use napi::{
    Result,
    bindgen_prelude::{Env, Function, FunctionRef, Uint8Array},
};
use napi_derive::napi;
use turbopack_trace_server::{protocol::ProtocolSession, store_container::StoreContainer};

mod input;
use input::TraceInput;

#[cfg(target_family = "wasm")]
#[global_allocator]
static ALLOC: talc::sync::TalcLock<
    spinning_top::RawSpinlock,
    talc::wasm::WasmGrowAndClaim,
    talc::wasm::WasmBinning,
> = talc::sync::TalcLock::new(talc::wasm::WasmGrowAndClaim);

const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
static RAYON_THREAD_COUNT: Mutex<Option<usize>> = Mutex::new(None);

/// Configures the global Rayon pool before any trace query initializes it.
#[napi]
pub fn configure_rayon_thread_pool(thread_count: u32) -> Result<u32> {
    if thread_count == 0 {
        return Err(napi::Error::from_reason(
            "Rayon thread count must be greater than zero",
        ));
    }
    let thread_count = thread_count as usize;

    let mut configured_thread_count = RAYON_THREAD_COUNT
        .lock()
        .map_err(|_| napi::Error::from_reason("Rayon thread pool configuration lock poisoned"))?;
    if let Some(configured_thread_count) = *configured_thread_count {
        if configured_thread_count == thread_count {
            return Ok(thread_count as u32);
        }
        return Err(napi::Error::from_reason(format!(
            "Rayon thread pool is already configured with {configured_thread_count} threads"
        )));
    }

    rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .build_global()
        .map_err(|error| {
            napi::Error::from_reason(format!("failed to configure Rayon thread pool: {error}"))
        })?;
    *configured_thread_count = Some(thread_count);

    Ok(thread_count as u32)
}

#[napi(object)]
pub struct TraceLoadProgress {
    pub bytes_read: f64,
    pub uncompressed_bytes_read: f64,
    pub elapsed_ms: f64,
    pub bytes_per_second: f64,
    pub stats: String,
}

/// In-memory implementation of the turbo trace viewer protocol.
#[napi]
pub struct TurbopackTraceServer {
    session: ProtocolSession,
    input: TraceInput,
    on_progress: Option<FunctionRef<TraceLoadProgress, ()>>,
    started: Instant,
    last_reported: Option<Duration>,
    bytes_read: usize,
}

#[napi]
impl TurbopackTraceServer {
    /// Creates an empty trace server. Feed raw or gzip-compressed bytes with `read`.
    #[napi(constructor)]
    pub fn new(on_progress: Option<Function<'_, TraceLoadProgress, ()>>) -> Result<Self> {
        let on_progress = on_progress
            .map(|on_progress| on_progress.create_ref())
            .transpose()?;
        let store = std::sync::Arc::new(StoreContainer::new());
        let input = TraceInput::new(store.clone());

        Ok(Self {
            session: ProtocolSession::new(store),
            input,
            on_progress,
            started: Instant::now(),
            last_reported: None,
            bytes_read: 0,
        })
    }

    /// Incrementally adds raw or gzip-compressed trace bytes.
    #[napi]
    pub fn read(&mut self, env: Env, trace: Uint8Array) -> Result<()> {
        self.bytes_read += trace.len();
        self.input.push(trace.as_ref()).map_err(|error| {
            napi::Error::from_reason(format!("failed to read Turbopack trace: {error:#}"))
        })?;

        let elapsed = self.started.elapsed();
        if self
            .last_reported
            .is_some_and(|last_reported| elapsed.saturating_sub(last_reported) < PROGRESS_INTERVAL)
        {
            return Ok(());
        }
        self.last_reported = Some(elapsed);

        if let Some(on_progress) = &self.on_progress {
            let elapsed_ms = elapsed.as_secs_f64() * 1000.0;
            let bytes_read = self.bytes_read as f64;
            on_progress.borrow_back(&env)?.call(TraceLoadProgress {
                bytes_read,
                uncompressed_bytes_read: self.input.uncompressed_bytes_read() as f64,
                elapsed_ms,
                bytes_per_second: if elapsed_ms > 0.0 {
                    bytes_read * 1000.0 / elapsed_ms
                } else {
                    0.0
                },
                stats: self.input.stats(),
            })?;
        }

        Ok(())
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
