//! [`FileSystemPath`] and the path-resolution operations built on top of it.

use std::{error::Error, fmt, path::MAIN_SEPARATOR};

use anyhow::{Result, bail};
use auto_hash_map::{AutoMap, AutoSet};
use bincode::{Decode, Encode};
use indexmap::IndexSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, NonLocalValue, ResolvedVc, ValueToString, ValueToStringRef, Vc, trace::TraceRawVcs,
    turbobail, turbofmt,
};
use turbo_tasks_hash::HashAlgorithm;
use turbo_unix_path::{get_parent_path, get_relative_path_to, join_path, normalize_path};

use crate::{
    DirectoryContent, DirectoryEntry, FileContent, FileJsonContent, FileMeta, FileSystem,
    FileSystemEntryType, LinkContent, RawDirectoryContent, RawDirectoryEntry, ReadGlobResult,
    WriteLinkContent,
    glob::Glob,
    read_glob::{read_glob, track_glob},
};

#[derive(Debug, Clone, Hash)]
#[turbo_tasks::value(shared, task_input)]
pub struct FileSystemPath {
    pub fs: ResolvedVc<Box<dyn FileSystem>>,
    pub path: RcStr,
}

impl ValueToStringRef for FileSystemPath {
    async fn to_string_ref(&self) -> Result<RcStr> {
        turbofmt!("[{}]/{}", self.fs, self.path).await
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSystemPath {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(self.to_string_ref().await?))
    }
}

impl FileSystemPath {
    pub fn is_inside_ref(&self, other: &FileSystemPath) -> bool {
        if self.fs == other.fs && self.path.starts_with(&*other.path) {
            if other.path.is_empty() {
                true
            } else {
                self.path.as_bytes().get(other.path.len()) == Some(&b'/')
            }
        } else {
            false
        }
    }

    pub fn is_inside_or_equal_ref(&self, other: &FileSystemPath) -> bool {
        if self.fs == other.fs && self.path.starts_with(&*other.path) {
            if other.path.is_empty() {
                true
            } else {
                matches!(
                    self.path.as_bytes().get(other.path.len()),
                    Some(&b'/') | None
                )
            }
        } else {
            false
        }
    }

    pub fn is_root(&self) -> bool {
        self.path.is_empty()
    }

    pub fn is_in_node_modules(&self) -> bool {
        self.path.starts_with("node_modules/") || self.path.contains("/node_modules/")
    }

    /// Assumes `self` is a directory. Returns a unix-style relative path of `inner` inside of
    /// `self`, returns `None` if inner is not inside `self`.
    ///
    /// Note: this method always strips the leading `/` from the result.
    pub fn get_path_to<'a>(&self, inner: &'a FileSystemPath) -> Option<&'a str> {
        if self.fs != inner.fs {
            return None;
        }
        let path = inner.path.strip_prefix(&*self.path)?;
        if self.path.is_empty() {
            Some(path)
        } else if let Some(stripped) = path.strip_prefix('/') {
            Some(stripped)
        } else {
            None
        }
    }

    /// Returns a unix-style path of `other` relative to `self`. Supports traversing upwards (`../`)
    /// within the filesystem.
    pub fn get_relative_path_to(&self, other: &FileSystemPath) -> Option<RcStr> {
        if self.fs != other.fs {
            return None;
        }

        Some(get_relative_path_to(&self.path, &other.path).into())
    }

    /// Returns the final component of the FileSystemPath, or an empty string
    /// for the root path.
    pub fn file_name(&self) -> &str {
        let (_, file_name) = self.split_file_name();
        file_name
    }

    /// Returns true if this path has the given extension
    ///
    /// slightly faster than `self.extension() == Some(extension)` as we can simply match a
    /// suffix
    pub fn has_extension(&self, extension: &str) -> bool {
        debug_assert!(!extension.contains('/') && extension.starts_with('.'));
        self.path.ends_with(extension)
    }

    /// Returns the extension (without a leading `.`)
    pub fn extension(&self) -> Option<&str> {
        let (_, extension) = self.split_extension();
        extension
    }

    /// Splits the path into two components:
    /// 1. The path without the extension;
    /// 2. The extension, if any.
    fn split_extension(&self) -> (&str, Option<&str>) {
        if let Some((path_before_extension, extension)) = self.path.rsplit_once('.') {
            if extension.contains('/') ||
                // The file name begins with a `.` and has no other `.`s within.
                path_before_extension.ends_with('/') || path_before_extension.is_empty()
            {
                (self.path.as_str(), None)
            } else {
                (path_before_extension, Some(extension))
            }
        } else {
            (self.path.as_str(), None)
        }
    }

    /// Splits the path into two components:
    /// 1. The parent directory, if any;
    /// 2. The file name;
    fn split_file_name(&self) -> (Option<&str>, &str) {
        // Since the path is normalized, we know `parent`, if any, must not be empty.
        if let Some((parent, file_name)) = self.path.rsplit_once('/') {
            (Some(parent), file_name)
        } else {
            (None, self.path.as_str())
        }
    }

    /// Splits the path into three components:
    /// 1. The parent directory, if any;
    /// 2. The file stem;
    /// 3. The extension, if any.
    fn split_file_stem_extension(&self) -> (Option<&str>, &str, Option<&str>) {
        let (path_before_extension, extension) = self.split_extension();

        if let Some((parent, file_stem)) = path_before_extension.rsplit_once('/') {
            (Some(parent), file_stem, extension)
        } else {
            (None, path_before_extension, extension)
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct FileSystemPathOption(Option<FileSystemPath>);

#[turbo_tasks::value_impl]
impl FileSystemPathOption {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

impl FileSystemPath {
    /// Create a new FileSystemPath from a path within a FileSystem. The
    /// /-separated path is expected to be already normalized (this is asserted
    /// in dev mode).
    pub fn new_normalized_unchecked(fs: ResolvedVc<Box<dyn FileSystem>>, path: RcStr) -> Self {
        // On Windows, the path must be converted to a unix path before creating. But on
        // Unix, backslashes are a valid char in file names, and the path can be
        // provided by the user, so we allow it.
        debug_assert!(
            MAIN_SEPARATOR != '\\' || !path.contains('\\'),
            "path {path} must not contain a Windows directory '\\', it must be normalized to Unix \
             '/'",
        );
        debug_assert!(
            normalize_path(&path).as_deref() == Some(&*path),
            "path {path} must be normalized",
        );
        FileSystemPath { fs, path }
    }

    /// Adds a subpath to the current path. The /-separated `path` argument might contain ".." or
    /// "." segments, but it must not leave the root of the filesystem.
    pub fn join(&self, path: &str) -> Result<Self> {
        if let Some(path) = join_path(&self.path, path) {
            Ok(Self::new_normalized_unchecked(self.fs, path.into()))
        } else {
            bail!(
                "FileSystemPath(\"{}\").join(\"{}\") leaves the filesystem root",
                self.path,
                path,
            );
        }
    }

    /// Adds a suffix to the filename. `path` must not contain `/`.
    pub fn append(&self, path: &str) -> Result<Self> {
        if path.contains('/') {
            bail!(
                "FileSystemPath(\"{}\").append(\"{}\") must not append '/'",
                self.path,
                path,
            )
        }
        Ok(Self::new_normalized_unchecked(
            self.fs,
            format!("{}{}", self.path, path).into(),
        ))
    }

    /// Adds a suffix to the basename of the file path. `appending` must not contain `/`. The [file
    /// extension][FileSystemPath::extension] will stay intact.
    pub fn append_to_stem(&self, appending: &str) -> Result<Self> {
        if appending.contains('/') {
            bail!(
                "FileSystemPath({:?}).append_to_stem({:?}) must not append '/'",
                self.path,
                appending,
            )
        }
        if let (path, Some(ext)) = self.split_extension() {
            return Ok(Self::new_normalized_unchecked(
                self.fs,
                format!("{path}{appending}.{ext}").into(),
            ));
        }
        Ok(Self::new_normalized_unchecked(
            self.fs,
            format!("{}{}", self.path, appending).into(),
        ))
    }

    /// Similar to [FileSystemPath::join], but returns an [`Option`] that will be [`None`] when the
    /// joined path would leave the filesystem root.
    #[allow(clippy::needless_borrow)] // for windows build
    pub fn try_join(&self, path: &str) -> Option<FileSystemPath> {
        // TODO(PACK-3279): Remove this once we do not produce invalid paths at the first place.
        #[cfg(target_os = "windows")]
        let path = path.replace('\\', "/");

        join_path(&self.path, &path)
            .map(|p| Self::new_normalized_unchecked(self.fs, RcStr::from(p)))
    }

    /// Similar to [FileSystemPath::try_join], but returns [`None`] when the new path would leave
    /// the current path (not just the filesystem root). This is useful for preventing access
    /// outside of a directory.
    pub fn try_join_inside(&self, path: &str) -> Option<FileSystemPath> {
        if let Some(p) = join_path(&self.path, path)
            && p.starts_with(&*self.path)
        {
            return Some(Self::new_normalized_unchecked(self.fs, RcStr::from(p)));
        }
        None
    }

    /// DETERMINISM: Result is in random order. Either sort the result or do not depend on the
    /// order.
    pub fn read_glob(&self, glob: Vc<Glob>) -> Vc<ReadGlobResult> {
        read_glob(self.clone(), glob)
    }

    // Tracks all files and directories matching the glob using the filesystem watcher. Follows
    // symlinks as though they were part of the original hierarchy. The returned [`Vc`] will be
    // invalidated if a file or directory changes.
    pub fn track_glob(&self, glob: Vc<Glob>, include_dot_files: bool) -> Vc<Completion> {
        track_glob(self.clone(), glob, include_dot_files)
    }

    pub fn root(&self) -> Vc<Self> {
        self.fs().root()
    }
}

impl FileSystemPath {
    pub fn fs(&self) -> Vc<Box<dyn FileSystem>> {
        *self.fs
    }

    pub fn is_inside(&self, other: &FileSystemPath) -> bool {
        self.is_inside_ref(other)
    }

    pub fn is_inside_or_equal(&self, other: &FileSystemPath) -> bool {
        self.is_inside_or_equal_ref(other)
    }

    /// Creates a new [`FileSystemPath`] like `self` but with the given
    /// extension.
    pub fn with_extension(&self, extension: &str) -> FileSystemPath {
        let (path_without_extension, _) = self.split_extension();
        Self::new_normalized_unchecked(
            self.fs,
            // Like `Path::with_extension` and `PathBuf::set_extension`, if the extension is empty,
            // we remove the extension altogether.
            match extension.is_empty() {
                true => path_without_extension.into(),
                false => format!("{path_without_extension}.{extension}").into(),
            },
        )
    }

    /// Extracts the stem (non-extension) portion of self.file_name.
    ///
    /// The stem is:
    ///
    /// * [`None`], if there is no file name;
    /// * The entire file name if there is no embedded `.`;
    /// * The entire file name if the file name begins with `.` and has no other `.`s within;
    /// * Otherwise, the portion of the file name before the final `.`
    pub fn file_stem(&self) -> Option<&str> {
        let (_, file_stem, _) = self.split_file_stem_extension();
        if file_stem.is_empty() {
            return None;
        }
        Some(file_stem)
    }
}

impl std::fmt::Display for FileSystemPath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.path)
    }
}

#[turbo_tasks::function]
pub async fn rebase(
    fs_path: FileSystemPath,
    old_base: FileSystemPath,
    new_base: FileSystemPath,
) -> Result<Vc<FileSystemPath>> {
    let new_path;
    if old_base.path.is_empty() {
        if new_base.path.is_empty() {
            new_path = fs_path.path.clone();
        } else {
            new_path = [new_base.path.as_str(), "/", &fs_path.path].concat().into();
        }
    } else {
        let base_path = [&old_base.path, "/"].concat();
        if !fs_path.path.starts_with(&base_path) {
            turbobail!(
                "rebasing {fs_path} from {old_base} onto {new_base} doesn't work because it's not \
                 part of the source path",
            );
        }
        if new_base.path.is_empty() {
            new_path = [&fs_path.path[base_path.len()..]].concat().into();
        } else {
            new_path = [new_base.path.as_str(), &fs_path.path[old_base.path.len()..]]
                .concat()
                .into();
        }
    }
    Ok(new_base.fs.root().await?.join(&new_path)?.cell())
}

// Not turbo-tasks functions, only delegating
impl FileSystemPath {
    pub fn read(&self) -> Vc<FileContent> {
        self.fs().read(self.clone())
    }

    pub fn read_link(&self) -> Vc<LinkContent> {
        self.fs().read_link(self.clone())
    }

    pub fn is_junction_point(&self) -> Vc<bool> {
        self.fs().is_junction_point(self.clone())
    }

    pub fn read_json(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json()
    }

    pub fn read_json5(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json5()
    }

    /// Hashes the file content (but not as a byte-exact content hash). This does NOT follow
    /// symlinks, so use this when you only want the hash of the file itself, not whatever it
    /// might point to.
    ///
    /// This is basically `isSymlink ? self.read_link().hash() : self.read().hash()`.
    pub fn hash_file(&self, salt: Vc<RcStr>, algorithm: HashAlgorithm) -> Vc<RcStr> {
        hash_file(self.clone(), salt, algorithm)
    }

    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    pub fn raw_read_dir(&self) -> Vc<RawDirectoryContent> {
        self.fs().raw_read_dir(self.clone())
    }

    pub fn write(&self, content: Vc<FileContent>) -> Vc<()> {
        self.fs().write(self.clone(), content)
    }

    /// Creates a symbolic link on *nix platforms. On Windows, directory links are created as
    /// junction points. Links to files on Windows are attempted to be created as symbolic links.
    ///
    /// [Windows supports symbolic links][windows-symlink], but they [can require elevated
    /// privileges][windows-privileges] if "developer mode" is not enabled, so we can't safely use
    /// them. Using junction points [matches the behavior of pnpm][pnpm-windows].
    ///
    /// It is not recommended to create non-directory links, as this is not portable and will likely
    /// fail on Windows.
    ///
    /// [windows-symlink]: https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/
    /// [windows-privileges]: https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/create-symbolic-links
    /// [pnpm-windows]: https://pnpm.io/faq#does-it-work-on-windows
    pub fn write_link(&self, target: Vc<WriteLinkContent>) -> Vc<()> {
        self.fs().write_link(self.clone(), target)
    }

    pub fn metadata(&self) -> Vc<FileMeta> {
        self.fs().metadata(self.clone())
    }

    /// Returns the realpath to the file, resolving all symlinks.
    ///
    /// The outer [`anyhow::Error`] represents an internal error in turbo-tasks. Any other error is
    /// represented using a structured `RealPathError`.
    pub async fn realpath(&self) -> Result<Result<FileSystemPath, RealPathError>> {
        Ok(self.realpath_with_links().await?.path_result.clone())
    }

    pub fn rebase(
        fs_path: FileSystemPath,
        old_base: FileSystemPath,
        new_base: FileSystemPath,
    ) -> Vc<FileSystemPath> {
        rebase(fs_path, old_base, new_base)
    }
}

impl FileSystemPath {
    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    pub fn read_dir(&self) -> Vc<DirectoryContent> {
        read_dir(self.clone())
    }

    pub fn parent(&self) -> FileSystemPath {
        let path = &self.path;
        if path.is_empty() {
            return self.clone();
        }
        FileSystemPath::new_normalized_unchecked(self.fs, RcStr::from(get_parent_path(path)))
    }

    // It is important that get_type uses read_dir and not stat/metadata.
    // - `get_type` is called very very often during resolving and stat would
    // make it 1 syscall per call, whereas read_dir would make it 1 syscall per
    // directory.
    // - `metadata` allows you to use the "wrong" casing on
    // case-insensitive filesystems, while read_dir gives you the "correct"
    // casing. We want to enforce "correct" casing to avoid broken builds on
    // Vercel deployments (case-sensitive).
    pub fn get_type(&self) -> Vc<FileSystemEntryType> {
        get_type(self.clone())
    }

    pub fn realpath_with_links(&self) -> Vc<RealPathWithLinksResult> {
        realpath_with_links(self.clone())
    }
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct RealPathWithLinksResult {
    pub path_result: Result<FileSystemPath, RealPathError>,
    pub symlinks: Box<[FileSystemPath]>,
}

/// Errors that can occur when resolving a path with symlinks.
/// Many of these can be transient conditions that might happen when package managers are running.
#[derive(Debug, Clone, Hash, Eq, PartialEq, NonLocalValue, TraceRawVcs, Encode, Decode)]
pub struct RealPathError {
    original_path: FileSystemPath,
    kind: RealPathErrorType,
}

#[derive(Debug, Clone, Hash, Eq, PartialEq, NonLocalValue, TraceRawVcs, Encode, Decode)]
pub enum RealPathErrorType {
    TooManySymlinks {
        symlinks: Box<[FileSystemPath]>,
    },
    CycleDetected {
        symlinks: Box<[FileSystemPath]>,
    },
    /// A symlink or path component does not exist.
    NotFound,
    /// Resolution failed after finding a symlink, or the symlink was invalid to begin with.
    Invalid {
        reason: RcStr,
    },
}

impl RealPathError {
    pub fn kind(&self) -> &RealPathErrorType {
        &self.kind
    }
}

impl fmt::Display for RealPathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.kind {
            RealPathErrorType::TooManySymlinks { symlinks } => write!(
                f,
                "Symlink {} leads to too many other symlinks ({} links)",
                self.original_path,
                symlinks.len()
            ),
            RealPathErrorType::CycleDetected { symlinks } => write!(
                f,
                "Symlink {} is in a symlink loop: {:?}",
                self.original_path,
                symlinks
                    .iter()
                    .map(|symlink| &symlink.path)
                    .collect::<Vec<_>>()
            ),
            RealPathErrorType::Invalid { reason } => write!(
                f,
                "Symlink {} could not be resolved: {reason}",
                self.original_path
            ),
            RealPathErrorType::NotFound => write!(
                f,
                "Path {} could not be resolved because a component does not exist",
                self.original_path
            ),
        }
    }
}

impl Error for RealPathError {}

#[turbo_tasks::function]
async fn read_dir(path: FileSystemPath) -> Result<Vc<DirectoryContent>> {
    let fs = path.fs().to_resolved().await?;
    match &*fs.raw_read_dir(path.clone()).await? {
        RawDirectoryContent::NotFound => Ok(DirectoryContent::not_found()),
        RawDirectoryContent::Entries(entries) => {
            let mut normalized_entries = AutoMap::new();
            let dir_path = &path.path;
            for (name, entry) in entries {
                // Construct the path directly instead of going through `join`.
                // We do not need to normalize since the `name` is guaranteed to be a simple
                // path segment.
                let path = if dir_path.is_empty() {
                    name.clone()
                } else {
                    RcStr::from(format!("{dir_path}/{name}"))
                };

                let entry_path = FileSystemPath::new_normalized_unchecked(fs, path);
                let entry = match entry {
                    RawDirectoryEntry::File => DirectoryEntry::File(entry_path),
                    RawDirectoryEntry::Directory => DirectoryEntry::Directory(entry_path),
                    RawDirectoryEntry::Symlink => DirectoryEntry::Symlink(entry_path),
                    RawDirectoryEntry::Other => DirectoryEntry::Other(entry_path),
                };
                normalized_entries.insert(name.clone(), entry);
            }
            Ok(DirectoryContent::new(normalized_entries))
        }
    }
}

#[turbo_tasks::function]
async fn get_type(path: FileSystemPath) -> Result<Vc<FileSystemEntryType>> {
    if path.is_root() {
        return Ok(FileSystemEntryType::Directory.cell());
    }
    let parent = path.parent();
    let dir_content = parent.raw_read_dir().await?;
    match &*dir_content {
        RawDirectoryContent::NotFound => Ok(FileSystemEntryType::NotFound.cell()),
        RawDirectoryContent::Entries(entries) => {
            let (_, file_name) = path.split_file_name();
            if let Some(entry) = entries.get(file_name) {
                Ok(FileSystemEntryType::from(entry).cell())
            } else {
                Ok(FileSystemEntryType::NotFound.cell())
            }
        }
    }
}

#[turbo_tasks::function]
async fn realpath_with_links(path: FileSystemPath) -> Result<Vc<RealPathWithLinksResult>> {
    let error_result = |original_path, kind, symlinks| {
        RealPathWithLinksResult {
            path_result: Err(RealPathError {
                original_path,
                kind,
            }),
            symlinks,
        }
        .cell()
    };

    let original_path = path.clone();
    let mut current_path = path;
    let mut symlinks: IndexSet<FileSystemPath> = IndexSet::new();
    let mut visited: AutoSet<RcStr> = AutoSet::new();
    // Pick some arbitrary symlink depth limit... similar to the ELOOP logic for realpath(3).
    // SYMLOOP_MAX is 40 for Linux: https://unix.stackexchange.com/q/721724
    for _i in 0..40 {
        if current_path.is_root() {
            // fast path
            return Ok(RealPathWithLinksResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(),
            }
            .cell());
        }

        if !visited.insert(current_path.path.clone()) {
            let symlinks: Box<[_]> = symlinks.into_iter().collect();
            return Ok(error_result(
                original_path,
                RealPathErrorType::CycleDetected {
                    symlinks: symlinks.clone(),
                },
                symlinks,
            ));
        }

        // see if a parent segment of the path is a symlink and resolve that first
        let parent = current_path.parent();
        let parent_result = parent.realpath_with_links().owned().await?;
        let basename = current_path
            .path
            .rsplit_once('/')
            .map_or(current_path.path.as_str(), |(_, name)| name);
        symlinks.extend(parent_result.symlinks);
        match parent_result.path_result {
            Ok(path) => {
                if path != parent {
                    current_path = path.join(basename)?;
                }
            }
            Err(parent_error) => {
                let symlinks: Box<[_]> = symlinks.into_iter().collect();
                return Ok(error_result(original_path, parent_error.kind, symlinks));
            }
        }

        // use `get_type` before trying `read_link`, as there's a good chance of a cache hit on
        // `get_type`, and `read_link` isn't the common codepath.
        let entry_type = *current_path.get_type().await?;
        if !matches!(entry_type, FileSystemEntryType::Symlink) {
            if matches!(entry_type, FileSystemEntryType::NotFound) {
                return Ok(error_result(
                    original_path,
                    RealPathErrorType::NotFound,
                    symlinks.into_iter().collect(),
                ));
            }
            return Ok(RealPathWithLinksResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(),
            }
            .cell());
        }

        let link_content = current_path.read_link().await?;
        match &*link_content {
            LinkContent::Link { target } => {
                let target_path = target.file_system_path().clone();
                symlinks.insert(current_path);
                current_path = target_path;
            }
            LinkContent::NotFound => {
                return Ok(error_result(
                    original_path,
                    RealPathErrorType::NotFound,
                    symlinks.into_iter().collect(),
                ));
            }
            LinkContent::Invalid { reason } => {
                return Ok(error_result(
                    original_path,
                    RealPathErrorType::Invalid {
                        reason: reason.clone(),
                    },
                    symlinks.into_iter().collect(),
                ));
            }
        }
    }

    // Too many attempts, we bailed out!
    // Returning the followed symlinks is still important, even if there is an error! Otherwise
    // we may never notice if the symlink loop is fixed.
    let symlinks: Box<[_]> = symlinks.into_iter().collect();
    Ok(error_result(
        original_path,
        RealPathErrorType::TooManySymlinks {
            symlinks: symlinks.clone(),
        },
        symlinks,
    ))
}

#[turbo_tasks::function]
async fn hash_file(
    path: FileSystemPath,
    salt: Vc<RcStr>,
    algorithm: HashAlgorithm,
) -> Result<Vc<RcStr>> {
    match *path.get_type().await? {
        FileSystemEntryType::File => Ok(path.read().hash(salt, algorithm)),
        FileSystemEntryType::Symlink => Ok(path.read_link().hash(salt, algorithm)),
        FileSystemEntryType::NotFound | FileSystemEntryType::Error => {
            // Should this rather be `return None`?
            turbobail!("Cannot hash content of missing path {path}")
        }
        FileSystemEntryType::Directory | FileSystemEntryType::Other => {
            turbobail!("Cannot hash content of non-file path {path}")
        }
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;
    use crate::VirtualFileSystem;

    #[test]
    fn test_get_relative_path_to() {
        assert_eq!(get_relative_path_to("a/b/c", "a/b/c").as_str(), ".");
        assert_eq!(get_relative_path_to("a/c/d", "a/b/c").as_str(), "../../b/c");
        assert_eq!(get_relative_path_to("", "a/b/c").as_str(), "./a/b/c");
        assert_eq!(get_relative_path_to("a/b/c", "").as_str(), "../../..");
        assert_eq!(
            get_relative_path_to("a/b/c", "c/b/a").as_str(),
            "../../../c/b/a"
        );
        assert_eq!(
            get_relative_path_to("file:///a/b/c", "file:///c/b/a").as_str(),
            "../../../c/b/a"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn with_extension() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new())
                .to_resolved()
                .await?;

            let path_txt = FileSystemPath::new_normalized_unchecked(fs, rcstr!("foo/bar.txt"));

            let path_json = path_txt.with_extension("json");
            assert_eq!(&*path_json.path, "foo/bar.json");

            let path_no_ext = path_txt.with_extension("");
            assert_eq!(&*path_no_ext.path, "foo/bar");

            let path_new_ext = path_no_ext.with_extension("json");
            assert_eq!(&*path_new_ext.path, "foo/bar.json");

            let path_no_slash_txt = FileSystemPath::new_normalized_unchecked(fs, rcstr!("bar.txt"));

            let path_no_slash_json = path_no_slash_txt.with_extension("json");
            assert_eq!(path_no_slash_json.path.as_str(), "bar.json");

            let path_no_slash_no_ext = path_no_slash_txt.with_extension("");
            assert_eq!(path_no_slash_no_ext.path.as_str(), "bar");

            let path_no_slash_new_ext = path_no_slash_no_ext.with_extension("json");
            assert_eq!(path_no_slash_new_ext.path.as_str(), "bar.json");

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn file_stem() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new())
                .to_resolved()
                .await?;

            let path = FileSystemPath::new_normalized_unchecked(fs, rcstr!(""));
            assert_eq!(path.file_stem(), None);

            let path = FileSystemPath::new_normalized_unchecked(fs, rcstr!("foo/bar.txt"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized_unchecked(fs, rcstr!("bar.txt"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized_unchecked(fs, rcstr!("foo/bar"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized_unchecked(fs, rcstr!("foo/.bar"));
            assert_eq!(path.file_stem(), Some(".bar"));

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }

    mod hash_file {
        use std::{
            fs::{create_dir_all, write},
            path::Path,
        };

        use turbo_tasks::OperationVc;

        use super::*;
        use crate::DiskFileSystem;

        /// Creates a symbolic link, mirroring the platform handling of the `read_glob` tests. On
        /// Windows a link to a directory is created as a junction point, which requires an
        /// absolute target.
        fn symlink(target: &Path, link: &Path) -> std::io::Result<()> {
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(target, link)
            }
            #[cfg(windows)]
            {
                if std::fs::metadata(target).is_ok_and(|metadata| metadata.is_dir()) {
                    assert!(
                        target.is_absolute(),
                        "a junction point needs an absolute target"
                    );
                    std::os::windows::fs::junction_point(target, link)
                } else {
                    std::os::windows::fs::symlink_file(target, link)
                }
            }
        }

        /// Two directories that hold a file of the *same name* but with *different content*, each
        /// with a symlink pointing at it through the *same* relative target. Plus the entry types
        /// that `hash_file` has to tell apart.
        fn create_fixture(root: &Path, outside: &Path) {
            write(outside.join("outside.txt"), b"outside").unwrap();

            create_dir_all(root.join("data-a")).unwrap();
            write(root.join("data-a/value.txt"), b"aaa").unwrap();
            symlink(Path::new("value.txt"), &root.join("data-a/link")).unwrap();
            symlink(
                Path::new("../data-b/value.txt"),
                &root.join("data-a/link-other"),
            )
            .unwrap();

            create_dir_all(root.join("data-b")).unwrap();
            write(root.join("data-b/value.txt"), b"bbbbbb").unwrap();
            symlink(Path::new("value.txt"), &root.join("data-b/link")).unwrap();

            create_dir_all(root.join("dir")).unwrap();
            write(root.join("dir/inside.txt"), b"inside").unwrap();
            // the regression from #97507: reading *through* this link hits the directory
            symlink(&root.join("dir"), &root.join("link-dir")).unwrap();
            // a link whose target doesn't exist
            symlink(Path::new("nope.txt"), &root.join("dangling")).unwrap();
            // a link whose target leaves the filesystem root
            symlink(&outside.join("outside.txt"), &root.join("escaping")).unwrap();
        }

        #[turbo_tasks::function(operation, root)]
        async fn hash_file_operation(disk_root: RcStr, entry: RcStr) -> Result<Vc<RcStr>> {
            let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(disk_root));
            let path = fs.root().await?.join(&entry)?;
            Ok(path.hash_file(Vc::cell(rcstr!("salt")), HashAlgorithm::Xxh3Hash128Hex))
        }

        /// `Ok` with the hash, or `Err` with the (flattened) error message.
        async fn hash_of(disk_root: &RcStr, entry: RcStr) -> Result<RcStr, String> {
            let operation: OperationVc<RcStr> = hash_file_operation(disk_root.clone(), entry);
            match operation.read_strongly_consistent().await {
                Ok(hash) => Ok((*hash).clone()),
                Err(err) => Err(format!("{err:#}")),
            }
        }

        /// `hash_file` hashes a symlink *itself* rather than what it points at, so that a link to a
        /// directory can be hashed at all and so that the hash matches what consumers write out
        /// (they recreate a symlink as a symlink). See #97507.
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn hashes_by_entry_type() {
            let scratch = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            create_fixture(scratch.path(), outside.path());

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            let disk_root: RcStr = scratch.path().to_str().unwrap().into();
            tt.run_once(async move {
                let file_a = hash_of(&disk_root, rcstr!("data-a/value.txt")).await;
                let file_b = hash_of(&disk_root, rcstr!("data-b/value.txt")).await;
                let link_a = hash_of(&disk_root, rcstr!("data-a/link")).await;
                let link_b = hash_of(&disk_root, rcstr!("data-b/link")).await;
                let link_other = hash_of(&disk_root, rcstr!("data-a/link-other")).await;
                let link_dir = hash_of(&disk_root, rcstr!("link-dir")).await;
                let dangling = hash_of(&disk_root, rcstr!("dangling")).await;
                let escaping = hash_of(&disk_root, rcstr!("escaping")).await;
                let dir = hash_of(&disk_root, rcstr!("dir")).await;
                let missing = hash_of(&disk_root, rcstr!("gone.txt")).await;

                // A regular file hashes its content.
                let file_a = file_a.expect("a file is hashable");
                let file_b = file_b.expect("a file is hashable");
                assert_ne!(file_a, file_b, "the two files have different content");

                // A symlink is hashable, including one that points at a directory - reading
                // through that link would fail with `Is a directory (os error 21)`.
                let link_a = link_a.expect("a symlink to a file is hashable");
                let link_b = link_b.expect("a symlink to a file is hashable");
                let link_other = link_other.expect("a symlink to a file is hashable");
                let link_dir = link_dir.expect("a symlink to a directory is hashable");
                // A dangling link is still a link, and so is one that leaves the root (it is
                // reported as `LinkContent::Invalid`).
                let dangling = dangling.expect("a dangling symlink is hashable");
                let escaping = escaping.expect("a symlink leaving the root is hashable");

                // The link is hashed, not the file it points at: `data-a/link` and `data-b/link`
                // point at files with *different content* through the *same* target, so they hash
                // the same...
                assert_eq!(
                    link_a, link_b,
                    "the content of the target must not affect the hash of the link"
                );
                // ...while a link with a different target hashes differently.
                assert_ne!(
                    link_a, link_other,
                    "the target of the link must affect the hash of the link"
                );
                // ...and a link never hashes like the file it points at.
                assert_ne!(link_a, file_a);

                // All of the hashes above are distinct, i.e. nothing collapses into a shared
                // "symlink" hash.
                let hashes = [&link_a, &link_other, &link_dir, &dangling, &escaping];
                for (index, hash) in hashes.iter().enumerate() {
                    for other in &hashes[index + 1..] {
                        assert_ne!(hash, other, "every distinct link hashes distinctly");
                    }
                }

                // Entries that have no content to hash are errors today. `hash_file` carries an
                // open question on whether these should return `None` instead - if that changes,
                // these two assertions are the ones to revisit.
                assert!(
                    dir.as_ref()
                        .is_err_and(|err| err.contains("Cannot hash content of non-file path")),
                    "a directory is not hashable, got {dir:?}"
                );
                assert!(
                    missing
                        .as_ref()
                        .is_err_and(|err| err.contains("Cannot hash content of missing path")),
                    "a missing path is not hashable, got {missing:?}"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap()
        }
    }
}
