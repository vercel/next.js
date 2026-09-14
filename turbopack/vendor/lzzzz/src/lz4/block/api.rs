#![allow(unsafe_code)]

use super::super::binding;
use crate::{Error, ErrorKind, Result};

use std::{
    cell::RefCell,
    ops::Deref,
    os::raw::{c_char, c_int, c_void},
};

const LZ4_MAX_INPUT_SIZE: usize = 0x7E00_0000;

pub const fn compress_bound(input_size: usize) -> usize {
    (input_size <= LZ4_MAX_INPUT_SIZE) as usize * (input_size + (input_size / 255) + 16)
}

pub const fn size_of_state() -> usize {
    binding::LZ4_STREAMSIZE
}

pub fn compress_fast_ext_state(
    state: &mut [u8],
    src: &[u8],
    dst: *mut u8,
    dst_len: usize,
    acceleration: i32,
) -> usize {
    unsafe {
        binding::LZ4_compress_fast_extState(
            state.as_mut_ptr() as *mut c_void,
            src.as_ptr() as *const c_char,
            dst as *mut c_char,
            src.len() as c_int,
            dst_len as c_int,
            acceleration as c_int,
        ) as usize
    }
}

pub fn compress_fast_ext_state_fast_reset(
    state: &mut [u8],
    src: &[u8],
    dst: *mut u8,
    dst_len: usize,
    acceleration: i32,
) -> usize {
    unsafe {
        binding::LZ4_compress_fast_extState_fastReset(
            state.as_mut_ptr() as *mut c_void,
            src.as_ptr() as *const c_char,
            dst as *mut c_char,
            src.len() as c_int,
            dst_len as c_int,
            acceleration as c_int,
        ) as usize
    }
}

pub fn compress_dest_size(
    src: &[u8],
    dst: &mut [u8],
) -> Result<(usize, usize)> {
    let mut src_size: c_int = src.len() as c_int;
    let result = unsafe {
        binding::LZ4_compress_destSize(
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            &mut src_size as *mut c_int,
            dst.len() as c_int,
        )
    };
    if result == 0 {
        Err(Error::new(ErrorKind::CompressionFailed))
    } else {
        Ok((src_size as usize, result as usize))
    }
}

pub fn decompress_safe(src: &[u8], dst: &mut [u8]) -> Result<usize> {
    let result = unsafe {
        binding::LZ4_decompress_safe(
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            src.len() as c_int,
            dst.len() as c_int,
        )
    };
    if result < 0 {
        Err(Error::new(ErrorKind::DecompressionFailed))
    } else {
        Ok(result as usize)
    }
}

pub fn decompress_safe_partial(src: &[u8], dst: &mut [u8], original_size: usize) -> Result<usize> {
    let result = unsafe {
        binding::LZ4_decompress_safe_partial(
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            src.len() as c_int,
            original_size as c_int,
            dst.len() as c_int,
        )
    };
    if result < 0 {
        Err(Error::new(ErrorKind::DecompressionFailed))
    } else {
        Ok(result as usize)
    }
}

pub fn decompress_safe_using_dict(src: &[u8], dst: &mut [u8], dict: &[u8]) -> Result<usize> {
    let result = unsafe {
        binding::LZ4_decompress_safe_usingDict(
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            src.len() as c_int,
            dst.len() as c_int,
            dict.as_ptr() as *const c_char,
            dict.len() as c_int,
        )
    };
    if result < 0 {
        Err(Error::new(ErrorKind::DecompressionFailed))
    } else {
        Ok(result as usize)
    }
}

pub fn decompress_safe_partial_using_dict(
    src: &[u8],
    dst: &mut [u8],
    original_size: usize,
    dict: &[u8],
) -> Result<usize> {
    let result = unsafe {
        binding::LZ4_decompress_safe_partial_usingDict(
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            src.len() as c_int,
            original_size as c_int,
            dst.len() as c_int,
            dict.as_ptr() as *const c_char,
            dict.len() as c_int,
        )
    };
    if result < 0 {
        Err(Error::new(ErrorKind::DecompressionFailed))
    } else {
        Ok(result as usize)
    }
}

#[derive(Clone)]
pub struct ExtState(RefCell<Box<[u8]>>);

impl ExtState {
    fn new() -> Self {
        let size = size_of_state() + 1;
        Self(RefCell::new(vec![0; size].into_boxed_slice()))
    }

    pub fn with<F, R>(f: F) -> R
    where
        F: FnOnce(&Self, bool) -> R,
    {
        EXT_STATE.with(|state| {
            let reset = {
                let mut state = state.borrow_mut();
                let last = state.len() - 1;
                if state[last] == 0 {
                    state[last] = 1;
                    false
                } else {
                    true
                }
            };

            (f)(state, reset)
        })
    }
}

impl Deref for ExtState {
    type Target = RefCell<Box<[u8]>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

thread_local!(static EXT_STATE: ExtState = ExtState::new());
