#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

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
