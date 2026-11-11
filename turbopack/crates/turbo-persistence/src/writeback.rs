use fs_err::File;

/// Asks the OS to start writing the file's dirty pages to disk, without waiting for it.
///
/// A commit fsyncs every new file before it becomes visible. Without this hint the OS may keep all
/// of a large commit's data in the page cache until then (on Linux, background writeback starts
/// only once dirty pages exceed a share of the available memory), so the commit has to wait for
/// all of it to be written. Starting writeback as soon as a file is complete overlaps the disk
/// writes with the work of creating the remaining files, and the final fsync has little left to
/// do.
///
/// This is only a hint: it doesn't make anything durable, and errors are ignored. It's a no-op on
/// platforms without a suitable API.
pub(crate) fn start_writeback(file: &File) {
    #[cfg(all(target_os = "linux", not(miri)))]
    {
        use std::os::fd::AsRawFd;

        // SAFETY: `sync_file_range` only reads the file descriptor, which `file` keeps open for
        // the duration of the call. Offset 0 with length 0 means "to the end of the file".
        unsafe {
            libc::sync_file_range(file.as_raw_fd(), 0, 0, libc::SYNC_FILE_RANGE_WRITE);
        }
    }
    #[cfg(not(all(target_os = "linux", not(miri))))]
    let _ = file;
}
