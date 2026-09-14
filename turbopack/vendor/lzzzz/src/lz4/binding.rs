use std::{
    mem,
    os::raw::{c_char, c_int, c_void},
};

const LZ4_MEMORY_USAGE: usize = 14;
const LZ4_STREAMSIZE_U64: usize = (1 << (LZ4_MEMORY_USAGE - 3)) + 4;
pub const LZ4_STREAMSIZE: usize = LZ4_STREAMSIZE_U64 * mem::size_of::<u64>();

#[repr(C)]
pub struct LZ4Stream {
    _private: [u64; LZ4_STREAMSIZE_U64],
}

#[repr(C)]
pub struct LZ4DecStream {
    _private: [u8; 0],
}

extern "C" {
    pub fn LZ4_compress_fast_extState(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        acceleration: c_int,
    ) -> c_int;
    pub fn LZ4_compress_fast_extState_fastReset(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        acceleration: c_int,
    ) -> c_int;
    pub fn LZ4_compress_destSize(
        src: *const c_char,
        dst: *mut c_char,
        src_size: *mut c_int,
        target_dst_size: c_int,
    ) -> c_int;
    pub fn LZ4_decompress_safe(
        src: *const c_char,
        dst: *mut c_char,
        compressed_size: c_int,
        dst_capacity: c_int,
    ) -> c_int;
    pub fn LZ4_decompress_safe_partial(
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        target_output_size: c_int,
        dst_capacity: c_int,
    ) -> c_int;
    pub fn LZ4_decompress_safe_usingDict(
        src: *const c_char,
        dst: *mut c_char,
        compressed_size: c_int,
        dst_capacity: c_int,
        dict_start: *const c_char,
        dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_decompress_safe_partial_usingDict(
        src: *const c_char,
        dst: *mut c_char,
        compressed_size: c_int,
        target_output_size: c_int,
        dst_capacity: c_int,
        dict_start: *const c_char,
        dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_createStream() -> *mut LZ4Stream;
    pub fn LZ4_freeStream(ptr: *mut LZ4Stream) -> c_int;
    pub fn LZ4_initStream(buffer: *mut c_void, size: usize) -> *mut LZ4Stream;
    pub fn LZ4_loadDict(ptr: *mut LZ4Stream, dictionary: *const c_char, dict_size: c_int) -> c_int;
    pub fn LZ4_loadDictSlow(ptr: *mut LZ4Stream, dictionary: *const c_char, dict_size: c_int) -> c_int;
    pub fn LZ4_saveDict(
        ptr: *mut LZ4Stream,
        safe_buffer: *mut c_char,
        max_dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_compress_fast_continue(
        ptr: *mut LZ4Stream,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        acceleration: c_int,
    ) -> c_int;
    pub fn LZ4_createStreamDecode() -> *mut LZ4DecStream;
    pub fn LZ4_freeStreamDecode(stream: *mut LZ4DecStream) -> c_int;
    pub fn LZ4_setStreamDecode(
        ptr: *mut LZ4DecStream,
        dictionary: *const c_char,
        dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_decompress_safe_continue(
        ptr: *mut LZ4DecStream,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
    ) -> c_int;
    pub fn LZ4_attach_dictionary(
        working_stream: *mut LZ4Stream,
        dictionary_stream: *const LZ4Stream,
    );
    pub fn LZ4_resetStream_fast(streamPtr: *mut LZ4Stream);
}
