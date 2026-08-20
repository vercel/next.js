//! A non-functional stand-in for the parts of `reqwest`'s API this crate uses, so that
//! `turbo-tasks-fetch` compiles for wasm targets.
//!
//! **Every request made through this module fails.** It exists to make the crate compile, not to
//! provide HTTP on wasm.
//!
//! `reqwest` cannot be used on wasm here. Its only wasm backend targets
//! `wasm32-unknown-unknown` and is built on the browser `fetch` API via `wasm-bindgen`. Under
//! `wasm32-wasip1-threads` that backend is still selected (it keys off `target_arch = "wasm32"`),
//! and it is both API-incompatible (no `ClientBuilder::connect_timeout`, no
//! `ClientBuilder::timeout`, no `Error::is_connect`) and — fatally — `!Send`, which `turbo-tasks`
//! requires of every task future. WASI preview1 has no sockets to build a native client on either.
//!
//! TODO: replace this with a real HTTP client provided by the host — for wasm builds of the
//! Next.js bindings that means a napi callback into the JS `fetch` — kept behind the existing
//! [`crate::FetchClientConfig`] interface. Until then the only consumer, `next/font/google`, cannot
//! work on wasm.

use std::{fmt, time::Duration};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub struct Error;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("HTTP requests are not supported on wasm targets")
    }
}

impl std::error::Error for Error {}

impl Error {
    pub fn is_connect(&self) -> bool {
        false
    }

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

    pub fn get(&self, _url: &str) -> RequestBuilder {
        RequestBuilder
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

    pub fn build(self) -> Result<Client> {
        Ok(Client)
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

    /// Always fails: there is no HTTP client on wasm.
    pub async fn send(self) -> Result<Response> {
        Err(Error)
    }
}

#[derive(Debug)]
pub struct Response {
    headers: header::HeaderMap,
}

impl Response {
    pub fn error_for_status(self) -> Result<Self> {
        Err(Error)
    }

    pub fn status(&self) -> StatusCode {
        StatusCode(0)
    }

    pub fn headers(&self) -> &header::HeaderMap {
        &self.headers
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
