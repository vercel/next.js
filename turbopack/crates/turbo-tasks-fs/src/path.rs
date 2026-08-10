//! [`FileSystemPath`] and the path-resolution operations built on top of it.

use std::path::MAIN_SEPARATOR;

use anyhow::{Result, bail};
use auto_hash_map::{AutoMap, AutoSet};
use bincode::{Decode, Encode};
use indexmap::IndexSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, NonLocalValue, ResolvedVc, ValueToString, ValueToStringRef, Vc, trace::TraceRawVcs,
    turbobail, turbofmt,
};
use turbo_unix_path::{get_parent_path, get_relative_path_to, join_path, normalize_path};

use crate::{
    DirectoryContent, DirectoryEntry, FileContent, FileJsonContent, FileMeta, FileSystem,
    FileSystemEntryType, LinkContent, LinkType, RawDirectoryContent, RawDirectoryEntry,
    ReadGlobResult,
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

    pub fn read_json(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json()
    }

    pub fn read_json5(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json5()
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

    /// Creates a symbolic link to a directory on *nix platforms, or a directory junction point on
    /// Windows.
    ///
    /// [Windows supports symbolic links][windows-symlink], but they [can require elevated
    /// privileges][windows-privileges] if "developer mode" is not enabled, so we can't safely use
    /// them. Using junction points [matches the behavior of pnpm][pnpm-windows].
    ///
    /// This only supports directories because Windows junction points are incompatible with files.
    /// To ensure compatibility, this will return an error if the target is a file, even on
    /// platforms with full symlink support.
    ///
    /// **We intentionally do not provide an API for symlinking a file**, as we cannot support that
    /// on all Windows configurations.
    ///
    /// [windows-symlink]: https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/
    /// [windows-privileges]: https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/create-symbolic-links
    /// [pnpm-windows]: https://pnpm.io/faq#does-it-work-on-windows
    pub fn write_symbolic_link_dir(&self, target: Vc<LinkContent>) -> Vc<()> {
        self.fs().write_link(self.clone(), target)
    }

    pub fn metadata(&self) -> Vc<FileMeta> {
        self.fs().metadata(self.clone())
    }

    // Returns the realpath to the file, resolving all symlinks and reporting an error if the path
    // is invalid.
    pub async fn realpath(&self) -> Result<FileSystemPath> {
        let result = &(*self.realpath_with_links().await?);
        match &result.path_result {
            Ok(path) => Ok(path.clone()),
            Err(error) => bail!("{}", error.as_error_message(self, result).await?),
        }
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

    pub fn realpath_with_links(&self) -> Vc<RealPathResult> {
        realpath_with_links(self.clone())
    }
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct RealPathResult {
    pub path_result: Result<FileSystemPath, RealPathResultError>,
    pub symlinks: Vec<FileSystemPath>,
}

/// Errors that can occur when resolving a path with symlinks.
/// Many of these can be transient conditions that might happen when package managers are running.
#[derive(Debug, Clone, Hash, Eq, PartialEq, NonLocalValue, TraceRawVcs, Encode, Decode)]
pub enum RealPathResultError {
    TooManySymlinks,
    CycleDetected,
    Invalid,
    NotFound,
}

impl RealPathResultError {
    /// Formats the error message
    pub async fn as_error_message(
        &self,
        orig: &FileSystemPath,
        result: &RealPathResult,
    ) -> Result<RcStr> {
        Ok(match self {
            RealPathResultError::TooManySymlinks => {
                let len = result.symlinks.len();
                turbofmt!("Symlink {orig} leads to too many other symlinks ({len} links)").await?
            }
            RealPathResultError::CycleDetected => {
                // symlinks is Vec<FileSystemPath> — format with Debug since
                // turbofmt can't resolve a whole Vec asynchronously.
                let symlinks_dbg = format!(
                    "{:?}",
                    result.symlinks.iter().map(|s| &s.path).collect::<Vec<_>>()
                );
                turbofmt!("Symlink {orig} is in a symlink loop: {symlinks_dbg}").await?
            }
            RealPathResultError::Invalid => {
                turbofmt!("Symlink {orig} is invalid, it points out of the filesystem root").await?
            }
            RealPathResultError::NotFound => {
                turbofmt!("Symlink {orig} is invalid, it points at a file that doesn't exist")
                    .await?
            }
        })
    }
}

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
async fn realpath_with_links(path: FileSystemPath) -> Result<Vc<RealPathResult>> {
    let mut current_path = path;
    let mut symlinks: IndexSet<FileSystemPath> = IndexSet::new();
    let mut visited: AutoSet<RcStr> = AutoSet::new();
    let mut error = RealPathResultError::TooManySymlinks;
    // Pick some arbitrary symlink depth limit... similar to the ELOOP logic for realpath(3).
    // SYMLOOP_MAX is 40 for Linux: https://unix.stackexchange.com/q/721724
    for _i in 0..40 {
        if current_path.is_root() {
            // fast path
            return Ok(RealPathResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(),
            }
            .cell());
        }

        if !visited.insert(current_path.path.clone()) {
            error = RealPathResultError::CycleDetected;
            break; // we detected a cycle
        }

        // see if a parent segment of the path is a symlink and resolve that first
        let parent = current_path.parent();
        let parent_result = parent.realpath_with_links().owned().await?;
        let basename = current_path
            .path
            .rsplit_once('/')
            .map_or(current_path.path.as_str(), |(_, name)| name);
        symlinks.extend(parent_result.symlinks);
        let parent_path = match parent_result.path_result {
            Ok(path) => {
                if path != parent {
                    current_path = path.join(basename)?;
                }
                path
            }
            Err(parent_error) => {
                error = parent_error;
                break;
            }
        };

        // use `get_type` before trying `read_link`, as there's a good chance of a cache hit on
        // `get_type`, and `read_link` isn't the common codepath.
        if !matches!(
            *current_path.get_type().await?,
            FileSystemEntryType::Symlink
        ) {
            return Ok(RealPathResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(), // convert set to vec
            }
            .cell());
        }

        match &*current_path.read_link().await? {
            LinkContent::Link { target, link_type } => {
                symlinks.insert(current_path.clone());
                current_path = if link_type.contains(LinkType::ABSOLUTE) {
                    current_path.root().owned().await?
                } else {
                    parent_path
                }
                .join(target)?;
            }
            LinkContent::NotFound => {
                error = RealPathResultError::NotFound;
                break;
            }
            LinkContent::Invalid => {
                error = RealPathResultError::Invalid;
                break;
            }
        }
    }

    // Too many attempts or detected a cycle, we bailed out!
    //
    // TODO: There's no proper way to indicate an non-turbo-tasks error here, so just return the
    // original path and all the symlinks we followed.
    //
    // Returning the followed symlinks is still important, even if there is an error! Otherwise
    // we may never notice if the symlink loop is fixed.
    Ok(RealPathResult {
        path_result: Err(error),
        symlinks: symlinks.into_iter().collect(),
    }
    .cell())
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
}
