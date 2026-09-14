use std::os::raw::{c_char, c_int};

#[link(name = "lz4")]
extern "C" {
    pub fn LZ4_versionNumber() -> c_int;
    pub fn LZ4_versionString() -> *const c_char;
}
