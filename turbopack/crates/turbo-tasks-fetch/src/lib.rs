#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod client;
mod error;
mod response;

// Test-only cache helpers exist only in the async build (reqwest client cache).
#[cfg(not(feature = "sync"))]
pub use crate::client::{
    __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
};
pub use crate::{
    client::FetchClientConfig,
    error::{FetchError, FetchErrorKind, FetchIssue},
    response::{FetchResult, HttpResponse, HttpResponseBody},
};
