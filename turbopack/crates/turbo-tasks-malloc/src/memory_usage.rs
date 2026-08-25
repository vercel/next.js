//! Per-OS live-memory reporting.
//!
//! This asks the OS for the process's resident/committed memory.
//!
//! Each platform reports the closest thing it has to "what this process currently costs the
//! system", so the figures are comparable in trend but not identical in what they include:
//! macOS uses `phys_footprint`, Linux the resident set size, and Windows the private working set.

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
    /// Reads `VmRSS` from `/proc/self/status`, the process's resident set size. `status` is used
    /// rather than `statm` because it reports kB directly, so no page-size lookup — and so no
    /// `libc` dependency — is needed.
    pub fn memory_usage() -> Option<usize> {
        super::parse_vm_rss(&std::fs::read_to_string("/proc/self/status").ok()?)
    }
}

/// Extracts `VmRSS` (in bytes) from the contents of `/proc/self/status`.
///
/// Compiled on every platform, not just Linux, so the parsing is covered by tests wherever they
/// run; only the Linux `platform` module calls it.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn parse_vm_rss(content: &str) -> Option<usize> {
    // Expected line, with the value in kB:
    //   VmRSS:	   12345 kB
    let rest = content
        .lines()
        .find_map(|line| line.strip_prefix("VmRSS:"))?;
    let kb: usize = rest.split_ascii_whitespace().next()?.parse().ok()?;
    Some(kb * 1024)
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::System::{
        ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX},
        Threading::GetCurrentProcess,
    };

    /// Reads `PrivateUsage` from `GetProcessMemoryInfo`, the process's private commit charge. This
    /// is the closest Windows equivalent to macOS' `phys_footprint`: it excludes memory shared
    /// with other processes, so it tracks what this process is responsible for. It is what Task
    /// Manager shows in its "Commit size" column.
    pub fn memory_usage() -> Option<usize> {
        let mut counters = PROCESS_MEMORY_COUNTERS_EX {
            cb: size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
            ..unsafe { std::mem::zeroed() }
        };

        // Safety: `counters` is a correctly sized and initialized `PROCESS_MEMORY_COUNTERS_EX`,
        // and its `cb` says so. The pseudo-handle from `GetCurrentProcess` needs no closing.
        let ok = unsafe {
            K32GetProcessMemoryInfo(
                GetCurrentProcess(),
                (&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX).cast(),
                counters.cb,
            )
        };
        if ok == 0 {
            return None;
        }
        Some(counters.PrivateUsage)
    }
}

// WASM has no OS to ask. `wasm32-unknown-unknown` has no memory reporting at all; under WASI the
// figure would have to come from the host, and nothing wires that up yet, so callers get `None`
// and fall back to not making memory-driven decisions.
#[cfg(not(any(
    target_os = "macos",
    all(target_os = "linux", not(target_family = "wasm")),
    windows,
)))]
mod platform {
    pub fn memory_usage() -> Option<usize> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::parse_vm_rss;

    #[test]
    fn parses_the_resident_set_size() {
        let content = "VmPeak:\t 2078044 kB\nVmSize:\t 2078044 kB\nVmRSS:\t   12345 kB\n";
        assert_eq!(parse_vm_rss(content), Some(12345 * 1024));
    }

    #[test]
    fn absent_or_malformed_vm_rss_reports_nothing() {
        assert_eq!(parse_vm_rss("VmSize:\t 2078044 kB\n"), None);
        assert_eq!(parse_vm_rss("VmRSS:\tnot-a-number kB\n"), None);
        assert_eq!(parse_vm_rss(""), None);
    }
}
