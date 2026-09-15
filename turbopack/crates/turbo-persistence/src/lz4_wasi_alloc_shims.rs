//! Allocation shims required by lz4-sys on WASI.
//!
//! lz4-sys 1.11.1 compiles liblz4 against its wasm shim headers for every `wasm32-wasi*` target,
//! but only defines the corresponding Rust symbols for wasm targets without a WASI libc. Forward
//! the allocation calls to WASI libc until lz4-sys makes those target conditions consistent.

use libc::{c_void, size_t};

#[unsafe(no_mangle)]
pub(crate) extern "C" fn rust_lz4_wasm_shim_malloc(size: size_t) -> *mut c_void {
    // SAFETY: libc::malloc accepts any allocation size and reports failure with a null pointer.
    unsafe { libc::malloc(size) }
}

#[unsafe(no_mangle)]
pub(crate) extern "C" fn rust_lz4_wasm_shim_calloc(nmemb: size_t, size: size_t) -> *mut c_void {
    // SAFETY: libc::calloc accepts element counts and sizes and reports failure with a null
    // pointer.
    unsafe { libc::calloc(nmemb, size) }
}

/// Releases storage returned by the allocation shims above.
///
/// # Safety
///
/// `ptr` must be null or a pointer returned by the corresponding WASI libc allocator that has not
/// already been freed.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn rust_lz4_wasm_shim_free(ptr: *mut c_void) {
    // SAFETY: The C caller follows liblz4's allocator contract described above.
    unsafe { libc::free(ptr) }
}
