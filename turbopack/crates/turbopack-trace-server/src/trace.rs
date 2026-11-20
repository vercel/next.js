use std::{any::Any, sync::Arc};

use anyhow::{Result, bail};

use crate::store_container::StoreContainer;

#[path = "reader/heaptrack.rs"]
mod heaptrack;
#[path = "reader/nextjs.rs"]
mod nextjs;
#[path = "reader/turbopack.rs"]
mod turbopack;

use self::{heaptrack::HeaptrackFormat, nextjs::NextJsFormat, turbopack::TurbopackFormat};

pub(crate) trait TraceFormat {
    type Reused: Default;

    fn create_reused() -> Self::Reused {
        Self::Reused::default()
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut Self::Reused) -> Result<usize>;

    #[cfg(not(target_arch = "wasm32"))]
    fn stats(&self) -> String {
        String::new()
    }
}

type ErasedReused = Box<dyn Any>;

struct ErasedTraceFormat(Box<dyn ObjectSafeTraceFormat>);

trait ObjectSafeTraceFormat {
    fn create_reused(&self) -> ErasedReused;
    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize>;
    #[cfg(not(target_arch = "wasm32"))]
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

    #[cfg(not(target_arch = "wasm32"))]
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

    #[cfg(not(target_arch = "wasm32"))]
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
    format: Option<(ErasedTraceFormat, ErasedReused)>,
    buffer: Vec<u8>,
    consumed: usize,
}

impl TraceParser {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            store,
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

        if self.format.is_none() && self.buffer.len() >= 8 {
            let erased_format = if self.buffer.starts_with(b"TRACEv0") {
                self.consumed = 7;
                ErasedTraceFormat(Box::new(TurbopackFormat::new(self.store.clone())))
            } else if self.buffer.starts_with(b"[{\"name\"") {
                ErasedTraceFormat(Box::new(NextJsFormat::new(self.store.clone())))
            } else if self.buffer.starts_with(b"v ") {
                ErasedTraceFormat(Box::new(HeaptrackFormat::new(self.store.clone())))
            } else {
                // Preserve the native reader's compatibility with old
                // Turbopack traces that predate the magic header.
                ErasedTraceFormat(Box::new(TurbopackFormat::new(self.store.clone())))
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
    pub fn finish(mut self) -> Result<()> {
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

    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn stats(&self) -> String {
        self.format
            .as_ref()
            .map(|(format, _)| format.stats())
            .unwrap_or_default()
    }
}
