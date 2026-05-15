//! Per-OS memory pressure detection.
//!
//! All implementations return a value in the range `0..=100`, where `0` means
//! no memory pressure and `100` means maximum memory pressure. Platforms that
//! do not expose a memory pressure signal (or for which the query fails)
//! return `None`.

/// See [`super::TurboMalloc::memory_pressure`].
pub fn memory_pressure() -> Option<u8> {
    platform::memory_pressure()
}

fn clamp_percent(value: f64) -> u8 {
    if !value.is_finite() {
        return 0;
    }
    value.round().clamp(0.0, 100.0) as u8
}

#[cfg(all(target_os = "linux", not(target_family = "wasm")))]
mod platform {
    use super::clamp_percent;

    /// Reads memory pressure on Linux. Prefers `/proc/pressure/memory` (the
    /// `some avg10` stall percentage) when the kernel exposes PSI, and falls
    /// back to `MemAvailable`/`MemTotal` from `/proc/meminfo` when it does
    /// not (older kernels, containers without PSI access, or kernels built
    /// without `CONFIG_PSI`).
    pub fn memory_pressure() -> Option<u8> {
        if let Ok(content) = std::fs::read_to_string("/proc/pressure/memory")
            && let Some(value) = parse_psi(&content)
        {
            return Some(value);
        }
        let content = std::fs::read_to_string("/proc/meminfo").ok()?;
        parse_meminfo(&content)
    }

    fn parse_psi(content: &str) -> Option<u8> {
        // Expected format:
        //   some avg10=0.00 avg60=0.00 avg300=0.00 total=...
        //   full avg10=0.00 avg60=0.00 avg300=0.00 total=...
        for line in content.lines() {
            let Some(rest) = line.strip_prefix("some ") else {
                continue;
            };
            for field in rest.split_ascii_whitespace() {
                if let Some(val) = field.strip_prefix("avg10=") {
                    let parsed: f64 = val.parse().ok()?;
                    return Some(clamp_percent(parsed));
                }
            }
        }
        None
    }

    fn parse_meminfo(content: &str) -> Option<u8> {
        // Returns `(MemTotal - MemAvailable) / MemTotal * 100`, i.e. the
        // percentage of physical memory currently unavailable — analogous to
        // Windows' `dwMemoryLoad`.
        let mut total: Option<u64> = None;
        let mut available: Option<u64> = None;
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                total = parse_kb(rest);
            } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
                available = parse_kb(rest);
            }
            if total.is_some() && available.is_some() {
                break;
            }
        }
        let total = total?;
        let available = available?;
        if total == 0 {
            return None;
        }
        let used = total.saturating_sub(available);
        let pct = (used as f64) * 100.0 / (total as f64);
        Some(clamp_percent(pct))
    }

    fn parse_kb(rest: &str) -> Option<u64> {
        // Expected format: "        12345 kB"
        let mut iter = rest.split_ascii_whitespace();
        iter.next()?.parse().ok()
    }

    #[cfg(test)]
    mod tests {
        use super::{parse_meminfo, parse_psi};

        #[test]
        fn parses_typical_psi_content() {
            let content = "some avg10=12.34 avg60=5.67 avg300=1.00 total=123456\nfull avg10=0.00 \
                           avg60=0.00 avg300=0.00 total=0\n";
            assert_eq!(parse_psi(content), Some(12));
        }

        #[test]
        fn returns_none_on_malformed_psi() {
            assert_eq!(parse_psi(""), None);
            assert_eq!(parse_psi("garbage"), None);
        }

        #[test]
        fn clamps_psi_to_100() {
            let content = "some avg10=150.00 avg60=0.00 avg300=0.00 total=0\n";
            assert_eq!(parse_psi(content), Some(100));
        }

        #[test]
        fn parses_meminfo() {
            let content =
                "MemTotal:       1000 kB\nMemFree:         500 kB\nMemAvailable:    750 kB\n";
            // used = 250, 25%
            assert_eq!(parse_meminfo(content), Some(25));
        }

        #[test]
        fn returns_none_on_missing_meminfo_fields() {
            assert_eq!(parse_meminfo("MemTotal: 1000 kB\n"), None);
            assert_eq!(parse_meminfo(""), None);
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::{ffi::c_void, mem::size_of};

    use super::clamp_percent;

    /// Reads the `kern.memorystatus_level` sysctl, which exposes the percentage
    /// of free memory available (0..=100). The returned memory pressure is
    /// `100 - free_percentage`.
    pub fn memory_pressure() -> Option<u8> {
        // `kern.memorystatus_level` returns an `int` (percentage of free
        // memory, 0..=100).
        let mut level: libc::c_int = 0;
        let mut size: libc::size_t = size_of::<libc::c_int>() as libc::size_t;
        let name = c"kern.memorystatus_level";

        // Safety: `sysctlbyname` writes up to `size` bytes into `&mut level`;
        // the buffer is large enough for a `c_int`. We pass a valid,
        // NUL-terminated C string as the first argument.
        let ret = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                &mut level as *mut libc::c_int as *mut c_void,
                &mut size,
                std::ptr::null_mut(),
                0,
            )
        };

        if ret != 0 || size != size_of::<libc::c_int>() as libc::size_t {
            return None;
        }

        let pressure = 100.0 - f64::from(level);
        Some(clamp_percent(pressure))
    }
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    /// Reads `MEMORYSTATUSEX::dwMemoryLoad`, which is the approximate
    /// percentage of physical memory in use (0..=100).
    pub fn memory_pressure() -> Option<u8> {
        let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        // Safety: `status` is a properly sized and initialized MEMORYSTATUSEX.
        let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
        if ok == 0 {
            return None;
        }
        let load = status.dwMemoryLoad;
        Some(load.min(100) as u8)
    }
}

#[cfg(not(any(
    all(target_os = "linux", not(target_family = "wasm")),
    target_os = "macos",
    windows,
)))]
mod platform {
    pub fn memory_pressure() -> Option<u8> {
        None
    }
}
