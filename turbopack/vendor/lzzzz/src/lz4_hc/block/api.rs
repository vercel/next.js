#![allow(unsafe_code)]

use super::super::binding;

use std::{
    cell::RefCell,
    ops::Deref,
    os::raw::{c_char, c_int, c_void},
};

pub const fn size_of_state() -> usize {
    binding::LZ4_STREAMHCSIZE
}

pub fn compress_ext_state(
    state: &mut [u8],
    src: &[u8],
    dst: *mut u8,
    dst_len: usize,
    compression_level: i32,
) -> usize {
    unsafe {
        binding::LZ4_compress_HC_extStateHC(
            state.as_mut_ptr() as *mut c_void,
            src.as_ptr() as *const c_char,
            dst as *mut c_char,
            src.len() as c_int,
            dst_len as c_int,
            compression_level as c_int,
        ) as usize
    }
}

pub fn compress_ext_state_fast_reset(
    state: &mut [u8],
    src: &[u8],
    dst: *mut u8,
    dst_len: usize,
    compression_level: i32,
) -> usize {
    unsafe {
        binding::LZ4_compress_HC_extStateHC_fastReset(
            state.as_mut_ptr() as *mut c_void,
            src.as_ptr() as *const c_char,
            dst as *mut c_char,
            src.len() as c_int,
            dst_len as c_int,
            compression_level as c_int,
        ) as usize
    }
}

pub fn compress_dest_size(
    state: &mut [u8],
    src: &[u8],
    dst: &mut [u8],
    compression_level: i32,
) -> (usize, usize) {
    let mut src_len = src.len() as i32;
    let dst_len = unsafe {
        binding::LZ4_compress_HC_destSize(
            state.as_mut_ptr() as *mut c_void,
            src.as_ptr() as *const c_char,
            dst.as_mut_ptr() as *mut c_char,
            &mut src_len as *mut c_int,
            dst.len() as c_int,
            compression_level as c_int,
        ) as usize
    };
    (src_len as usize, dst_len)
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
