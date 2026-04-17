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

    /// Reads the `some avg10=<value>` field from `/proc/pressure/memory`.
    /// Returns `None` if the file cannot be read or parsed (for example on
    /// kernels older than 4.20 or in containers without access to PSI).
    pub fn memory_pressure() -> Option<u8> {
        let content = std::fs::read_to_string("/proc/pressure/memory").ok()?;
        parse_psi(&content)
    }

    fn parse_psi(content: &str) -> Option<u8> {
        // Expected format:
        //   some avg10=0.00 avg60=0.00 avg300=0.00 total=...
        //   full avg10=0.00 avg60=0.00 avg300=0.00 total=...
        for line in content.lines() {
            let rest = line.strip_prefix("some ")?;
            for field in rest.split_ascii_whitespace() {
                if let Some(val) = field.strip_prefix("avg10=") {
                    let parsed: f64 = val.parse().ok()?;
                    return Some(clamp_percent(parsed));
                }
            }
        }
        None
    }

    #[cfg(test)]
    mod tests {
        use super::parse_psi;

        #[test]
        fn parses_typical_psi_content() {
            let content = "some avg10=12.34 avg60=5.67 avg300=1.00 total=123456\nfull avg10=0.00 \
                           avg60=0.00 avg300=0.00 total=0\n";
            assert_eq!(parse_psi(content), Some(12));
        }

        #[test]
        fn returns_none_on_malformed_content() {
            assert_eq!(parse_psi(""), None);
            assert_eq!(parse_psi("garbage"), None);
        }

        #[test]
        fn clamps_to_100() {
            let content = "some avg10=150.00 avg60=0.00 avg300=0.00 total=0\n";
            assert_eq!(parse_psi(content), Some(100));
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
