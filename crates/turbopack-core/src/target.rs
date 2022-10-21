use std::fmt::Display;

use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub struct CompileTarget {
    /// <https://nodejs.org/api/os.html#osarch>
    pub arch: Arch,
    /// <https://nodejs.org/api/os.html#osplatform>
    pub platform: Platform,
    /// <https://nodejs.org/api/os.html#endianness>
    pub endianness: Endianness,
    pub libc: Libc,
}

impl Default for CompileTargetVc {
    fn default() -> Self {
        Self::current()
    }
}

#[turbo_tasks::value_impl]
impl CompileTargetVc {
    #[turbo_tasks::function]
    pub fn current() -> Self {
        Self::cell(CompileTarget {
            arch: CompileTarget::current_arch(),
            platform: CompileTarget::current_platform(),
            endianness: CompileTarget::current_endianness(),
            libc: CompileTarget::current_libc(),
        })
    }

    #[turbo_tasks::function]
    pub fn unknown() -> Self {
        Self::cell(CompileTarget {
            arch: Arch::Unknown,
            platform: Platform::Unknown,
            endianness: Endianness::Big,
            libc: Libc::Unknown,
        })
    }
}

impl Display for CompileTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl CompileTarget {
    pub fn dylib_ext(&self) -> &'static str {
        let platform = self.platform;
        match platform {
            Platform::Win32 => "dll",
            Platform::Darwin => "dylib",
            _ => "so",
        }
    }

    fn current_endianness() -> Endianness {
        #[cfg(target_endian = "little")]
        {
            Endianness::Little
        }
        #[cfg(target_endian = "big")]
        {
            Endianness::Big
        }
    }

    #[allow(unreachable_code)]
    fn current_arch() -> Arch {
        #[cfg(target_arch = "x86")]
        {
            return Arch::Ia32;
        }
        #[cfg(target_arch = "x86_64")]
        {
            return Arch::X64;
        }
        #[cfg(target_arch = "arm")]
        {
            return Arch::Arm;
        }
        #[cfg(target_arch = "aarch64")]
        {
            return Arch::Arm64;
        }
        #[cfg(target_arch = "mips")]
        {
            return Arch::Mips;
        }
        #[cfg(target_arch = "powerpc")]
        {
            return Arch::Ppc;
        }
        #[cfg(target_arch = "powerpc64")]
        {
            return Arch::Ppc64;
        }
        #[cfg(target_arch = "s390x")]
        {
            return Arch::S390x;
        }
        Arch::Unknown
    }

    #[allow(unreachable_code)]
    fn current_platform() -> Platform {
        #[cfg(target_os = "windows")]
        {
            return Platform::Win32;
        }
        #[cfg(target_os = "linux")]
        {
            return Platform::Linux;
        }
        #[cfg(target_os = "macos")]
        {
            return Platform::Darwin;
        }
        #[cfg(target_os = "android")]
        {
            return Platform::Android;
        }
        #[cfg(target_os = "freebsd")]
        {
            return Platform::Freebsd;
        }
        #[cfg(target_os = "openbsd")]
        {
            return Platform::Openbsd;
        }
        #[cfg(target_os = "solaris")]
        {
            return Platform::Sunos;
        }
        Platform::Unknown
    }

    #[allow(unreachable_code)]
    fn current_libc() -> Libc {
        #[cfg(target_env = "gnu")]
        {
            return Libc::Glibc;
        }
        #[cfg(target_env = "musl")]
        {
            return Libc::Musl;
        }
        #[cfg(target_env = "msvc")]
        {
            return Libc::Msvc;
        }
        #[cfg(target_env = "sgx")]
        {
            return Libc::Sgx;
        }
        Libc::Unknown
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[repr(u8)]
#[non_exhaustive]
pub enum Arch {
    Arm,
    Arm64,
    Ia32,
    Mips,
    Mipsel,
    Ppc,
    Ppc64,
    S390,
    S390x,
    X64,
    Unknown,
}

impl Arch {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Arm => "arm",
            Self::Arm64 => "arm64",
            Self::Ia32 => "ia32",
            Self::Mips => "mips",
            Self::Mipsel => "mipsel",
            Self::Ppc => "ppc",
            Self::Ppc64 => "ppc64",
            Self::S390 => "s390",
            Self::S390x => "s390x",
            Self::X64 => "x64",
            Self::Unknown => "unknown",
        }
    }
}

impl Display for Arch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[repr(u8)]
#[non_exhaustive]
pub enum Platform {
    Aix,
    Android,
    Darwin,
    Freebsd,
    Linux,
    Openbsd,
    Sunos,
    Win32,
    Unknown,
}

impl Platform {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Aix => "aix",
            Self::Android => "android",
            Self::Darwin => "darwin",
            Self::Freebsd => "freebsd",
            Self::Linux => "linux",
            Self::Openbsd => "openbsd",
            Self::Sunos => "sunos",
            Self::Win32 => "win32",
            Self::Unknown => "unknown",
        }
    }
}

impl Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum Endianness {
    Big,
    Little,
}

impl Endianness {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Big => "BE",
            Self::Little => "LE",
        }
    }
}

impl Display for Endianness {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum Libc {
    Glibc,
    Musl,
    Msvc,
    Unknown,
}

impl Libc {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Glibc => "glibc",
            Self::Musl => "musl",
            Self::Msvc => "msvc",
            Self::Unknown => "unknown",
        }
    }
}

impl Display for Libc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
