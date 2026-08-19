#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(btree_cursors)] // needed for the `InvalidatorMap` and watcher, reduces time complexity
#![feature(io_error_more)]
#![feature(min_specialization)]
// if `normalize_lexically` isn't eventually stabilized, we can copy the implementation from the
// stdlib into our source tree
#![feature(normalize_lexically)]
#![feature(trivial_bounds)]
// Junction points are used on Windows. We could use a third-party crate for this if the junction
// API isn't eventually stabilized.
#![cfg_attr(windows, feature(junction_point))]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![allow(clippy::mutable_key_type)]

mod content;
mod disk;
pub mod embed;
mod error;
pub mod glob;
mod globset;
pub mod invalidation;
mod invalidator_map;
pub mod json;
mod mutex_map;
mod null_fs;
mod path;
mod path_map;
mod read_glob;
mod retry;
pub mod rope;
pub mod source_context;
pub mod util;
pub(crate) mod virtual_fs;
mod watcher;
mod windows;

use std::{fmt::Debug, fs::FileType, path::PathBuf};

use anyhow::Result;
use auto_hash_map::AutoMap;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs, turbobail, turbofmt,
};

pub(crate) use crate::{
    content::FileComparison,
    disk::{DiskFileSystemInner, format_absolute_fs_path},
    error::AnyhowWrapper,
};
pub use crate::{
    content::{
        File, FileContent, FileJsonContent, FileLine, FileLinesContent, FileMeta, LinkContent,
        LinkType, Permissions, PersistedFileContent,
    },
    disk::{DiskFileSystem, canonicalize_to_rcstr, validate_path_length},
    null_fs::NullFileSystem,
    path::{FileSystemPath, FileSystemPathOption, RealPathResult, RealPathResultError, rebase},
    read_glob::ReadGlobResult,
    virtual_fs::VirtualFileSystem,
    watcher::{DiskWatcherConfig, DiskWatcherPathMatcher, DiskWatcherRecursiveMode},
    windows::to_verbatim_with_case_folded_disk,
};

#[turbo_tasks::value_trait]
pub trait FileSystem: ValueToString {
    /// Returns the path to the root of the file system.
    #[turbo_tasks::function]
    fn root(self: ResolvedVc<Self>) -> Vc<FileSystemPath> {
        FileSystemPath::new_normalized_unchecked(self, RcStr::default()).cell()
    }
    #[turbo_tasks::function]
    fn read(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<FileContent>;
    /// Reads the target of a symbolic link (or of a junction point on Windows).
    ///
    /// The base of the returned [`LinkContent::Link`] `target` depends on the link's
    /// [`LinkType`]: root-relative and normalized for [`LinkType::ABSOLUTE`] links, or the raw
    /// link-relative on-disk value otherwise.
    ///
    /// Returns [`LinkContent::Invalid`] if the target points outside of the filesystem root, and
    /// [`LinkContent::NotFound`] if `fs_path` doesn't exist or isn't a link.
    #[turbo_tasks::function]
    fn read_link(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<LinkContent>;
    #[turbo_tasks::function]
    fn raw_read_dir(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<RawDirectoryContent>;
    #[turbo_tasks::function]
    fn write(self: Vc<Self>, fs_path: FileSystemPath, content: Vc<FileContent>) -> Vc<()>;
    /// See [`FileSystemPath::write_symbolic_link_dir`].
    #[turbo_tasks::function]
    fn write_link(self: Vc<Self>, fs_path: FileSystemPath, target: Vc<LinkContent>) -> Vc<()>;
    #[turbo_tasks::function]
    fn metadata(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<FileMeta>;
}

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum RawDirectoryEntry {
    File,
    Directory,
    Symlink,
    // Other just means 'not a file, directory, or symlink'
    Other,
}

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum DirectoryEntry {
    File(FileSystemPath),
    Directory(FileSystemPath),
    Symlink(FileSystemPath),
    Other(FileSystemPath),
    Error(RcStr),
}

impl DirectoryEntry {
    /// Handles the `DirectoryEntry::Symlink` variant by checking the symlink target
    /// type and replacing it with `DirectoryEntry::File` or
    /// `DirectoryEntry::Directory`.
    pub async fn resolve_symlink(self) -> Result<Self> {
        if let DirectoryEntry::Symlink(symlink) = &self {
            let result = &*symlink.realpath_with_links().await?;
            let real_path = match &result.path_result {
                Ok(path) => path,
                Err(error) => {
                    return Ok(DirectoryEntry::Error(
                        error.as_error_message(symlink, result).await?,
                    ));
                }
            };
            Ok(match *real_path.get_type().await? {
                FileSystemEntryType::Directory => DirectoryEntry::Directory(real_path.clone()),
                FileSystemEntryType::File => DirectoryEntry::File(real_path.clone()),
                // Happens if the link is to a non-existent file
                FileSystemEntryType::NotFound => DirectoryEntry::Error(
                    turbofmt!("Symlink {symlink} points at {real_path} which does not exist")
                        .await?,
                ),
                // This is caused by eventual consistency
                FileSystemEntryType::Symlink => turbobail!(
                    "Symlink {symlink} points at a symlink but realpath_with_links returned a path"
                ),
                _ => self,
            })
        } else {
            Ok(self)
        }
    }

    pub fn path(self) -> Option<FileSystemPath> {
        match self {
            DirectoryEntry::File(path)
            | DirectoryEntry::Directory(path)
            | DirectoryEntry::Symlink(path)
            | DirectoryEntry::Other(path) => Some(path),
            DirectoryEntry::Error(_) => None,
        }
    }
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Copy, Debug)]
pub enum FileSystemEntryType {
    NotFound,
    File,
    Directory,
    Symlink,
    /// These would be things like named pipes, sockets, etc.
    Other,
    Error,
}

impl From<FileType> for FileSystemEntryType {
    fn from(file_type: FileType) -> Self {
        match file_type {
            t if t.is_dir() => FileSystemEntryType::Directory,
            t if t.is_file() => FileSystemEntryType::File,
            t if t.is_symlink() => FileSystemEntryType::Symlink,
            _ => FileSystemEntryType::Other,
        }
    }
}

impl From<DirectoryEntry> for FileSystemEntryType {
    fn from(entry: DirectoryEntry) -> Self {
        FileSystemEntryType::from(&entry)
    }
}

impl From<&DirectoryEntry> for FileSystemEntryType {
    fn from(entry: &DirectoryEntry) -> Self {
        match entry {
            DirectoryEntry::File(_) => FileSystemEntryType::File,
            DirectoryEntry::Directory(_) => FileSystemEntryType::Directory,
            DirectoryEntry::Symlink(_) => FileSystemEntryType::Symlink,
            DirectoryEntry::Other(_) => FileSystemEntryType::Other,
            DirectoryEntry::Error(_) => FileSystemEntryType::Error,
        }
    }
}

impl From<RawDirectoryEntry> for FileSystemEntryType {
    fn from(entry: RawDirectoryEntry) -> Self {
        FileSystemEntryType::from(&entry)
    }
}

impl From<&RawDirectoryEntry> for FileSystemEntryType {
    fn from(entry: &RawDirectoryEntry) -> Self {
        match entry {
            RawDirectoryEntry::File => FileSystemEntryType::File,
            RawDirectoryEntry::Directory => FileSystemEntryType::Directory,
            RawDirectoryEntry::Symlink => FileSystemEntryType::Symlink,
            RawDirectoryEntry::Other => FileSystemEntryType::Other,
        }
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub enum RawDirectoryContent {
    // The entry keys are the directory relative file names
    // e.g. for `/bar/foo`, it will be `foo`
    Entries(AutoMap<RcStr, RawDirectoryEntry>),
    NotFound,
}

impl RawDirectoryContent {
    pub fn new(entries: AutoMap<RcStr, RawDirectoryEntry>) -> Vc<Self> {
        Self::cell(RawDirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Vc<Self> {
        Self::cell(RawDirectoryContent::NotFound)
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub enum DirectoryContent {
    Entries(AutoMap<RcStr, DirectoryEntry>),
    NotFound,
}

impl DirectoryContent {
    pub fn new(entries: AutoMap<RcStr, DirectoryEntry>) -> Vc<Self> {
        Self::cell(DirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Vc<Self> {
        Self::cell(DirectoryContent::NotFound)
    }
}

pub async fn to_sys_path(path: FileSystemPath) -> Result<Option<PathBuf>> {
    if let Some(fs) = ResolvedVc::try_downcast_type::<DiskFileSystem>(path.fs) {
        let sys_path = fs.await?.to_sys_path(&path);
        return Ok(Some(sys_path));
    }

    Ok(None)
}
