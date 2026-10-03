//! Per-OS memory footprint detection.
//!
//! All implementations return the resident memory size of the current
//! process in bytes. Platforms that do not expose a memory footprint signal
//! (or for which the query fails) return `None`.

/// See [`super::TurboMalloc::memory_footprint`].
pub fn memory_footprint() -> Option<usize> {
    platform::memory_footprint()
}

#[cfg(all(target_os = "linux", not(target_family = "wasm")))]
mod platform {
    /// Reads `/proc/self/statm` and returns the resident set size in bytes
    /// (the second whole number, multiplied by the system page size).
    pub fn memory_footprint() -> Option<usize> {
        let content = std::fs::read_to_string("/proc/self/statm").ok()?;
        let resident_pages = parse_resident_pages(&content)?;
        let page_size = page_size()?;
        resident_pages.checked_mul(page_size)
    }

    fn parse_resident_pages(content: &str) -> Option<usize> {
        // Expected format: "<size> <resident> <shared> <text> 0 <data> 0"
        // where each value is in pages.
        let mut iter = content.split_ascii_whitespace();
        let _size = iter.next()?;
        let resident = iter.next()?;
        resident.parse().ok()
    }

    fn page_size() -> Option<usize> {
        // Safety: `sysconf` is thread-safe and never accesses memory through
        // its argument.
        let value = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
        if value <= 0 {
            return None;
        }
        usize::try_from(value).ok()
    }

    #[cfg(test)]
    mod tests {
        use super::parse_resident_pages;

        #[test]
        fn parses_typical_statm_content() {
            assert_eq!(
                parse_resident_pages("12345 6789 4321 8 0 1234 0\n"),
                Some(6789)
            );
        }

        #[test]
        fn returns_none_on_malformed_statm() {
            assert_eq!(parse_resident_pages(""), None);
            assert_eq!(parse_resident_pages("12345"), None);
            assert_eq!(parse_resident_pages("12345 garbage"), None);
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::mem::size_of;

    /// Reads `task_vm_info_data_t::phys_footprint` for the current task. This
    /// is what Apple calls the "memory footprint" of a process and is the
    /// value reported in Activity Monitor's "Memory" column.
    pub fn memory_footprint() -> Option<usize> {
        let mut info = std::mem::MaybeUninit::<libc::task_vm_info_data_t>::zeroed();
        let mut count: libc::mach_msg_type_number_t = libc::TASK_VM_INFO_COUNT;
        // Safety: `mach_task_self` is a thread-safe accessor for the current
        // task port. `task_info` writes up to `count` 32-bit words into our
        // properly sized and zero-initialized `task_vm_info_data_t` buffer.
        let kr = unsafe {
            libc::task_info(
                libc::mach_task_self(),
                libc::TASK_VM_INFO,
                info.as_mut_ptr() as libc::task_info_t,
                &mut count,
            )
        };
        if kr != libc::KERN_SUCCESS {
            return None;
        }
        // `phys_footprint` is filled in only when at least
        // `TASK_VM_INFO_REV1_COUNT` words are returned. Guard against older
        // kernels that return a smaller struct.
        if (count as usize) * size_of::<libc::integer_t>()
            < std::mem::offset_of!(libc::task_vm_info_data_t, phys_footprint) + size_of::<u64>()
        {
            return None;
        }
        // Safety: `task_info` returned `KERN_SUCCESS` and wrote at least
        // through `phys_footprint`, so the struct is initialized through that
        // field.
        let info = unsafe { info.assume_init() };
        usize::try_from(info.phys_footprint).ok()
    }
}

#[cfg(windows)]
mod platform {
    use std::mem::size_of;

    use windows_sys::Win32::System::{
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::GetCurrentProcess,
    };

    /// Reads `PROCESS_MEMORY_COUNTERS::WorkingSetSize`, which is the amount
    /// of memory currently resident for the calling process in bytes.
    pub fn memory_footprint() -> Option<usize> {
        let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
        // Safety: `counters` is a properly sized and zero-initialized
        // `PROCESS_MEMORY_COUNTERS`. `GetCurrentProcess` returns a
        // pseudo-handle that does not need closing.
        let ok = unsafe {
            GetProcessMemoryInfo(
                GetCurrentProcess(),
                &mut counters,
                size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            )
        };
        if ok == 0 {
            return None;
        }
        Some(counters.WorkingSetSize)
    }
}

#[cfg(not(any(
    all(target_os = "linux", not(target_family = "wasm")),
    target_os = "macos",
    windows,
)))]
mod platform {
    pub fn memory_footprint() -> Option<usize> {
        None
    }
}
