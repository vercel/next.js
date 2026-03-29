//! Bincode-serializable message types for the Turbopack daemon IPC protocol.

use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;

use crate::project::{PartialProjectOptions, ProjectOptions};

/// A unique ID for a call, used to match responses to requests.
pub type CallId = u64;
/// A u64 handle representing an opaque Rust object (Project, Endpoint, RootTask).
pub type OpaqueHandle = u64;
/// A u64 ID for a registered callback.
pub type CallbackId = u64;

/// Engine options that control the Turbo-tasks backend.
/// Defined here because there is no pure-Rust equivalent in next-api yet
/// (NapiTurboEngineOptions lives in next-napi-bindings and depends on napi).
#[derive(Debug, Clone, Default, Encode, Decode)]
pub struct TurboEngineOptions {
    /// An upper bound of memory that turbopack will attempt to stay under.
    pub memory_limit: Option<u64>,
    /// Track dependencies between tasks. If false, any change during build will error.
    pub dependency_tracking: Option<bool>,
    /// Whether the project is running in a CI environment.
    pub is_ci: Option<bool>,
    /// Whether the project is running in a short session.
    pub is_short_session: Option<bool>,
    /// Whether to skip database compaction during shutdown.
    pub skip_compaction: Option<bool>,
}

/// A source-map stack frame, used for `projectTraceSource`.
/// Mirror of the `StackFrame` in `next-napi-bindings` but without `#[napi]` deps.
#[derive(Debug, Clone, Encode, Decode)]
pub struct StackFrame {
    pub is_server: bool,
    pub is_ignored: Option<bool>,
    pub file: RcStr,
    pub original_file: Option<RcStr>,
    /// 1-indexed
    pub line: Option<u32>,
    /// 1-indexed
    pub column: Option<u32>,
    pub method_name: Option<RcStr>,
}

/// All requests a worker can send to the daemon.
#[derive(Debug, Encode, Decode)]
pub enum DaemonRequest {
    // ── Project lifecycle ─────────────────────────────────────────────────
    ProjectNew {
        call_id: CallId,
        options: ProjectOptions,
        turbo_engine_options: TurboEngineOptions,
        /// The dist directory path, used for turbo-tasks storage.
        /// This comes from NapiProjectOptions.dist_dir in the NAPI layer
        /// and is not part of the core ProjectOptions.
        dist_dir: String,
    },
    ProjectUpdate {
        call_id: CallId,
        project: OpaqueHandle,
        options: PartialProjectOptions,
    },
    ProjectInvalidateFileSystemCache {
        call_id: CallId,
        project: OpaqueHandle,
    },
    ProjectShutdown {
        call_id: CallId,
        project: OpaqueHandle,
    },
    ProjectOnExit {
        call_id: CallId,
        project: OpaqueHandle,
    },

    // ── Project build operations ──────────────────────────────────────────
    ProjectWriteAllEntrypointsToDisk {
        call_id: CallId,
        project: OpaqueHandle,
        app_dir_only: bool,
    },
    ProjectWriteAnalyzeData {
        call_id: CallId,
        project: OpaqueHandle,
        app_dir_only: bool,
    },

    // ── Project subscriptions ─────────────────────────────────────────────
    ProjectEntrypointsSubscribe {
        call_id: CallId,
        project: OpaqueHandle,
        callback_id: CallbackId,
    },
    ProjectHmrEvents {
        call_id: CallId,
        project: OpaqueHandle,
        chunk_name: String,
        target: String,
        callback_id: CallbackId,
    },
    ProjectHmrChunkNamesSubscribe {
        call_id: CallId,
        project: OpaqueHandle,
        target: String,
        callback_id: CallbackId,
    },
    ProjectUpdateInfoSubscribe {
        call_id: CallId,
        project: OpaqueHandle,
        aggregation_ms: u32,
        callback_id: CallbackId,
    },
    ProjectCompilationEventsSubscribe {
        call_id: CallId,
        project: OpaqueHandle,
        event_types: Option<Vec<String>>,
        callback_id: CallbackId,
    },

    // ── Project source maps ───────────────────────────────────────────────
    ProjectTraceSource {
        call_id: CallId,
        project: OpaqueHandle,
        frame: StackFrame,
        current_directory_file_url: String,
    },
    ProjectGetSourceForAsset {
        call_id: CallId,
        project: OpaqueHandle,
        file_path: String,
    },
    ProjectGetSourceMap {
        call_id: CallId,
        project: OpaqueHandle,
        file_path: String,
    },

    // ── Endpoint ──────────────────────────────────────────────────────────
    EndpointWriteToDisk {
        call_id: CallId,
        endpoint: OpaqueHandle,
    },
    EndpointServerChangedSubscribe {
        call_id: CallId,
        endpoint: OpaqueHandle,
        issues: bool,
        callback_id: CallbackId,
    },
    EndpointClientChangedSubscribe {
        call_id: CallId,
        endpoint: OpaqueHandle,
        callback_id: CallbackId,
    },

    // ── RootTask ──────────────────────────────────────────────────────────
    RootTaskDispose {
        call_id: CallId,
        root_task: OpaqueHandle,
    },

    // ── Subscription management ───────────────────────────────────────────
    /// Client signals it no longer wants callback `callback_id`.
    CancelSubscription { callback_id: CallbackId },
}

/// Responses the daemon sends back to a worker.
#[derive(Debug, Encode, Decode)]
pub enum DaemonResponse {
    /// A normal result for a call.
    Ok {
        call_id: CallId,
        result: DaemonResult,
    },
    /// An error for a call.
    Err { call_id: CallId, message: String },
    /// A callback invocation (subscription fire).
    CallbackInvoke {
        callback_id: CallbackId,
        /// bincode-encoded callback payload
        payload: Vec<u8>,
    },
}

/// Discriminated union of all possible return values.
#[derive(Debug, Encode, Decode)]
pub enum DaemonResult {
    Unit,
    ProjectHandle(OpaqueHandle),
    EndpointHandle(OpaqueHandle),
    RootTaskHandle(OpaqueHandle),
    /// bincode-encoded TurbopackResult (issues + diagnostics + result)
    TurbopackResult(Vec<u8>),
    StackFrame(Option<StackFrame>),
    StringOption(Option<String>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_daemon_response() {
        let resp = DaemonResponse::Ok {
            call_id: 42,
            result: DaemonResult::ProjectHandle(7),
        };
        let encoded = bincode::encode_to_vec(&resp, bincode::config::standard()).unwrap();
        let (decoded, _): (DaemonResponse, _) =
            bincode::decode_from_slice(&encoded, bincode::config::standard()).unwrap();
        match decoded {
            DaemonResponse::Ok { call_id, result } => {
                assert_eq!(call_id, 42);
                match result {
                    DaemonResult::ProjectHandle(h) => assert_eq!(h, 7),
                    _ => panic!("wrong result variant"),
                }
            }
            _ => panic!("wrong response variant"),
        }
    }
}
