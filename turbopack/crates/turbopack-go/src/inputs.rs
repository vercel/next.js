//! Recorded dependency fingerprints and live validation; source files are never materialized.
use std::{collections::BTreeMap, path::Path, time::UNIX_EPOCH};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use sha2::{Digest, Sha256};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystemPath, RawDirectoryContent, RawDirectoryEntry,
};

use crate::{
    GoBuildContext, filesystem,
    paths::{paths_refer_to_same_file, relative_output_path, validate_source_path},
};

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Default, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub(crate) struct Stamp {
    modified: Option<(u64, u32)>,
    len: u64,
    // ctime/inode also detect replacement and edit-and-restore during a command on Unix.
    changed: Option<(u64, u64, u64)>,
}

fn stamp(path: &Path) -> Result<Option<Stamp>> {
    let meta = match std::fs::metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(error).with_context(|| format!("reading metadata: {}", path.display()));
        }
    };
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| (time.as_secs(), time.subsec_nanos()));
    #[cfg(unix)]
    let changed = {
        use std::os::unix::fs::MetadataExt;
        Some((meta.ctime() as u64, meta.ctime_nsec() as u64, meta.ino()))
    };
    #[cfg(not(unix))]
    let changed = None;
    Ok(Some(Stamp {
        modified,
        len: meta.len(),
        changed,
    }))
}

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub(crate) struct FileInput {
    stamp: Option<Stamp>,
    digest: Option<Vec<u8>>,
}

impl FileInput {
    pub(crate) fn exists(&self) -> bool {
        self.stamp.is_some()
    }
}

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub(crate) struct DirectoryInput {
    pub names: Option<BTreeMap<String, u8>>,
    stamp: Option<Stamp>,
}

fn kind(entry: &std::fs::DirEntry) -> Result<u8> {
    let kind = entry.file_type()?;
    Ok(if kind.is_file() {
        0
    } else if kind.is_dir() {
        1
    } else if kind.is_symlink() {
        2
    } else {
        3
    })
}

pub(crate) fn directory(path: &Path) -> Result<DirectoryInput> {
    let names = match std::fs::read_dir(path) {
        Ok(entries) => Some(
            entries
                .map(|entry| {
                    let entry = entry?;
                    Ok((
                        entry
                            .file_name()
                            .into_string()
                            .map_err(|_| anyhow::anyhow!("non-UTF8 Go path"))?,
                        kind(&entry)?,
                    ))
                })
                .collect::<Result<_>>()?,
        ),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(error).with_context(|| format!("reading directory: {}", path.display()));
        }
    };
    Ok(DirectoryInput {
        names,
        stamp: stamp(path)?,
    })
}

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Default, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub(crate) struct Inputs {
    pub files: BTreeMap<RcStr, FileInput>,
    pub directories: BTreeMap<RcStr, DirectoryInput>,
    pub embed_patterns: BTreeMap<RcStr, Vec<RcStr>>,
}

impl Inputs {
    pub(crate) fn compiler_inputs(&self) -> Self {
        let mut inputs = self.clone();
        // Directory timestamps are checked live across compiler execution, but are not a cache
        // key: replacing an unrelated file (including a published executable) changes them.
        for directory in inputs.directories.values_mut() {
            directory.stamp = None;
        }
        inputs
    }
    pub(crate) fn contains_input(&self, path: &Path) -> Result<bool> {
        for input in self.files.keys() {
            if paths_refer_to_same_file(path, Path::new(input.as_str()))? {
                return Ok(true);
            }
        }
        // A new output must not become an embed match on the next build, including when a
        // pattern matches a parent directory whose descendants Go recursively embeds.
        for (root, patterns) in &self.embed_patterns {
            if let Some(relative) = relative_output_path(path, Path::new(root.as_str()))? {
                for pattern in patterns {
                    let pattern = pattern.strip_prefix("all:").unwrap_or(pattern);
                    let matcher = embed_matcher(pattern)?;
                    for ancestor in relative
                        .ancestors()
                        .filter(|path| !path.as_os_str().is_empty())
                    {
                        if matcher.is_match(&ancestor.to_string_lossy().replace('\\', "/")) {
                            return Ok(true);
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    /// Validate directly against the OS, including before publication when watcher delivery may
    /// lag. No file contents are polled: stamps guard the content hashes recorded through Tasks FS.
    pub(crate) fn is_current(&self) -> Result<bool> {
        for (path, input) in &self.files {
            if stamp(Path::new(path.as_str()))? != input.stamp {
                return Ok(false);
            }
        }
        for (path, input) in &self.directories {
            if directory(Path::new(path.as_str()))?.names != input.names {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

pub(crate) struct Tracker<'a> {
    root: &'a FileSystemPath,
    project: &'a Path,
    context: &'a GoBuildContext,
    pub inputs: Inputs,
    pub dirty: bool,
}

impl<'a> Tracker<'a> {
    pub(crate) fn new(
        root: &'a FileSystemPath,
        project: &'a Path,
        context: &'a GoBuildContext,
    ) -> Self {
        Self {
            root,
            project,
            context,
            inputs: Inputs::default(),
            dirty: false,
        }
    }

    async fn path(&self, path: &Path) -> Result<FileSystemPath> {
        let (root, relative) = if let Ok(relative) = path.strip_prefix(self.project) {
            validate_source_path(self.project, path)?;
            (self.root.clone(), relative)
        } else {
            let relative = path
                .strip_prefix(self.context.module_cache.as_str())
                .with_context(|| {
                    format!("Go source outside project/module cache: {}", path.display())
                })?;
            validate_source_path(Path::new(self.context.module_cache.as_str()), path)?;
            let fs = filesystem(self.context.module_cache.clone())
                .resolve()
                .await?;
            (
                FileSystemPath {
                    fs: ResolvedVc::upcast(fs),
                    path: RcStr::default(),
                },
                relative,
            )
        };
        root.join(
            &relative
                .to_str()
                .context("non-UTF8 Go path")?
                .replace('\\', "/"),
        )
    }

    pub(crate) async fn file(&mut self, path: &Path) -> Result<()> {
        let key: RcStr = path.to_str().context("non-UTF8 Go path")?.into();
        if self.inputs.files.contains_key(&key) {
            return Ok(());
        }
        let tracked = self.path(path).await?;
        let fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(tracked.fs)
            .context("Go inputs require a disk filesystem")?;
        fs.await?.track_file(&tracked).await?;
        let before = stamp(path)?;
        let content = tracked.read().await?;
        let digest = match &*content {
            FileContent::Content(file) => {
                let mut hasher = Sha256::new();
                std::io::copy(&mut file.read(), &mut HashWriter(&mut hasher))?;
                Some(hasher.finalize().to_vec())
            }
            FileContent::NotFound => None,
        };
        let after = stamp(path)?;
        // Verify cached task bytes match the live file. This closes registration races even in
        // one-shot builds, where no filesystem event may have invalidated an old read yet.
        let actual = if after.is_some() {
            let mut file = std::fs::File::open(path)?;
            let mut hasher = Sha256::new();
            std::io::copy(&mut file, &mut HashWriter(&mut hasher))?;
            Some(hasher.finalize().to_vec())
        } else {
            None
        };
        self.dirty |= before != after || after != stamp(path)? || digest != actual;
        self.inputs.files.insert(
            key,
            FileInput {
                stamp: after,
                digest,
            },
        );
        Ok(())
    }

    pub(crate) async fn dir(&mut self, path: &Path) -> Result<()> {
        let key: RcStr = path.to_str().context("non-UTF8 Go path")?.into();
        if self.inputs.directories.contains_key(&key) {
            return Ok(());
        }
        let tracked = self.path(path).await?;
        let fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(tracked.fs)
            .context("Go inputs require a disk filesystem")?;
        fs.await?.track_directory(&tracked).await?;
        let before = directory(path)?;
        let entries = tracked.raw_read_dir().await?;
        let recorded = match &*entries {
            RawDirectoryContent::NotFound => None,
            RawDirectoryContent::Entries(entries) => Some(
                entries
                    .iter()
                    .map(|(name, entry)| {
                        (
                            name.to_string(),
                            match entry {
                                RawDirectoryEntry::File => 0,
                                RawDirectoryEntry::Directory => 1,
                                RawDirectoryEntry::Symlink => 2,
                                RawDirectoryEntry::Other => 3,
                            },
                        )
                    })
                    .collect(),
            ),
        };
        let after = directory(path)?;
        self.dirty |= before != after || recorded != after.names;
        self.inputs.directories.insert(key, after);
        Ok(())
    }

    pub(crate) async fn parents(&mut self, path: &Path) -> Result<()> {
        let mut path = path;
        loop {
            self.dir(path).await?;
            if path == self.project || path.exists() {
                break;
            }
            path = path.parent().context("Go lookup has no parent")?;
        }
        Ok(())
    }

    pub(crate) async fn tree(&mut self, root: &Path) -> Result<()> {
        let mut pending = vec![root.to_owned()];
        while let Some(path) = pending.pop() {
            self.dir(&path).await?;
            if let Some(names) = &self.inputs.directories[path.to_str().unwrap()].names {
                for (name, kind) in names {
                    if *kind == 1 {
                        pending.push(path.join(name));
                    }
                }
            }
        }
        Ok(())
    }

    pub(crate) async fn invalidate(&self) -> Result<()> {
        if let Some(fs) = ResolvedVc::try_downcast_type::<DiskFileSystem>(self.root.fs) {
            fs.await?.invalidate();
        }
        filesystem(self.context.module_cache.clone())
            .connect()
            .await?
            .invalidate();
        Ok(())
    }
}

struct HashWriter<'a>(&'a mut Sha256);
impl std::io::Write for HashWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Translate Go path.Match patterns. In particular, Go treats braces literally, uses ^ for class
/// negation, and gives ** the same meaning as *. Generic filesystem glob dialects differ here.
fn embed_matcher(pattern: &str) -> Result<regex::Regex> {
    let mut expression = String::from(r"\A");
    let mut chars = pattern.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '*' => expression.push_str("[^/]*"),
            '?' => expression.push_str("[^/]"),
            '\\' => {
                let literal = chars.next().context("invalid Go embed escape")?;
                expression.push_str(&regex::escape(&literal.to_string()));
            }
            '[' => {
                expression.push('[');
                if chars.peek() == Some(&'^') {
                    chars.next();
                    expression.push('^');
                }
                loop {
                    match chars.next().context("invalid Go embed character class")? {
                        ']' => {
                            expression.push(']');
                            break;
                        }
                        '\\' => {
                            let literal = chars.next().context("invalid Go embed escape")?;
                            expression.push_str(&regex::escape(&literal.to_string()));
                        }
                        '-' => expression.push('-'),
                        literal => expression.push_str(&regex::escape(&literal.to_string())),
                    }
                }
            }
            literal => expression.push_str(&regex::escape(&literal.to_string())),
        }
    }
    expression.push_str(r"\z");
    Ok(regex::Regex::new(&expression)?)
}

#[cfg(test)]
mod tests {
    use crate::inputs::embed_matcher;
    #[test]
    fn embed_patterns_follow_go_path_match_semantics() {
        for (pattern, name, expected) in [
            ("assets/*", "assets/output", true),
            ("assets/*", "assets/nested/output", false),
            ("assets/**/output", "assets/a/output", true),
            ("assets/**/output", "assets/a/b/output", false),
            ("*.txt", "dist/main", false),
            ("[!ab].txt", "a.txt", true),
            ("[^ab].txt", "a.txt", false),
            ("[^ab].txt", "c.txt", true),
            ("{one,two}", "one", false),
            ("{one,two}", "{one,two}", true),
            (r"[a\-c]", "-", true),
        ] {
            assert_eq!(
                embed_matcher(pattern).unwrap().is_match(name),
                expected,
                "{pattern}: {name}"
            );
        }
    }
}
