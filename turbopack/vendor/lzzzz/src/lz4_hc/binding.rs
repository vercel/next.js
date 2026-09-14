use std::os::raw::{c_char, c_int, c_void};

const LZ4HC_HASH_LOG: usize = 15;
const LZ4HC_HASHTABLESIZE: usize = 1 << LZ4HC_HASH_LOG;
const LZ4HC_DICTIONARY_LOGSIZE: usize = 16;
const LZ4HC_MAXD: usize = 1 << LZ4HC_DICTIONARY_LOGSIZE;
pub const LZ4_STREAMHCSIZE: usize = 4 * LZ4HC_HASHTABLESIZE + 2 * LZ4HC_MAXD + 56;

#[repr(C)]
pub struct LZ4StreamHC {
    _private: [u8; 0],
}

extern "C" {
    pub fn LZ4_compress_HC_extStateHC(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        compression_level: c_int,
    ) -> c_int;
    pub fn LZ4_compress_HC_extStateHC_fastReset(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        compression_level: c_int,
    ) -> c_int;
    pub fn LZ4_compress_HC_destSize(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size_ptr: *mut c_int,
        target_dst_dize: c_int,
        compression_level: c_int,
    ) -> c_int;

    pub fn LZ4_createStreamHC() -> *mut LZ4StreamHC;
    pub fn LZ4_freeStreamHC(ptr: *mut LZ4StreamHC) -> c_int;
    pub fn LZ4_loadDictHC(
        ptr: *mut LZ4StreamHC,
        dictionary: *const c_char,
        dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_saveDictHC(
        ptr: *mut LZ4StreamHC,
        safe_buffer: *mut c_char,
        max_dict_size: c_int,
    ) -> c_int;
    pub fn LZ4_compress_HC_continue(
        ptr: *mut LZ4StreamHC,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
    ) -> c_int;
    pub fn LZ4_compress_HC_continue_destSize(
        ptr: *mut LZ4StreamHC,
        src: *const c_char,
        dst: *mut c_char,
        src_size_ptr: *mut c_int,
        target_dst_size: c_int,
    ) -> c_int;
    pub fn LZ4_setCompressionLevel(ptr: *mut LZ4StreamHC, compression_level: c_int);
    pub fn LZ4_favorDecompressionSpeed(ptr: *mut LZ4StreamHC, favor: c_int);
    pub fn LZ4_attach_HC_dictionary(
        working_stream: *mut LZ4StreamHC,
        dictionary_stream: *const LZ4StreamHC
    );
    
    pub fn LZ4_resetStreamHC_fast(
        streamPtr: *mut LZ4StreamHC,
        compressionLevel: c_int
    );
}
