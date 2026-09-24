use napi::{Result, bindgen_prelude::Uint8Array};
use napi_derive::napi;
use turbopack_trace_server::{protocol::ProtocolSession, read_trace_bytes};

/// In-memory implementation of the turbo trace viewer protocol.
#[napi]
pub struct TurbopackTraceServer {
    session: ProtocolSession,
}

#[napi]
impl TurbopackTraceServer {
    /// Loads a complete raw or gzip-compressed trace.
    #[napi(constructor)]
    pub fn new(trace: Uint8Array) -> Result<Self> {
        let store = read_trace_bytes(trace.as_ref()).map_err(|error| {
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
