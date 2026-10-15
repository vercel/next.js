//! Asymmetric memory barriers, for a store-load handshake where one side runs constantly and the
//! other rarely.
//!
//! A store-load handshake (each side stores its own flag, then loads the other's) normally needs a
//! full fence on both sides. [`AsymmetricBarrier::light`] lets the frequent side get away with a
//! compiler-only fence, by making the rare side pay for both: [`AsymmetricBarrier::heavy`] has the
//! kernel run a full memory barrier on every thread of the process. Whatever point in its program
//! a thread is at when that happens, its stores before that point are visible to the heavy
//! side's loads afterwards, and its loads after that point see the heavy side's stores before.
//!
//! - Linux: `membarrier(MEMBARRIER_CMD_PRIVATE_EXPEDITED)`, which interrupts every CPU currently
//!   running a thread of this process. Threads not running pass through a context switch first.
//! - Windows: `FlushProcessWriteBuffers`, which does the same.
//! - Elsewhere, or when the kernel refuses (e.g. older kernels or seccomp filters), both sides are
//!   `SeqCst` fences, the usual symmetric handshake.
//!
//! This is the technique behind userspace RCU and folly's `asymmetricLightBarrier`. Rust's memory
//! model has no notion of it, so the reasoning above is about what the hardware and kernel do.

use std::sync::atomic::{Ordering, compiler_fence, fence};

#[derive(Clone, Copy)]
pub struct AsymmetricBarrier {
    /// Whether [`Self::heavy`] interrupts other threads. Fixed at construction, so a light and a
    /// heavy barrier from the same value always pair up.
    heavy_available: bool,
}

impl AsymmetricBarrier {
    /// Uses the platform's heavy barrier if it's available, else symmetric `SeqCst` fences.
    pub fn new() -> Self {
        Self {
            heavy_available: platform::available(),
        }
    }

    /// Symmetric `SeqCst` fences on both sides, regardless of platform support.
    #[cfg(test)]
    pub fn symmetric() -> Self {
        Self {
            heavy_available: false,
        }
    }

    /// Whether this uses a platform heavy barrier rather than symmetric fences.
    #[cfg(test)]
    pub fn is_asymmetric(&self) -> bool {
        self.heavy_available
    }

    /// The frequent side's barrier: orders this thread's earlier memory accesses before its later
    /// ones, as long as the other side uses [`Self::heavy`].
    #[inline(always)]
    pub fn light(&self) {
        if self.heavy_available {
            compiler_fence(Ordering::SeqCst);
        } else {
            fence(Ordering::SeqCst);
        }
    }

    /// The rare side's barrier: acts as a `SeqCst` fence on this thread and as one on every other
    /// thread at whatever point it is at.
    pub fn heavy(&self) {
        fence(Ordering::SeqCst);
        if self.heavy_available {
            platform::heavy();
            fence(Ordering::SeqCst);
        }
    }
}

impl Default for AsymmetricBarrier {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::sync::OnceLock;

    use libc::{
        MEMBARRIER_CMD_PRIVATE_EXPEDITED, MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED, c_int, c_long,
        c_uint,
    };

    fn membarrier(cmd: c_int) -> c_long {
        // SAFETY: `membarrier` takes no pointers; with `flags` 0 the third argument is ignored.
        unsafe { libc::syscall(libc::SYS_membarrier, cmd, 0 as c_uint, 0 as c_int) }
    }

    pub fn available() -> bool {
        // A process registers once; the expedited command fails until it has.
        static REGISTERED: OnceLock<bool> = OnceLock::new();
        *REGISTERED.get_or_init(|| membarrier(MEMBARRIER_CMD_REGISTER_PRIVATE_EXPEDITED) == 0)
    }

    pub fn heavy() {
        // After a successful registration this can't fail, and if it did the light side would
        // already have relied on it, so there is nothing safe to fall back to.
        let result = membarrier(MEMBARRIER_CMD_PRIVATE_EXPEDITED);
        assert_eq!(
            result,
            0,
            "membarrier(MEMBARRIER_CMD_PRIVATE_EXPEDITED) failed: {}",
            std::io::Error::last_os_error()
        );
    }
}

#[cfg(windows)]
mod platform {
    pub fn available() -> bool {
        true
    }

    pub fn heavy() {
        // SAFETY: takes no arguments and has no preconditions.
        unsafe { windows_sys::Win32::System::Threading::FlushProcessWriteBuffers() }
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    pub fn available() -> bool {
        false
    }

    pub fn heavy() {
        unreachable!("no platform heavy barrier")
    }
}
