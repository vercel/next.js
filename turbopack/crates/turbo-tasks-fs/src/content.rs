//! File and directory content value types: [`FileContent`], [`File`], JSON and
//! line views, and link/permission metadata.

use std::{
    cmp::{Ordering, min},
    fmt::{self, Debug, Formatter},
    io::{self, BufRead, BufReader, Read},
    path::Path,
};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use bitflags::bitflags;
use jsonc_parser::{ParseOptions, parse_to_serde_value};
use mime::Mime;
use serde_json::Value;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ReadRef, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_hash::{
    DeterministicHash, DeterministicHasher, HashAlgorithm, deterministic_hash, hash_xxh3_hash64,
};

use crate::{
    json::UnparsableJson,
    retry::retry_blocking,
    rope::{Rope, RopeReader},
    util::extract_disk_access,
};

#[derive(Clone, Copy, Debug, Default, DeterministicHash, PartialOrd, Ord)]
#[turbo_tasks::value(shared)]
pub enum Permissions {
    Readable,
    #[default]
    Writable,
    Executable,
}

// Only handle the permissions on unix platform for now

#[cfg(unix)]
impl From<Permissions> for std::fs::Permissions {
    fn from(perm: Permissions) -> Self {
        use std::os::unix::fs::PermissionsExt;
        match perm {
            Permissions::Readable => std::fs::Permissions::from_mode(0o444),
            Permissions::Writable => std::fs::Permissions::from_mode(0o664),
            Permissions::Executable => std::fs::Permissions::from_mode(0o755),
        }
    }
}

#[cfg(unix)]
impl From<std::fs::Permissions> for Permissions {
    fn from(perm: std::fs::Permissions) -> Self {
        use std::os::unix::fs::PermissionsExt;
        if perm.readonly() {
            Permissions::Readable
        } else {
            // https://github.com/fitzgen/is_executable/blob/master/src/lib.rs#L96
            if perm.mode() & 0o111 != 0 {
                Permissions::Executable
            } else {
                Permissions::Writable
            }
        }
    }
}

#[cfg(not(unix))]
impl From<std::fs::Permissions> for Permissions {
    fn from(_: std::fs::Permissions) -> Self {
        Permissions::default()
    }
}

#[turbo_tasks::value(shared, serialization = "hash")]
#[derive(Clone, Debug, PartialOrd, Ord)]
pub enum FileContent {
    Content(File),
    NotFound,
}

impl From<File> for FileContent {
    fn from(file: File) -> Self {
        FileContent::Content(file)
    }
}

/// A persisted version of [`FileContent`] that stores the full file content in the task cache.
///
/// [`FileContent`] uses `serialization = "hash"`, so only a hash is kept in the persistent cache.
/// When reading the file content back from the cache, the hash is compared to detect changes, but
/// the actual data is not available. `PersistedFileContent` provides the full data so that
/// [`DiskFileSystem::write`] can retrieve it without re-reading from disk.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, DeterministicHash, PartialOrd, Ord)]
pub enum PersistedFileContent {
    Content(File),
    NotFound,
}

impl PersistedFileContent {
    /// Performs a comparison of self's data against a disk file's streamed read.
    pub(crate) async fn streaming_compare(&self, path: &Path) -> Result<FileComparison> {
        let old_file =
            extract_disk_access(retry_blocking(|| std::fs::File::open(path)).await, path)?;
        let Some(old_file) = old_file else {
            return Ok(match self {
                PersistedFileContent::NotFound => FileComparison::Equal,
                _ => FileComparison::Create,
            });
        };
        // We know old file exists, does the new file?
        let PersistedFileContent::Content(new_file) = self else {
            return Ok(FileComparison::NotEqual);
        };

        let old_meta = extract_disk_access(retry_blocking(|| old_file.metadata()).await, path)?;
        let Some(old_meta) = old_meta else {
            // If we failed to get meta, then the old file has been deleted between the
            // handle open. In which case, we just pretend the file never existed.
            return Ok(FileComparison::Create);
        };
        // If the meta is different, we need to rewrite the file to update it.
        if new_file.meta != old_meta.into() {
            return Ok(FileComparison::NotEqual);
        }

        // So meta matches, and we have a file handle. Let's stream the contents to see
        // if they match.
        let mut new_contents = new_file.read();
        let mut old_contents = BufReader::new(old_file);
        Ok(loop {
            let new_chunk = new_contents.fill_buf()?;
            let Ok(old_chunk) = old_contents.fill_buf() else {
                break FileComparison::NotEqual;
            };

            let len = min(new_chunk.len(), old_chunk.len());
            if len == 0 {
                if new_chunk.len() == old_chunk.len() {
                    break FileComparison::Equal;
                } else {
                    break FileComparison::NotEqual;
                }
            }

            if new_chunk[0..len] != old_chunk[0..len] {
                break FileComparison::NotEqual;
            }

            new_contents.consume(len);
            old_contents.consume(len);
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileComparison {
    Create,
    Equal,
    NotEqual,
}

bitflags! {
  #[derive(
    Default,
    TraceRawVcs,
    NonLocalValue,
    DeterministicHash,
    Encode,
    Decode,
  )]
  pub struct LinkType: u8 {
      const DIRECTORY = 0b00000001;
      const ABSOLUTE = 0b00000010;
  }
}

/// The contents of a symbolic link. On Windows, this may be a junction point.
///
/// When reading, we treat symbolic links and junction points on Windows as equivalent. When
/// creating a new link, we always create junction points, because symlink creation may fail if
/// Windows "developer mode" is not enabled and we're running in an unprivileged environment.
#[turbo_tasks::value(shared)]
#[derive(Debug, DeterministicHash)]
pub enum LinkContent {
    /// A valid symbolic link pointing to `target`, a unix-style path.
    ///
    /// If [`LinkType::ABSOLUTE`] is set, `target` is normalized and relative to the *filesystem
    /// root* (so that absolute system paths never end up in the persistent cache). Otherwise,
    /// `target` is the raw value read from the link — unnormalized, may contain `..` — and is
    /// relative to the *directory containing the link*.
    ///
    /// A relative `target` must stay raw so that [`FileSystem::write_link`] round-trips it
    /// exactly: the value is written verbatim and compared against [`std::fs::read_link`] to
    /// skip unchanged links.
    Link {
        target: RcStr,
        link_type: LinkType,
    },
    // Invalid means the link is invalid it points out of the filesystem root
    Invalid,
    // The target was not found
    NotFound,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, DeterministicHash, PartialOrd, Ord)]
pub struct File {
    #[turbo_tasks(debug_ignore)]
    content: Rope,
    pub(crate) meta: FileMeta,
}

impl File {
    /// Reads a [File] from the given path
    pub(crate) fn from_path(p: &Path) -> io::Result<Self> {
        let mut file = std::fs::File::open(p)?;
        let metadata = file.metadata()?;

        let mut output = Vec::with_capacity(metadata.len() as usize);
        file.read_to_end(&mut output)?;

        Ok(File {
            meta: metadata.into(),
            content: Rope::from(output),
        })
    }

    /// Creates a [File] from raw bytes.
    pub(crate) fn from_bytes(content: Vec<u8>) -> Self {
        File {
            meta: FileMeta::default(),
            content: Rope::from(content),
        }
    }

    /// Creates a [File] from a rope.
    fn from_rope(content: Rope) -> Self {
        File {
            meta: FileMeta::default(),
            content,
        }
    }

    /// Returns the content type associated with this file.
    pub fn content_type(&self) -> Option<&Mime> {
        self.meta.content_type.as_ref()
    }

    /// Sets the content type associated with this file.
    pub fn with_content_type(mut self, content_type: Mime) -> Self {
        self.meta.content_type = Some(content_type);
        self
    }

    /// Returns a Read/AsyncRead/Stream/Iterator to access the File's contents.
    pub fn read(&self) -> RopeReader<'_> {
        self.content.read()
    }
}

impl Debug for File {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("File")
            .field("meta", &self.meta)
            .field("content (hash)", &hash_xxh3_hash64(&self.content))
            .finish()
    }
}

impl From<RcStr> for File {
    fn from(s: RcStr) -> Self {
        s.into_owned().into()
    }
}

impl From<String> for File {
    fn from(s: String) -> Self {
        File::from_bytes(s.into_bytes())
    }
}

impl From<ReadRef<RcStr>> for File {
    fn from(s: ReadRef<RcStr>) -> Self {
        File::from_bytes(s.as_bytes().to_vec())
    }
}

impl From<&str> for File {
    fn from(s: &str) -> Self {
        File::from_bytes(s.as_bytes().to_vec())
    }
}

impl From<Vec<u8>> for File {
    fn from(bytes: Vec<u8>) -> Self {
        File::from_bytes(bytes)
    }
}

impl From<&[u8]> for File {
    fn from(bytes: &[u8]) -> Self {
        File::from_bytes(bytes.to_vec())
    }
}

impl From<ReadRef<Rope>> for File {
    fn from(rope: ReadRef<Rope>) -> Self {
        File::from_rope(ReadRef::into_owned(rope))
    }
}

impl From<Rope> for File {
    fn from(rope: Rope) -> Self {
        File::from_rope(rope)
    }
}

impl File {
    pub fn new(meta: FileMeta, content: Vec<u8>) -> Self {
        Self {
            meta,
            content: Rope::from(content),
        }
    }

    /// Returns the associated [FileMeta] of this file.
    pub fn meta(&self) -> &FileMeta {
        &self.meta
    }

    /// Returns the immutable contents of this file.
    pub fn content(&self) -> &Rope {
        &self.content
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct FileMeta {
    // Size of the file
    // len: u64,
    pub(crate) permissions: Permissions,
    #[bincode(with = "turbo_bincode::mime_option")]
    #[turbo_tasks(trace_ignore)]
    content_type: Option<Mime>,
}

impl Ord for FileMeta {
    fn cmp(&self, other: &Self) -> Ordering {
        self.permissions
            .cmp(&other.permissions)
            .then_with(|| self.content_type.as_ref().cmp(&other.content_type.as_ref()))
    }
}

impl PartialOrd for FileMeta {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl From<std::fs::Metadata> for FileMeta {
    fn from(meta: std::fs::Metadata) -> Self {
        let permissions = meta.permissions().into();

        Self {
            permissions,
            content_type: None,
        }
    }
}

impl DeterministicHash for FileMeta {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        self.permissions.deterministic_hash(state);
        if let Some(content_type) = &self.content_type {
            content_type.to_string().deterministic_hash(state);
        }
    }
}

impl FileContent {
    pub fn new(file: File) -> Self {
        FileContent::Content(file)
    }

    pub fn is_content(&self) -> bool {
        matches!(self, FileContent::Content(_))
    }

    pub fn as_content(&self) -> Option<&File> {
        match self {
            FileContent::Content(file) => Some(file),
            FileContent::NotFound => None,
        }
    }

    pub fn parse_json_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => {
                let content = file.content.clone().into_bytes();
                let de = &mut serde_json::Deserializer::from_slice(&content);
                match serde_path_to_error::deserialize(de) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_serde_path_to_error(e),
                    )),
                }
            }
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn parse_json_with_comments_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
                Ok(string) => match parse_to_serde_value(
                    &string,
                    &ParseOptions {
                        allow_comments: true,
                        allow_trailing_commas: true,
                        allow_loose_object_property_names: false,
                    },
                ) {
                    Ok(data) => match data {
                        Some(value) => FileJsonContent::Content(value),
                        None => FileJsonContent::unparsable(rcstr!(
                            "text content doesn't contain any json data"
                        )),
                    },
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_jsonc_error(e, string.as_ref()),
                    )),
                },
                Err(_) => FileJsonContent::unparsable(rcstr!("binary is not valid utf-8 text")),
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn parse_json5_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
                Ok(string) => match parse_to_serde_value(
                    &string,
                    &ParseOptions {
                        allow_comments: true,
                        allow_trailing_commas: true,
                        allow_loose_object_property_names: true,
                    },
                ) {
                    Ok(data) => match data {
                        Some(value) => FileJsonContent::Content(value),
                        None => FileJsonContent::unparsable(rcstr!(
                            "text content doesn't contain any json data"
                        )),
                    },
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_jsonc_error(e, string.as_ref()),
                    )),
                },
                Err(_) => FileJsonContent::unparsable(rcstr!("binary is not valid utf-8 text")),
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn lines_ref(&self) -> FileLinesContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
                Ok(string) => {
                    let mut bytes_offset = 0;
                    FileLinesContent::Lines(
                        string
                            .split('\n')
                            .map(|l| {
                                let line = FileLine {
                                    content: l.to_string(),
                                    bytes_offset,
                                };
                                bytes_offset += (l.len() + 1) as u32;
                                line
                            })
                            .collect(),
                    )
                }
                Err(_) => FileLinesContent::Unparsable,
            },
            FileContent::NotFound => FileLinesContent::NotFound,
        }
    }
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::function]
    pub fn len(&self) -> Result<Vc<Option<u64>>> {
        Ok(Vc::cell(match self {
            FileContent::Content(file) => Some(file.content.len() as u64),
            FileContent::NotFound => None,
        }))
    }

    #[turbo_tasks::function]
    pub fn parse_json(&self) -> Result<Vc<FileJsonContent>> {
        Ok(self.parse_json_ref().cell())
    }

    #[turbo_tasks::function]
    pub fn parse_json_with_comments(&self) -> Vc<FileJsonContent> {
        self.parse_json_with_comments_ref().cell()
    }

    #[turbo_tasks::function]
    pub fn parse_json5(&self) -> Vc<FileJsonContent> {
        self.parse_json5_ref().cell()
    }

    #[turbo_tasks::function]
    pub fn lines(&self) -> Vc<FileLinesContent> {
        self.lines_ref().cell()
    }

    #[turbo_tasks::function]
    pub async fn hash(&self, salt: Vc<RcStr>, algorithm: HashAlgorithm) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(RcStr::from(deterministic_hash(
            &salt.await?,
            self,
            algorithm,
        ))))
    }

    /// Converts this [`FileContent`] into a [`PersistedFileContent`] by cloning.
    ///
    /// Use this in contexts where the full file content must be serialized to the persistent
    /// task cache (e.g., in [`DiskFileSystem::write`]).
    #[turbo_tasks::function]
    pub fn persist(&self) -> Vc<PersistedFileContent> {
        match self {
            FileContent::Content(file) => PersistedFileContent::Content(file.clone()).cell(),
            FileContent::NotFound => PersistedFileContent::NotFound.cell(),
        }
    }

    /// Compared to [FileContent::hash], this hashes only the bytes of the file content and
    /// nothing else, returning `None` if the file does not exist.
    ///
    /// If `salt` is non-empty it is written into the hasher before the file bytes in a single
    /// pass. An empty salt produces the same result as hashing without a prefix.
    #[turbo_tasks::function]
    pub async fn content_hash(
        &self,
        salt: Vc<RcStr>,
        algorithm: HashAlgorithm,
    ) -> Result<Vc<Option<RcStr>>> {
        match self {
            FileContent::Content(file) => Ok(Vc::cell(Some(
                deterministic_hash(&salt.await?, file.content().content_hash(), algorithm).into(),
            ))),
            FileContent::NotFound => Ok(Vc::cell(None)),
        }
    }
}

/// A file's content interpreted as a JSON value.
#[turbo_tasks::value(shared, serialization = "skip")]
pub enum FileJsonContent {
    Content(Value),
    Unparsable(Box<UnparsableJson>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl ValueToString for FileJsonContent {
    /// Returns the JSON file content as a UTF-8 string.
    ///
    /// This operation will only succeed if the file contents are a valid JSON
    /// value.
    #[turbo_tasks::function]
    fn to_string(&self) -> Result<Vc<RcStr>> {
        match self {
            FileJsonContent::Content(json) => Ok(Vc::cell(json.to_string().into())),
            FileJsonContent::Unparsable(e) => bail!("File is not valid JSON: {}", e),
            FileJsonContent::NotFound => bail!("File not found"),
        }
    }
}

#[turbo_tasks::value_impl]
impl FileJsonContent {
    #[turbo_tasks::function]
    pub async fn content(self: Vc<Self>) -> Result<Vc<Value>> {
        match &*self.await? {
            FileJsonContent::Content(json) => Ok(Vc::cell(json.clone())),
            FileJsonContent::Unparsable(e) => bail!("File is not valid JSON: {}", e),
            FileJsonContent::NotFound => bail!("File not found"),
        }
    }
}
impl FileJsonContent {
    pub fn unparsable(message: RcStr) -> Self {
        FileJsonContent::Unparsable(Box::new(UnparsableJson {
            message,
            path: None,
            start_location: None,
            end_location: None,
        }))
    }

    pub fn unparsable_with_message(message: RcStr) -> Self {
        FileJsonContent::Unparsable(Box::new(UnparsableJson {
            message,
            path: None,
            start_location: None,
            end_location: None,
        }))
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct FileLine {
    pub content: String,
    pub bytes_offset: u32,
}

impl FileLine {
    pub fn len(&self) -> usize {
        self.content.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[turbo_tasks::value(shared, serialization = "skip")]
pub enum FileLinesContent {
    Lines(#[turbo_tasks(trace_ignore)] Vec<FileLine>),
    Unparsable,
    NotFound,
}
