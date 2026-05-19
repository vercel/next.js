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
    use std::sync::LazyLock;

    static PAGE_SIZE: LazyLock<Option<usize>> = LazyLock::new(|| {
        // Safety: `sysconf` is thread-safe and never accesses memory through
        // its argument.
        let value = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
        if value <= 0 {
            return None;
        }
        usize::try_from(value).ok()
    });

    /// Reads `/proc/self/statm` and returns the resident set size in bytes
    /// (the second whole number, multiplied by the system page size).
    pub fn memory_footprint() -> Option<usize> {
        let content = std::fs::read_to_string("/proc/self/statm").ok()?;
        let resident_pages = parse_resident_pages(&content)?;
        let page_size = (*PAGE_SIZE)?;
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
    /// Reads `rusage_info_v0::ri_phys_footprint` for the current process via
    /// `proc_pid_rusage`. This is what Apple calls the "memory footprint" of
    /// a process and is the value reported in Activity Monitor's "Memory"
    /// column.
    pub fn memory_footprint() -> Option<usize> {
        let mut info = std::mem::MaybeUninit::<libc::rusage_info_v0>::zeroed();
        // Safety: `proc_pid_rusage` writes a `rusage_info_v0` into the buffer
        // when called with `RUSAGE_INFO_V0`. `getpid` is always safe and
        // returns the current process id.
        let rc = unsafe {
            libc::proc_pid_rusage(
                libc::getpid(),
                libc::RUSAGE_INFO_V0,
                info.as_mut_ptr() as *mut libc::rusage_info_t,
            )
        };
        if rc != 0 {
            return None;
        }
        // Safety: `proc_pid_rusage` returned success, so the buffer is
        // initialized.
        let info = unsafe { info.assume_init() };
        usize::try_from(info.ri_phys_footprint).ok()
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
