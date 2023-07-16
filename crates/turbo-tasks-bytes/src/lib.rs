#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

pub mod bytes;
pub mod stream;

pub use crate::{
    bytes::Bytes,
    stream::{Stream, StreamRead},
};

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
