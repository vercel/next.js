//! Per-OS live-memory reporting.
//!
//! This asks the OS for the process's resident/committed memory rather than deriving it from a
//! counter maintained at every allocation site. The query costs a few hundred nanoseconds, which
//! only suits callers that sample it (eviction decisions, status lines, trace samples) rather than
//! ones on an allocation hot path. Platforms without an implementation return `None`.

/// See [`super::TurboMalloc::memory_usage`].
pub fn memory_usage() -> Option<usize> {
    platform::memory_usage()
}

#[cfg(target_os = "macos")]
mod platform {
    /// `TASK_VM_INFO`, and the number of 4-byte words in `task_vm_info_data_t`.
    const TASK_VM_INFO: libc::c_int = 22;
    const TASK_VM_INFO_COUNT: u32 = 93;
    /// Byte offset of `phys_footprint` within `task_vm_info_data_t`.
    const PHYS_FOOTPRINT_OFFSET: usize = 144;
    /// `size_of::<task_vm_info_data_t>()`.
    const TASK_VM_INFO_SIZE: usize = TASK_VM_INFO_COUNT as usize * 4;

    // `libc`'s own `mach_task_self`/`mach_task_self_` are deprecated in favour of the `mach2`
    // crate. Declaring the one global we need keeps this to a single extern instead of a new
    // dependency; the kernel sets it up before `main` runs.
    unsafe extern "C" {
        static mach_task_self_: libc::mach_port_t;
    }

    /// Reads `phys_footprint` from `task_info(TASK_VM_INFO)`. This is the same figure Activity
    /// Monitor reports as "Memory", and it accounts for compressed pages, so it tracks what the
    /// process actually costs the system rather than what it asked the allocator for.
    pub fn memory_usage() -> Option<usize> {
        let mut info = [0u8; TASK_VM_INFO_SIZE];
        let mut count = TASK_VM_INFO_COUNT;

        // Safety: `task_info` writes at most `count` 4-byte words, and `info` is sized for exactly
        // that many. `mach_task_self_` is this process's task port, set up before `main` runs.
        let ret = unsafe {
            libc::task_info(
                mach_task_self_,
                TASK_VM_INFO as libc::task_flavor_t,
                info.as_mut_ptr() as libc::task_info_t,
                &mut count,
            )
        };

        // An older kernel may return a shorter struct; `phys_footprint` has to be within it.
        if ret != 0 || (count as usize) * 4 < PHYS_FOOTPRINT_OFFSET + 8 {
            return None;
        }
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&info[PHYS_FOOTPRINT_OFFSET..PHYS_FOOTPRINT_OFFSET + 8]);
        Some(u64::from_le_bytes(bytes) as usize)
    }
}

#[cfg(all(target_os = "linux", not(target_family = "wasm")))]
mod platform {
    /// Reads the resident set size from `/proc/self/statm`, whose second field is the resident
    /// page count.
    pub fn memory_usage() -> Option<usize> {
        let statm = std::fs::read_to_string("/proc/self/statm").ok()?;
        let resident_pages: usize = statm.split_ascii_whitespace().nth(1)?.parse().ok()?;
        // Safety: `_SC_PAGESIZE` is a valid sysconf name and the call has no preconditions.
        let page_size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
        if page_size <= 0 {
            return None;
        }
        Some(resident_pages * page_size as usize)
    }
}

#[cfg(not(any(
    target_os = "macos",
    all(target_os = "linux", not(target_family = "wasm"))
)))]
mod platform {
    pub fn memory_usage() -> Option<usize> {
        None
    }
}
