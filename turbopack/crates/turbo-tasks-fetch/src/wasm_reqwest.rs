//! Reports HTTP as unsupported on wasm, in the shape of the `reqwest` API this crate consumes.
//!
//! This is **not** a client and does not try to look like one: building a client fails immediately
//! with a clear error, so no request is ever attempted, nothing is retried, and no response is ever
//! produced. The remaining types exist only so that [`crate::client`] type-checks; they are
//! unreachable.
//!
//! `reqwest` itself cannot serve wasm here. Its only wasm backend targets `wasm32-unknown-unknown`
//! and is built on the browser `fetch` API via `wasm-bindgen`. Under `wasm32-wasip1-threads` that
//! backend is still selected (it keys off `target_arch = "wasm32"`), and it is both
//! API-incompatible (no `ClientBuilder::connect_timeout`, no `ClientBuilder::timeout`, no
//! `Error::is_connect`) and — fatally — `!Send`, which `turbo-tasks` requires of every task future.
//! WASI preview1 has no sockets to build a native client on either.
//!
//! Supporting HTTP on wasm needs the host to provide it: for wasm builds of the Next.js bindings
//! that means a napi callback into the JS `fetch`, kept behind the existing
//! [`crate::FetchClientConfig`] interface so callers are unaffected. That is deliberately a
//! separate change, because it cannot be tested until the wasm bindings can be instantiated. Until
//! then the only consumer, `next/font/google`, reports this error instead of silently producing
//! nothing.

use std::{fmt, time::Duration};

pub type Result<T> = std::result::Result<T, Error>;

/// The only value this module ever produces.
#[derive(Debug)]
pub struct Error;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(
            "HTTP requests are not supported in wasm builds of Next.js: this platform has no HTTP \
             client. Features that fetch at build time, such as `next/font/google`, cannot be \
             used here — self-host the assets, or use a platform with native Next.js binaries.",
        )
    }
}

impl std::error::Error for Error {}

impl Error {
    /// Not a connection failure — the platform has no client at all, so retrying cannot help.
    pub fn is_connect(&self) -> bool {
        false
    }

    /// Not a timeout, for the same reason.
    pub fn is_timeout(&self) -> bool {
        false
    }

    pub fn is_request(&self) -> bool {
        true
    }

    pub fn status(&self) -> Option<StatusCode> {
        None
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StatusCode(u16);

impl StatusCode {
    pub fn as_u16(self) -> u16 {
        self.0
    }

    pub fn is_server_error(self) -> bool {
        (500..600).contains(&self.0)
    }
}

#[derive(Clone, Debug, Default)]
pub struct Client;

impl Client {
    pub fn builder() -> ClientBuilder {
        ClientBuilder
    }

    /// Unreachable: [`ClientBuilder::build`] never yields a `Client`.
    pub fn get(&self, _url: &str) -> RequestBuilder {
        unreachable!("no HTTP client can be built on wasm")
    }
}

#[derive(Clone, Debug)]
pub struct ClientBuilder;

impl ClientBuilder {
    pub fn connect_timeout(self, _timeout: Duration) -> Self {
        self
    }

    pub fn timeout(self, _timeout: Duration) -> Self {
        self
    }

    /// Fails, so callers get the error at client construction rather than per request.
    pub fn build(self) -> Result<Client> {
        Err(Error)
    }
}

#[derive(Clone, Debug)]
pub struct RequestBuilder;

impl RequestBuilder {
    pub fn header(self, _name: &str, _value: &str) -> Self {
        self
    }

    pub fn try_clone(&self) -> Option<Self> {
        Some(RequestBuilder)
    }

    /// Unreachable: a `RequestBuilder` requires a `Client`, which cannot be built.
    pub async fn send(self) -> Result<Response> {
        Err(Error)
    }
}

/// Unreachable: no request is ever sent, so no response is ever constructed.
#[derive(Debug)]
pub struct Response {
    _priv: (),
}

impl Response {
    pub fn error_for_status(self) -> Result<Self> {
        Err(Error)
    }

    pub fn status(&self) -> StatusCode {
        unreachable!("no response can be produced on wasm")
    }

    pub fn headers(&self) -> &header::HeaderMap {
        unreachable!("no response can be produced on wasm")
    }

    pub async fn bytes(self) -> Result<Vec<u8>> {
        Err(Error)
    }
}

pub mod header {
    use rustc_hash::FxHashMap;

    pub const CACHE_CONTROL: &str = "cache-control";

    #[derive(Clone, Debug, Default)]
    pub struct HeaderValue(String);

    impl HeaderValue {
        pub fn from_static(value: &'static str) -> Self {
            HeaderValue(value.to_string())
        }

        pub fn to_str(&self) -> Result<&str, std::str::Utf8Error> {
            Ok(&self.0)
        }
    }

    #[derive(Clone, Debug, Default)]
    pub struct HeaderMap(FxHashMap<String, HeaderValue>);

    impl HeaderMap {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn insert(&mut self, name: &str, value: HeaderValue) -> Option<HeaderValue> {
            self.0.insert(name.to_ascii_lowercase(), value)
        }

        pub fn get(&self, name: &str) -> Option<&HeaderValue> {
            self.0.get(&name.to_ascii_lowercase())
        }
    }
}
