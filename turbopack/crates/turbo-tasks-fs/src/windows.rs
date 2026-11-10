use std::{
    ffi::OsString,
    io, mem,
    os::windows::ffi::{OsStrExt, OsStringExt},
    path::{Component, Path, PathBuf, Prefix},
    ptr::{null, null_mut},
};

use omnipath::WinPathExt;
use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    Storage::FileSystem::{
        CreateFileW, FILE_ATTRIBUTE_TAG_INFO, FILE_FLAG_BACKUP_SEMANTICS,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        FileAttributeTagInfo, GetFileInformationByHandleEx, OPEN_EXISTING,
    },
    System::SystemServices::IO_REPARSE_TAG_MOUNT_POINT,
};

pub(crate) fn is_link_junction_point(path: &Path) -> io::Result<bool> {
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }

    let mut tag_info = FILE_ATTRIBUTE_TAG_INFO {
        FileAttributes: 0,
        ReparseTag: 0,
    };
    let result = unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileAttributeTagInfo,
            (&mut tag_info as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
            mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    };
    let error = if result == 0 {
        Some(io::Error::last_os_error())
    } else {
        None
    };
    unsafe {
        CloseHandle(handle);
    }
    error.map_or(Ok(tag_info.ReparseTag == IO_REPARSE_TAG_MOUNT_POINT), Err)
}

/// Converts `path` into the verbatim, drive-letter-case-folded representation used internally by
/// [`crate::DiskFileSystem`] on Windows.
///
/// This is the purely lexical counterpart to [`std::fs::canonicalize`]: `to_verbatim`
/// (`GetFullPathNameW`) makes the path absolute and verbatim (`\\?\`-prefixed) but, unlike
/// `canonicalize`, does not touch the disk — it resolves neither symlinks nor 8.3 short names. The
/// drive letter is then upper-cased to match the form `GetFinalPathNameByHandle` (and thus
/// `canonicalize`) produces.
pub fn to_verbatim_with_case_folded_disk(path: &Path) -> io::Result<PathBuf> {
    // `to_verbatim` guarantees an absolute, verbatim path from here on, so there's no
    // non-verbatim case to guard against below.
    let path = path.to_verbatim()?;

    // Only `\\?\C:\...` (`VerbatimDisk`) paths carry a drive letter; verbatim UNC
    // (`\\?\UNC\...`) and other verbatim device paths (`\\?\prefix`) don't, so there's nothing
    // to case-fold for those.
    //
    // We can't read the letter from `VerbatimDisk(disk)` because that value is already
    // normalized to uppercase, so it wouldn't tell us whether the underlying path needs
    // rewriting.
    let is_verbatim_disk = matches!(
        path.components().next(),
        Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::VerbatimDisk(_))
    );
    if !is_verbatim_disk {
        return Ok(path);
    }

    // The layout is `\\?\C:\...`, so the drive letter is the 5th UTF-16 code unit (index 4)
    // and is guaranteed to be a-z or A-Z.
    if let Some(disk) = path.as_os_str().encode_wide().nth(4).map(|disk| disk as u8)
        && disk.is_ascii_lowercase()
    {
        // we must encode/decode because OsString's internal encoding is opaque/unstable
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide[4] = u16::from(disk.to_ascii_uppercase());
        return Ok(PathBuf::from(OsString::from_wide(&wide)));
    }

    Ok(path)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn fold(path: &str) -> String {
        to_verbatim_with_case_folded_disk(Path::new(path))
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned()
    }

    #[test]
    fn upper_cases_lower_drive_letter() {
        // `to_verbatim` passes an already-verbatim path through unchanged, so these exercise the
        // drive-letter case-folding in isolation.
        assert_eq!(fold(r"\\?\c:\foo\bar"), r"\\?\C:\foo\bar");
        assert_eq!(fold(r"\\?\z:\"), r"\\?\Z:\");
    }

    #[test]
    fn ignores_verbatim_paths_without_a_drive() {
        assert_eq!(
            fold(r"\\?\UNC\server\share\foo"),
            r"\\?\UNC\server\share\foo"
        );
    }

    #[test]
    fn identifies_junction_points() {
        let scratch = tempfile::tempdir().unwrap();
        let target = scratch.path().join("target");
        let link = scratch.path().join("link");
        let file = scratch.path().join("file");
        std::fs::create_dir(&target).unwrap();
        std::fs::File::create(&file).unwrap();
        std::os::windows::fs::junction_point(&target, &link).unwrap();

        assert!(is_link_junction_point(&link).unwrap());
        assert!(!is_link_junction_point(&file).unwrap());
    }
}
