use std::fmt::Display;

use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[turbo_tasks::value(shared, serialization: auto_for_input)]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum CompileTarget {
    Current,
    Target(Target),
}

#[turbo_tasks::value_impl]
impl CompileTargetVc {
    #[turbo_tasks::function]
    pub fn current() -> Self {
        Self::cell(CompileTarget::Current)
    }
}

impl Display for CompileTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CompileTarget::Current => write!(f, "current target"),
            CompileTarget::Target(t) => write!(f, "{:?}", t),
        }
    }
}

impl CompileTarget {
    pub fn endianness(&self) -> &'static str {
        if let CompileTarget::Target(Target { endianness, .. }) = self {
            return endianness.to_str();
        }
        #[cfg(target_endian = "little")]
        {
            "LE"
        }
        #[cfg(target_endian = "big")]
        {
            "BE"
        }
    }

    #[allow(unreachable_code)]
    pub fn arch(&self) -> &'static str {
        if let CompileTarget::Target(Target { arch, .. }) = self {
            return arch.to_str();
        }
        #[cfg(target_arch = "x86")]
        {
            return "ia32";
        }
        #[cfg(target_arch = "x86_64")]
        {
            return "x64";
        }
        #[cfg(target_arch = "arm")]
        {
            return "arm";
        }
        #[cfg(target_arch = "aarch64")]
        {
            return "arm64";
        }
        #[cfg(target_arch = "mips")]
        {
            return "mips";
        }
        #[cfg(target_arch = "powerpc")]
        {
            return "ppc";
        }
        #[cfg(target_arch = "powerpc64")]
        {
            return "ppc64";
        }
        #[cfg(target_arch = "s390x")]
        {
            return "s390x";
        }
        "unknown"
    }

    #[allow(unreachable_code)]
    pub fn platform(&self) -> &'static str {
        if let CompileTarget::Target(Target { platform, .. }) = self {
            return platform.to_str();
        }
        #[cfg(target_os = "windows")]
        {
            return "win32";
        }
        #[cfg(target_os = "linux")]
        {
            return "linux";
        }
        #[cfg(target_os = "macos")]
        {
            return "darwin";
        }
        #[cfg(target_os = "android")]
        {
            return "android";
        }
        #[cfg(target_os = "freebsd")]
        {
            return "freebsd";
        }
        #[cfg(target_os = "openbsd")]
        {
            return "openbsd";
        }
        #[cfg(target_os = "solaris")]
        {
            return "sunos";
        }
        "unknown"
    }

    #[allow(unreachable_code)]
    pub fn libc(&self) -> &'static str {
        if let CompileTarget::Target(Target { libc, .. }) = self {
            return libc.to_str();
        }
        #[cfg(target_env = "gnu")]
        {
            return "glibc";
        }
        #[cfg(target_env = "musl")]
        {
            return "musl";
        }
        #[cfg(target_env = "msvc")]
        {
            return "msvc";
        }
        #[cfg(target_env = "sgx")]
        {
            return "sgx";
        }
        "unknown"
    }

    pub fn dylib_ext(&self) -> &'static str {
        let platform = if let CompileTarget::Target(Target { platform, .. }) = self {
            *platform
        } else {
            #[cfg(target_os = "windows")]
            {
                Platform::Win32
            }
            #[cfg(target_os = "linux")]
            {
                Platform::Linux
            }
            #[cfg(target_os = "macos")]
            {
                Platform::Darwin
            }
            #[cfg(target_os = "android")]
            {
                Platform::Android
            }
            #[cfg(target_os = "freebsd")]
            {
                Platform::Freebsd
            }
            #[cfg(target_os = "openbsd")]
            {
                Platform::Openbsd
            }
            #[cfg(target_os = "solaris")]
            {
                Platform::Sunos
            }
            #[cfg(target_os = "solaris")]
            {
                return "unknown";
            }
        };
        match platform {
            Platform::Win32 => "dll",
            Platform::Darwin => "dylib",
            _ => "so",
        }
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[non_exhaustive]
pub struct Target {
    /// <https://nodejs.org/api/os.html#osarch>
    pub arch: Arch,
    /// <https://nodejs.org/api/os.html#osplatform>
    pub platform: Platform,
    /// <https://nodejs.org/api/os.html#endianness>
    pub endianness: Endianness,
    pub libc: Libc,
}

impl Target {
    pub fn new(arch: Arch, platform: Platform, endianness: Endianness, libc: Libc) -> Self {
        Self {
            arch,
            platform,
            endianness,
            libc,
        }
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
}

impl Arch {
    pub fn to_str(&self) -> &'static str {
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
        }
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
}

impl Platform {
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Aix => "aix",
            Self::Android => "android",
            Self::Darwin => "darwin",
            Self::Freebsd => "freebsd",
            Self::Linux => "linux",
            Self::Openbsd => "openbsd",
            Self::Sunos => "sunos",
            Self::Win32 => "win32",
        }
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
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Big => "BE",
            Self::Little => "LE",
        }
    }
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[repr(u8)]
pub enum Libc {
    Glibc,
    Musl,
    Unknown,
}

impl Libc {
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Glibc => "glibc",
            Self::Musl => "musl",
            Self::Unknown => "unknown",
        }
    }
}
