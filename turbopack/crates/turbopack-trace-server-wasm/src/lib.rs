use std::{
    io::Write,
    sync::Mutex,
    time::{Duration, Instant},
};

use napi::{
    Result,
    bindgen_prelude::{Env, Function, FunctionRef, Uint8Array},
};
use napi_derive::napi;
use turbopack_trace_server::{
    TraceParser, protocol::ProtocolSession, store_container::StoreContainer,
};

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

enum Compression {
    Undetermined(Vec<u8>),
    Raw,
    Gzip(flate2::write::GzDecoder<Vec<u8>>),
}

/// In-memory implementation of the turbo trace viewer protocol.
#[napi]
pub struct TurbopackTraceServer {
    session: ProtocolSession,
    parser: TraceParser,
    compression: Compression,
    on_progress: Option<FunctionRef<TraceLoadProgress, ()>>,
    started: Instant,
    last_reported: Option<Duration>,
    bytes_read: usize,
    uncompressed_bytes_read: usize,
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
        let parser = TraceParser::new(store.clone());

        Ok(Self {
            session: ProtocolSession::new(store),
            parser,
            compression: Compression::Undetermined(Vec::new()),
            on_progress,
            started: Instant::now(),
            last_reported: None,
            bytes_read: 0,
            uncompressed_bytes_read: 0,
        })
    }

    /// Incrementally adds raw or gzip-compressed trace bytes.
    #[napi]
    pub fn read(&mut self, env: Env, trace: Uint8Array) -> Result<()> {
        self.bytes_read += trace.len();
        self.push_bytes(trace.as_ref()).map_err(|error| {
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
                uncompressed_bytes_read: self.uncompressed_bytes_read as f64,
                elapsed_ms,
                bytes_per_second: if elapsed_ms > 0.0 {
                    bytes_read * 1000.0 / elapsed_ms
                } else {
                    0.0
                },
                stats: self.parser.stats(),
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

impl TurbopackTraceServer {
    fn push_bytes(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        if let Compression::Undetermined(prefix) = &mut self.compression {
            prefix.extend_from_slice(bytes);
            if prefix.len() < 4 {
                return Ok(());
            }

            const GZIP_MAGIC: &[u8] = &[0x1f, 0x8b];
            const ZSTD_MAGIC: &[u8] = &[0x28, 0xb5, 0x2f, 0xfd];

            if prefix.starts_with(ZSTD_MAGIC) {
                return Err(std::io::Error::other(
                    "zstd-compressed traces are not supported by the WASM trace engine",
                ));
            }

            let prefix = std::mem::take(prefix);
            self.compression = if prefix.starts_with(GZIP_MAGIC) {
                Compression::Gzip(flate2::write::GzDecoder::new(Vec::new()))
            } else {
                Compression::Raw
            };
            return self.push_bytes(&prefix);
        }

        let uncompressed = match &mut self.compression {
            Compression::Raw => bytes.to_vec(),
            Compression::Gzip(decoder) => {
                decoder.write_all(bytes)?;
                std::mem::take(decoder.get_mut())
            }
            Compression::Undetermined(_) => unreachable!(),
        };

        self.parser
            .push(&uncompressed)
            .map_err(std::io::Error::other)?;
        self.uncompressed_bytes_read += uncompressed.len();
        Ok(())
    }
}
