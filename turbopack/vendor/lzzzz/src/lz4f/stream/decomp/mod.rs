//! Streaming LZ4F decompressors.
mod bufread;
mod read;
mod write;

pub use bufread::*;
pub use read::*;
pub use write::*;

use crate::{
    common::DEFAULT_BUF_SIZE,
    lz4f::{
        api::{
            header_size, DecompressionContext, LZ4F_HEADER_SIZE_MAX,
            LZ4F_MIN_SIZE_TO_KNOW_HEADER_LENGTH,
        },
        FrameInfo, Result,
    },
    Error, ErrorKind,
};
use std::{borrow::Cow, cmp, pin::Pin, ptr};

#[derive(Clone, Copy, PartialEq)]
struct DictPtr(*const u8, usize);

#[allow(unsafe_code)]
unsafe impl Send for DictPtr {}

enum State {
    Header {
        header: [u8; LZ4F_HEADER_SIZE_MAX],
        header_len: usize,
    },
    Body {
        frame_info: FrameInfo,
        comp_dict: Option<DictPtr>,
    },
}

pub(crate) struct Decompressor<'a> {
    ctx: DecompressionContext,
    state: State,
    buffer: Vec<u8>,
    dict: Pin<Cow<'a, [u8]>>,
    header_only: bool,
}

impl<'a> Decompressor<'a> {
    pub fn new() -> Result<Self> {
        Ok(Self {
            ctx: DecompressionContext::new()?,
            state: State::Header {
                header: [0; LZ4F_HEADER_SIZE_MAX],
                header_len: 0,
            },
            buffer: Vec::new(),
            dict: Pin::new(Cow::Borrowed(&[])),
            header_only: false,
        })
    }

    pub fn set_dict<D>(&mut self, dict: D)
    where
        D: Into<Cow<'a, [u8]>>,
    {
        self.dict = Pin::new(dict.into());
    }

    pub fn frame_info(&self) -> Option<FrameInfo> {
        if let State::Body { frame_info, .. } = self.state {
            Some(frame_info)
        } else {
            None
        }
    }

    pub fn decode_header_only(&mut self, flag: bool) {
        self.header_only = flag;
    }

    pub fn decompress(&mut self, src: &[u8]) -> Result<usize> {
        let mut header_consumed = 0;
        if let State::Header {
            ref mut header,
            ref mut header_len,
        } = &mut self.state
        {
            if *header_len < LZ4F_MIN_SIZE_TO_KNOW_HEADER_LENGTH {
                let len = cmp::min(LZ4F_MIN_SIZE_TO_KNOW_HEADER_LENGTH - *header_len, src.len());
                header[*header_len..*header_len + len].copy_from_slice(&src[..len]);
                *header_len += len;
                header_consumed += len;
            }
            if *header_len >= LZ4F_MIN_SIZE_TO_KNOW_HEADER_LENGTH {
                let exact_header_len = header_size(&header[..*header_len]);
                if exact_header_len > LZ4F_HEADER_SIZE_MAX {
                    return Err(Error::new(ErrorKind::FrameHeaderInvalid).into());
                }
                let src = &src[header_consumed..];
                if *header_len < exact_header_len {
                    let len = cmp::min(exact_header_len - *header_len, src.len());
                    header[*header_len..*header_len + len].copy_from_slice(&src[..len]);
                    *header_len += len;
                    header_consumed += len;
                }
                if *header_len >= exact_header_len {
                    let (frame, rep) = self.ctx.get_frame_info(&header[..*header_len])?;
                    header_consumed = cmp::min(header_consumed, rep);

                    self.state = State::Body {
                        frame_info: frame,
                        comp_dict: None,
                    }
                }
            }
        }

        if let State::Header { header, header_len } = self.state {
            if src.is_empty() {
                self.ctx.get_frame_info(&header[..header_len])?;
            }
        }

        if self.header_only {
            return Ok(header_consumed);
        }

        let src = &src[header_consumed..];
        let dict_ptr = self.dict_ptr();
        if let State::Body {
            ref mut comp_dict, ..
        } = &mut self.state
        {
            if dict_ptr != *comp_dict.get_or_insert(dict_ptr) {
                return Err(Error::new(ErrorKind::DictionaryChangedDuringDecompression).into());
            }

            let len = self.buffer.len();
            if len < DEFAULT_BUF_SIZE {
                self.buffer.resize_with(DEFAULT_BUF_SIZE, Default::default)
            }
            let (src_len, dst_len, _) =
                self.ctx
                    .decompress_dict(src, &mut self.buffer[len..], &self.dict, false)?;
            self.buffer.resize_with(len + dst_len, Default::default);
            Ok(src_len + header_consumed)
        } else {
            Ok(header_consumed)
        }
    }

    fn dict_ptr(&self) -> DictPtr {
        let dict = &self.dict;
        if dict.is_empty() {
            DictPtr(ptr::null(), 0)
        } else {
            DictPtr(dict.as_ptr(), dict.len())
        }
    }

    pub fn buf(&self) -> &[u8] {
        &self.buffer
    }

    pub fn clear_buf(&mut self) {
        self.buffer.clear();
    }
}
