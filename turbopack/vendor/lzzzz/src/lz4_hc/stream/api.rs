#![allow(unsafe_code)]

use super::super::{binding, binding::LZ4StreamHC};
use crate::{Error, ErrorKind, Result};

use std::{
    os::raw::{c_char, c_int},
    ptr::NonNull,
    ptr::null_mut
};

pub struct CompressionContext {
    stream: NonNull<LZ4StreamHC>,
}

unsafe impl Send for CompressionContext {}

impl CompressionContext {
    pub fn new() -> Result<Self> {
        let ptr = unsafe { NonNull::new(binding::LZ4_createStreamHC()) };
        ptr.ok_or_else(|| Error::new(ErrorKind::InitializationFailed))
            .map(|stream| Self { stream })
    }

    pub fn set_compression_level(&mut self, compression_level: i32) {
        unsafe {
            binding::LZ4_setCompressionLevel(self.stream.as_ptr(), compression_level as c_int)
        }
    }

    pub fn set_favor_dec_speed(&mut self, flag: bool) {
        unsafe { binding::LZ4_favorDecompressionSpeed(self.stream.as_ptr(), i32::from(flag)) }
    }

    pub fn load_dict(&mut self, dict: &[u8]) {
        unsafe {
            binding::LZ4_loadDictHC(
                self.stream.as_ptr(),
                dict.as_ptr() as *const c_char,
                dict.len() as c_int,
            );
        }
    }

    pub fn save_dict(&mut self, dict: &mut [u8]) {
        unsafe {
            binding::LZ4_saveDictHC(
                self.stream.as_ptr(),
                dict.as_ptr() as *mut c_char,
                dict.len() as c_int,
            );
        }
    }

    pub fn next(&mut self, src: &[u8], dst: *mut u8, dst_len: usize) -> Result<usize> {
        if src.is_empty() {
            return Ok(0);
        }
        let dst_len = unsafe {
            binding::LZ4_compress_HC_continue(
                self.stream.as_ptr(),
                src.as_ptr() as *const c_char,
                dst as *mut c_char,
                src.len() as c_int,
                dst_len as c_int,
            ) as usize
        };
        if dst_len > 0 {
            Ok(dst_len)
        } else {
            Err(Error::new(ErrorKind::CompressionFailed))
        }
    }

    pub fn next_partial(&mut self, src: &[u8], dst: &mut [u8]) -> Result<(usize, usize)> {
        if src.is_empty() || dst.is_empty() {
            return Ok((0, 0));
        }
        let mut src_len = src.len() as c_int;
        let dst_len = unsafe {
            binding::LZ4_compress_HC_continue_destSize(
                self.stream.as_ptr(),
                src.as_ptr() as *const c_char,
                dst.as_mut_ptr() as *mut c_char,
                &mut src_len as *mut c_int,
                dst.len() as c_int,
            ) as usize
        };
        if dst_len > 0 {
            Ok((src_len as usize, dst_len))
        } else {
            Err(Error::new(ErrorKind::CompressionFailed))
        }
    }

    pub fn attach_dict(&mut self, dict_stream: Option<&CompressionContext>, compression_level: i32) {
        unsafe {
            if dict_stream.is_none() {
                // Note(sewer56): When detaching dictionary, we need to reset the stream state
                // This behaviour is consistent with what the LZ4 library itself does internally.
                // The LZ4HC API does not have a way to retrieve compression level, so we must pass it manually,
                // since the HC API differs here.
                binding::LZ4_resetStreamHC_fast(self.stream.as_ptr(), compression_level);
            }
            let dict_ptr = dict_stream.map(|ctx| ctx.stream.as_ptr()).unwrap_or(null_mut());
            binding::LZ4_attach_HC_dictionary(self.stream.as_ptr(), dict_ptr);
        }
    }
}

impl Drop for CompressionContext {
    fn drop(&mut self) {
        unsafe {
            binding::LZ4_freeStreamHC(self.stream.as_mut());
        }
    }
}
