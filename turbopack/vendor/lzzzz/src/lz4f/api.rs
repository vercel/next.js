#![allow(unsafe_code)]

use super::{
    binding,
    binding::{
        LZ4FCompressionCtx, LZ4FCompressionDict, LZ4FCompressionOptions, LZ4FDecompressionCtx,
        LZ4FDecompressionOptions,
    },
    Dictionary,
};
use crate::lz4f::{Error, ErrorKind, FrameInfo, Preferences, Result};

use std::{mem::MaybeUninit, os::raw::c_void, ptr::NonNull};

pub const LZ4F_MIN_SIZE_TO_KNOW_HEADER_LENGTH: usize = 5;
pub const LZ4F_HEADER_SIZE_MAX: usize = 19;

pub struct CompressionContext {
    ctx: NonNull<LZ4FCompressionCtx>,
    dict: Option<Dictionary>,
}

unsafe impl Send for CompressionContext {}

impl CompressionContext {
    pub fn new(dict: Option<Dictionary>) -> Result<Self> {
        let ctx = MaybeUninit::<*mut LZ4FCompressionCtx>::uninit();
        unsafe {
            let code = binding::LZ4F_createCompressionContext(
                ctx.as_ptr() as *mut *mut binding::LZ4FCompressionCtx,
                binding::LZ4F_getVersion(),
            );
            result_from_code(code).and_then(|_| {
                Ok(Self {
                    ctx: NonNull::new(ctx.assume_init())
                        .ok_or_else(|| crate::Error::new(crate::ErrorKind::InitializationFailed))?,
                    dict,
                })
            })
        }
    }

    pub fn begin(&mut self, dst: *mut u8, dst_len: usize, prefs: &Preferences) -> Result<usize> {
        let code = unsafe {
            if let Some(dict) = &self.dict {
                binding::LZ4F_compressBegin_usingCDict(
                    self.ctx.as_ptr(),
                    dst as *mut c_void,
                    dst_len,
                    dict.handle().0.as_ptr(),
                    prefs as *const Preferences,
                )
            } else {
                binding::LZ4F_compressBegin(self.ctx.as_ptr(), dst as *mut c_void, dst_len, prefs)
            }
        };
        result_from_code(code).map(|_| code)
    }

    pub fn update(
        &mut self,
        dst: *mut u8,
        dst_len: usize,
        src: &[u8],
        stable_src: bool,
    ) -> Result<usize> {
        let opt = LZ4FCompressionOptions::stable(stable_src);
        let code = unsafe {
            binding::LZ4F_compressUpdate(
                self.ctx.as_ptr(),
                dst as *mut c_void,
                dst_len,
                src.as_ptr() as *const c_void,
                src.len(),
                &opt as *const LZ4FCompressionOptions,
            )
        };
        result_from_code(code).map(|_| code)
    }

    pub fn flush(&mut self, dst: *mut u8, dst_len: usize, stable_src: bool) -> Result<usize> {
        let opt = LZ4FCompressionOptions::stable(stable_src);
        let code = unsafe {
            binding::LZ4F_flush(
                self.ctx.as_ptr(),
                dst as *mut c_void,
                dst_len,
                &opt as *const LZ4FCompressionOptions,
            )
        };
        result_from_code(code).map(|_| code)
    }

    pub fn end(&mut self, dst: *mut u8, dst_len: usize, stable_src: bool) -> Result<usize> {
        let opt = LZ4FCompressionOptions::stable(stable_src);
        let code = unsafe {
            binding::LZ4F_compressEnd(
                self.ctx.as_ptr(),
                dst as *mut c_void,
                dst_len,
                &opt as *const LZ4FCompressionOptions,
            )
        };
        result_from_code(code).map(|_| code)
    }

    pub fn compress_bound(src_size: usize, prefs: &Preferences) -> usize {
        unsafe { binding::LZ4F_compressBound(src_size, prefs as *const Preferences) }
    }
}

impl Drop for CompressionContext {
    fn drop(&mut self) {
        unsafe {
            binding::LZ4F_freeCompressionContext(self.ctx.as_ptr());
        }
    }
}

pub struct DecompressionContext {
    ctx: NonNull<LZ4FDecompressionCtx>,
}

unsafe impl Send for DecompressionContext {}

impl DecompressionContext {
    pub fn new() -> Result<Self> {
        let ctx = MaybeUninit::<*mut LZ4FDecompressionCtx>::uninit();
        unsafe {
            let code = binding::LZ4F_createDecompressionContext(
                ctx.as_ptr() as *mut *mut binding::LZ4FDecompressionCtx,
                binding::LZ4F_getVersion(),
            );
            result_from_code(code).and_then(|_| {
                Ok(Self {
                    ctx: NonNull::new(ctx.assume_init())
                        .ok_or_else(|| crate::Error::new(crate::ErrorKind::InitializationFailed))?,
                })
            })
        }
    }

    pub fn get_frame_info(&self, src: &[u8]) -> Result<(FrameInfo, usize)> {
        let mut info = MaybeUninit::<FrameInfo>::uninit();
        let mut src_len = src.len();
        let code = unsafe {
            binding::LZ4F_getFrameInfo(
                self.ctx.as_ptr(),
                info.as_mut_ptr(),
                src.as_ptr() as *const c_void,
                &mut src_len as *mut usize,
            )
        };
        result_from_code(code).map(|_| (unsafe { info.assume_init() }, src_len))
    }

    pub fn decompress_dict(
        &mut self,
        src: &[u8],
        dst: &mut [u8],
        dict: &[u8],
        stable_dst: bool,
    ) -> Result<(usize, usize, usize)> {
        let mut dst_len = dst.len();
        let mut src_len = src.len();
        let opt = LZ4FDecompressionOptions::stable(stable_dst);
        let code = unsafe {
            binding::LZ4F_decompress_usingDict(
                self.ctx.as_ptr(),
                dst.as_mut_ptr() as *mut c_void,
                &mut dst_len as *mut usize,
                src.as_ptr() as *const c_void,
                &mut src_len as *mut usize,
                dict.as_ptr() as *const c_void,
                dict.len(),
                &opt as *const LZ4FDecompressionOptions,
            )
        };
        result_from_code(code).map(|_| (src_len, dst_len, code))
    }

    pub fn reset(&mut self) {
        unsafe {
            binding::LZ4F_resetDecompressionContext(self.ctx.as_ptr());
        }
    }
}

impl Drop for DecompressionContext {
    fn drop(&mut self) {
        unsafe {
            binding::LZ4F_freeDecompressionContext(self.ctx.as_ptr());
        }
    }
}

pub fn compress_frame_bound(src_size: usize, prefs: &Preferences) -> usize {
    unsafe { binding::LZ4F_compressFrameBound(src_size, prefs as *const Preferences) }
}

pub fn header_size(src: &[u8]) -> usize {
    unsafe { binding::LZ4F_headerSize(src.as_ptr() as *const c_void, src.len()) }
}

pub fn compress(src: &[u8], dst: *mut u8, dst_len: usize, prefs: &Preferences) -> Result<usize> {
    let code = unsafe {
        binding::LZ4F_compressFrame(
            dst as *mut c_void,
            dst_len,
            src.as_ptr() as *const c_void,
            src.len(),
            prefs as *const Preferences,
        )
    };
    result_from_code(code).map(|_| code)
}

fn result_from_code(code: usize) -> Result<()> {
    Err(Error::new(match code.wrapping_neg() {
        1 => ErrorKind::Generic,
        2 => ErrorKind::MaxBlockSizeInvalid,
        3 => ErrorKind::BlockModeInvalid,
        4 => ErrorKind::ContentChecksumFlagInvalid,
        5 => ErrorKind::CompressionLevelInvalid,
        6 => ErrorKind::HeaderVersionWrong,
        7 => ErrorKind::BlockChecksumInvalid,
        8 => ErrorKind::ReservedFlagSet,
        9 => ErrorKind::AllocationFailed,
        10 => ErrorKind::SrcSizeTooLarge,
        11 => ErrorKind::DstMaxSizeTooSmall,
        12 => ErrorKind::FrameHeaderIncomplete,
        13 => ErrorKind::FrameTypeUnknown,
        14 => ErrorKind::FrameSizeWrong,
        15 => ErrorKind::SrcPtrWrong,
        16 => ErrorKind::DecompressionFailed,
        17 => ErrorKind::HeaderChecksumInvalid,
        18 => ErrorKind::ContentChecksumInvalid,
        19 => ErrorKind::FrameDecodingAlreadyStarted,
        _ => return Ok(()),
    }))
}

pub struct DictionaryHandle(NonNull<LZ4FCompressionDict>);

unsafe impl Send for DictionaryHandle {}
unsafe impl Sync for DictionaryHandle {}

impl DictionaryHandle {
    pub fn new(data: &[u8]) -> Result<Self> {
        let dict = unsafe { binding::LZ4F_createCDict(data.as_ptr() as *const c_void, data.len()) };
        NonNull::new(dict)
            .ok_or_else(|| crate::Error::new(crate::ErrorKind::InitializationFailed).into())
            .map(Self)
    }
}

impl Drop for DictionaryHandle {
    fn drop(&mut self) {
        unsafe {
            binding::LZ4F_freeCDict(self.0.as_ptr());
        }
    }
}
