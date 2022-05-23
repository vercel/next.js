use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[turbo_tasks::value(shared, serialization: auto_for_input)]
#[derive(PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum CompileTarget {
    Current,
    Target(Target),
}

#[derive(
    PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs, Serialize, Deserialize,
)]
#[non_exhaustive]
pub struct Target {
    /// https://nodejs.org/api/os.html#osarch
    pub arch: Arch,
    /// https://nodejs.org/api/os.html#osplatform
    pub platform: Platform,
    /// https://nodejs.org/api/os.html#endianness
    pub endianness: Endianness,
}

impl Target {
    pub fn new(arch: Arch, platform: Platform, endianness: Endianness) -> Self {
        Self {
            arch,
            platform,
            endianness,
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
    pub fn to_str(&self) -> &str {
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
    pub fn to_str(&self) -> &str {
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
    pub fn to_str(&self) -> &str {
        match self {
            Self::Big => "BE",
            Self::Little => "LE",
        }
    }
}
