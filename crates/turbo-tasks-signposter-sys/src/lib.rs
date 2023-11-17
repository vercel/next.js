#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(clippy::unnecessary_cast)]
#![allow(clippy::useless_transmute)]
#![allow(clippy::missing_safety_doc)]

#[cfg(target_os = "macos")]
include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
