use std::{any::Any, sync::Arc};

use anyhow::{Result, bail};
use turbopack_trace_utils::tracing::{TRACE_HEADER, TRACE_HEADER_PREFIX, check_trace_header};

use crate::store_container::StoreContainer;

#[path = "reader/heaptrack.rs"]
mod heaptrack;
#[path = "reader/nextjs.rs"]
mod nextjs;
#[path = "reader/turbopack.rs"]
pub(crate) mod turbopack;

use self::{heaptrack::HeaptrackFormat, nextjs::NextJsFormat, turbopack::TurbopackFormat};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum FormatKind {
    Turbopack,
    NextJs,
    Heaptrack,
}

const NEXT_JS_PREFIX: &[u8] = b"[{\"name\"";
const HEAPTRACK_PREFIX: &[u8] = b"v ";

/// Detects a decompressed trace prefix, waiting until there is enough data to
/// validate its format. Native and browser readers enforce the same version.
pub(crate) fn detect_format(buffer: &[u8]) -> Result<Option<FormatKind>> {
    let could_be = |prefix: &[u8]| {
        let len = buffer.len().min(prefix.len());
        buffer[..len] == prefix[..len]
    };
    if could_be(TRACE_HEADER_PREFIX) {
        if buffer.len() < TRACE_HEADER.len() {
            return Ok(None);
        }
        check_trace_header(buffer)?;
        return Ok(Some(FormatKind::Turbopack));
    }
    if could_be(NEXT_JS_PREFIX) {
        return Ok((buffer.len() >= NEXT_JS_PREFIX.len()).then_some(FormatKind::NextJs));
    }
    if could_be(HEAPTRACK_PREFIX) {
        return Ok((buffer.len() >= HEAPTRACK_PREFIX.len()).then_some(FormatKind::Heaptrack));
    }
    bail!(
        "Unknown trace file format (expected a {} header, a Next.js trace or a heaptrack file)",
        String::from_utf8_lossy(TRACE_HEADER)
    );
}

pub(crate) trait TraceFormat {
    type Reused: Default;

    fn create_reused() -> Self::Reused {
        Self::Reused::default()
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut Self::Reused) -> Result<usize>;

    fn stats(&self) -> String {
        String::new()
    }
}

type ErasedReused = Box<dyn Any>;

struct ErasedTraceFormat(Box<dyn ObjectSafeTraceFormat>);

trait ObjectSafeTraceFormat {
    fn create_reused(&self) -> ErasedReused;
    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize>;
    fn stats(&self) -> String;
}

impl<T: TraceFormat> ObjectSafeTraceFormat for T
where
    T::Reused: 'static,
{
    fn create_reused(&self) -> ErasedReused {
        Box::new(T::create_reused())
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize> {
        let reuse = reuse.downcast_mut().expect("Type of reuse is invalid");
        TraceFormat::read(self, buffer, reuse)
    }

    fn stats(&self) -> String {
        TraceFormat::stats(self)
    }
}

impl ObjectSafeTraceFormat for ErasedTraceFormat {
    fn create_reused(&self) -> ErasedReused {
        self.0.create_reused()
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize> {
        self.0.read(buffer, reuse)
    }

    fn stats(&self) -> String {
        self.0.stats()
    }
}

/// Incrementally parses trace bytes into a shared store.
///
/// Input may be split at arbitrary byte boundaries. Compression is handled by
/// the caller so the same parser can be used by native file readers and WASM.
pub struct TraceParser {
    store: Arc<StoreContainer>,
    invalidate_caches: bool,
    format: Option<(ErasedTraceFormat, ErasedReused)>,
    buffer: Vec<u8>,
    consumed: usize,
}

impl TraceParser {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self::new_with_cache_invalidation(store, true)
    }

    #[allow(dead_code, reason = "unused by the native binary's streaming reader")]
    pub(crate) fn new_complete(store: Arc<StoreContainer>) -> Self {
        Self::new_with_cache_invalidation(store, false)
    }

    fn new_with_cache_invalidation(store: Arc<StoreContainer>, invalidate_caches: bool) -> Self {
        Self {
            store,
            invalidate_caches,
            format: None,
            buffer: Vec::new(),
            consumed: 0,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<()> {
        if self.consumed > 0 {
            self.buffer.drain(..self.consumed);
            self.consumed = 0;
        }
        self.buffer.extend_from_slice(bytes);

        if self.format.is_none() {
            let Some(kind) = detect_format(&self.buffer)? else {
                return Ok(());
            };
            let erased_format = match kind {
                FormatKind::Turbopack => {
                    self.consumed = TRACE_HEADER.len();
                    let format = if self.invalidate_caches {
                        TurbopackFormat::new(self.store.clone())
                    } else {
                        TurbopackFormat::new_with_cache_invalidation(self.store.clone(), false)
                    };
                    ErasedTraceFormat(Box::new(format))
                }
                FormatKind::NextJs => {
                    ErasedTraceFormat(Box::new(NextJsFormat::new(self.store.clone())))
                }
                FormatKind::Heaptrack => {
                    ErasedTraceFormat(Box::new(HeaptrackFormat::new(self.store.clone())))
                }
            };
            let reuse = erased_format.create_reused();
            self.format = Some((erased_format, reuse));
        }

        if let Some((format, reuse)) = &mut self.format {
            self.consumed += format.read(&self.buffer[self.consumed..], reuse)?;
        }

        Ok(())
    }

    /// Completes a finite trace input and rejects an incomplete final record.
    #[allow(dead_code, reason = "unused by the native binary's streaming reader")]
    pub fn finish(&mut self) -> Result<()> {
        self.push(&[])?;
        if self.format.is_none() {
            bail!("trace is too short to determine its format");
        }
        if self.consumed != self.buffer.len() {
            bail!(
                "trace ended with {} incomplete bytes",
                self.buffer.len() - self.consumed
            );
        }
        self.store.write().optimize();
        Ok(())
    }

    pub fn stats(&self) -> String {
        self.format
            .as_ref()
            .map(|(format, _)| format.stats())
            .unwrap_or_default()
    }
}
