use super::{FrameInfo, Preferences};
use std::os::raw::{c_uint, c_void};

#[allow(non_camel_case_types)]
type size_t = usize;

#[repr(C)]
pub struct LZ4FCompressionCtx {
    _private: [u8; 0],
}

#[repr(C)]
pub struct LZ4FDecompressionCtx {
    _private: [u8; 0],
}

#[repr(C)]
pub struct LZ4FCompressionDict {
    _private: [u8; 0],
}

#[derive(Debug, Default, Copy, Clone)]
#[repr(C)]
pub struct LZ4FCompressionOptions {
    pub stable_src: c_uint,
    pub _reserved: [c_uint; 3],
}

impl LZ4FCompressionOptions {
    pub fn stable(stable: bool) -> Self {
        Self {
            stable_src: u32::from(stable),
            ..Default::default()
        }
    }
}

#[derive(Debug, Default, Copy, Clone)]
#[repr(C)]
pub struct LZ4FDecompressionOptions {
    pub stable_dst: c_uint,
    pub _reserved: [c_uint; 3],
}

impl LZ4FDecompressionOptions {
    pub fn stable(stable: bool) -> Self {
        Self {
            stable_dst: u32::from(stable),
            ..Default::default()
        }
    }
}

extern "C" {
    pub fn LZ4F_getVersion() -> c_uint;
    pub fn LZ4F_compressBound(src_size: size_t, prefs: *const Preferences) -> size_t;
    pub fn LZ4F_compressFrameBound(src_size: size_t, prefs: *const Preferences) -> size_t;
    pub fn LZ4F_compressFrame(
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        src_buffer: *const c_void,
        src_size: size_t,
        prefs: *const Preferences,
    ) -> size_t;
    pub fn LZ4F_decompress_usingDict(
        ctx: *mut LZ4FDecompressionCtx,
        dst_buffer: *mut c_void,
        dst_size_ptr: *mut size_t,
        src_buffer: *const c_void,
        src_size_ptr: *mut size_t,
        dict: *const c_void,
        dict_size: size_t,
        opt: *const LZ4FDecompressionOptions,
    ) -> size_t;
    pub fn LZ4F_createCDict(
        dict_buffer: *const c_void,
        dict_size: size_t,
    ) -> *mut LZ4FCompressionDict;
    pub fn LZ4F_freeCDict(dict: *mut LZ4FCompressionDict);

    pub fn LZ4F_createCompressionContext(
        ctx: *mut *mut LZ4FCompressionCtx,
        version: c_uint,
    ) -> size_t;
    pub fn LZ4F_freeCompressionContext(ctx: *mut LZ4FCompressionCtx) -> size_t;
    pub fn LZ4F_compressBegin(
        ctx: *mut LZ4FCompressionCtx,
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        prefs: *const Preferences,
    ) -> size_t;
    pub fn LZ4F_compressBegin_usingCDict(
        ctx: *mut LZ4FCompressionCtx,
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        dist: *const LZ4FCompressionDict,
        prefs: *const Preferences,
    ) -> size_t;
    pub fn LZ4F_compressUpdate(
        ctx: *mut LZ4FCompressionCtx,
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        src_buffer: *const c_void,
        src_size: size_t,
        opt: *const LZ4FCompressionOptions,
    ) -> size_t;
    pub fn LZ4F_flush(
        ctx: *mut LZ4FCompressionCtx,
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        opt: *const LZ4FCompressionOptions,
    ) -> size_t;
    pub fn LZ4F_compressEnd(
        ctx: *mut LZ4FCompressionCtx,
        dst_buffer: *mut c_void,
        dst_capacity: size_t,
        opt: *const LZ4FCompressionOptions,
    ) -> size_t;
    pub fn LZ4F_createDecompressionContext(
        ctx: *mut *mut LZ4FDecompressionCtx,
        version: c_uint,
    ) -> size_t;
    pub fn LZ4F_freeDecompressionContext(ctx: *mut LZ4FDecompressionCtx) -> size_t;
    pub fn LZ4F_resetDecompressionContext(ctx: *mut LZ4FDecompressionCtx);
    pub fn LZ4F_headerSize(src: *const c_void, src_size: size_t) -> size_t;
    pub fn LZ4F_getFrameInfo(
        ctx: *mut LZ4FDecompressionCtx,
        frame_info_ptr: *mut FrameInfo,
        src_buffer: *const c_void,
        src_size_ptr: *mut size_t,
    ) -> size_t;
}
