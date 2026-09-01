#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod client;
mod error;
mod response;
// A non-functional stand-in for `reqwest` on wasm; see the module docs for why reqwest cannot be
// used there.
#[cfg(target_family = "wasm")]
mod wasm_reqwest;

pub use crate::{
    client::{
        __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
        FetchClientConfig,
    },
    error::{FetchError, FetchErrorKind, FetchIssue},
    response::{FetchResult, HttpResponse, HttpResponseBody},
};
