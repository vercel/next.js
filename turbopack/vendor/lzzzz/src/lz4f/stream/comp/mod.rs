//! Streaming LZ4F compressors.
mod bufread;
mod read;
mod write;

use crate::lz4f::Result;

pub use bufread::*;
pub use read::*;
pub use write::*;

use crate::lz4f::{
    api::{CompressionContext, LZ4F_HEADER_SIZE_MAX},
    Dictionary, Preferences,
};

pub(crate) struct Compressor {
    ctx: CompressionContext,
    prefs: Preferences,
    state: State,
    buffer: Vec<u8>,
}

impl Compressor {
    pub fn new(prefs: Preferences, dict: Option<Dictionary>) -> Result<Self> {
        Ok(Self {
            ctx: CompressionContext::new(dict)?,
            prefs,
            state: State::Created,
            buffer: Vec::with_capacity(LZ4F_HEADER_SIZE_MAX),
        })
    }

    pub fn prefs(&self) -> &Preferences {
        &self.prefs
    }

    fn begin(&mut self) -> Result<()> {
        if let State::Created = self.state {
            assert!(self.buffer.is_empty());
            self.state = State::Active;
            let len = self.ctx.begin(
                self.buffer.as_mut_ptr(),
                self.buffer.capacity(),
                &self.prefs,
            )?;
            #[allow(unsafe_code)]
            unsafe {
                self.buffer.set_len(len);
            }
        }
        Ok(())
    }

    pub fn update(&mut self, src: &[u8], stable_src: bool) -> Result<()> {
        self.begin()?;
        let ext_len = CompressionContext::compress_bound(src.len(), &self.prefs);
        self.buffer.reserve(ext_len);
        let offset = self.buffer.len();
        #[allow(unsafe_code)]
        unsafe {
            let len = self.ctx.update(
                self.buffer.as_mut_ptr().add(offset),
                self.buffer.capacity() - offset,
                src,
                stable_src,
            )?;
            self.buffer.set_len(offset + len);
            if len == 0 {
                self.flush(stable_src)
            } else {
                Ok(())
            }
        }
    }

    pub fn flush(&mut self, stable_src: bool) -> Result<()> {
        self.begin()?;
        let ext_len = CompressionContext::compress_bound(0, &self.prefs);
        self.buffer.reserve(ext_len);
        let offset = self.buffer.len();
        #[allow(unsafe_code)]
        unsafe {
            let len = self.ctx.flush(
                self.buffer.as_mut_ptr().add(offset),
                self.buffer.capacity() - offset,
                stable_src,
            )?;
            self.buffer.set_len(offset + len);
        }
        Ok(())
    }

    pub fn end(&mut self, stable_src: bool) -> Result<()> {
        self.begin()?;
        if let State::Active = self.state {
            self.state = State::Finished;
            let ext_len = CompressionContext::compress_bound(0, &self.prefs);
            self.buffer.reserve(ext_len);
            let offset = self.buffer.len();
            #[allow(unsafe_code)]
            unsafe {
                let len = self.ctx.end(
                    self.buffer.as_mut_ptr().add(offset),
                    self.buffer.capacity() - offset,
                    stable_src,
                )?;
                self.buffer.set_len(offset + len);
            }
        }
        Ok(())
    }

    pub fn buf(&self) -> &[u8] {
        &self.buffer
    }

    pub fn clear_buf(&mut self) {
        self.buffer.clear();
    }
}

pub(crate) enum State {
    Created,
    Active,
    Finished,
}
