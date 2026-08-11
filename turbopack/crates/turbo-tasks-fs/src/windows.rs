use std::path::{Path, PathBuf};

/// Converts `path` into the verbatim, drive-letter-case-folded representation used internally by
/// [`crate::DiskFileSystem`] on Windows.
///
/// This is the purely lexical counterpart to [`std::fs::canonicalize`]: `to_verbatim`
/// (`GetFullPathNameW`) makes the path absolute and verbatim (`\\?\`-prefixed) but, unlike
/// `canonicalize`, does not touch the disk — it resolves neither symlinks nor 8.3 short names. The
/// drive letter is then upper-cased to match the form `GetFinalPathNameByHandle` (and thus
/// `canonicalize`) produces.
///
/// No-op on non-Windows platforms (returns `path` unchanged).
pub fn to_verbatim_with_case_folded_disk(path: &Path) -> std::io::Result<PathBuf> {
    #[cfg(windows)]
    {
        use std::{
            ffi::OsString,
            os::windows::ffi::{OsStrExt, OsStringExt},
            path::{Component, Prefix},
        };

        use omnipath::WinPathExt;

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

    #[cfg(not(windows))]
    Ok(path.to_path_buf())
}

#[cfg(all(test, windows))]
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
}
