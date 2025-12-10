#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod client;
mod error;
mod response;

pub use crate::{
    client::{
        __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
        FetchClientConfig, ProxyConfig,
    },
    error::{FetchError, FetchErrorKind, FetchIssue},
    response::{FetchResult, HttpResponse, HttpResponseBody},
};
