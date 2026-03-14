/// Apply Linux-specific mmap advice flags that should be set on all persistent mmaps.
///
/// - `DontFork`: prevents mmap regions from being copied into child processes on `fork()`, avoiding
///   unnecessary memory duplication and potential SIGBUS.
/// - `Unmergeable`: opts pages out of KSM (Kernel Same-page Merging) since our data is unique
///   compressed content that won't benefit from deduplication scanning.
#[cfg(target_os = "linux")]
pub fn advise_mmap_for_persistence(mmap: &memmap2::Mmap) -> anyhow::Result<()> {
    mmap.advise(memmap2::Advice::DontFork)?;
    mmap.advise(memmap2::Advice::Unmergeable)?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn advise_mmap_for_persistence(_mmap: &memmap2::Mmap) -> anyhow::Result<()> {
    Ok(())
}
