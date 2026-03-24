/// Apply Linux-specific mmap advice flags that should be set on all persistent mmaps.
///
/// - `DontFork`: prevents mmap regions from being copied into child processes on `fork()`, avoiding
///   unnecessary memory duplication and potential SIGBUS.
#[cfg(target_os = "linux")]
pub fn advise_mmap_for_persistence(mmap: &memmap2::Mmap) -> anyhow::Result<()> {
    use anyhow::Context;
    mmap.advise(memmap2::Advice::DontFork)
        .context("Failed to advise mmap DontFork")?;
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn advise_mmap_for_persistence(_mmap: &memmap2::Mmap) -> anyhow::Result<()> {
    Ok(())
}
