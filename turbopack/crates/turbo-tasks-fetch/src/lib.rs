#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

// Force linking `turbo-tasks-backend`'s `__tt_static_*` providers into
// this crate's test binary. The backend is a regular dep, but rustc
// only adds rlibs to the link command for crates Rust code references.
#[cfg(test)]
extern crate turbo_tasks_backend;

mod client;
mod error;
mod response;

pub use crate::{
    client::{
        __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
        FetchClientConfig,
    },
    error::{FetchError, FetchErrorKind, FetchIssue},
    response::{FetchResult, HttpResponse, HttpResponseBody},
};
