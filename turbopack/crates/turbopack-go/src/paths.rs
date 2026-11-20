//! Filesystem-aware path checks for native source and output protection.
use std::{
    io,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, ensure};
use same_file::Handle;

fn handle(path: &Path) -> Result<Option<Handle>> {
    match Handle::from_path(path) {
        Ok(handle) => Ok(Some(handle)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => {
            Err(error).with_context(|| format!("checking file identity: {}", path.display()))
        }
    }
}

/// Compare existing file identities, including case, Unicode and hard-link aliases.
/// Identical spellings also match when a tracked input does not exist yet.
pub fn paths_refer_to_same_file(left: &Path, right: &Path) -> Result<bool> {
    if left == right {
        return Ok(true);
    }
    Ok(match (handle(left)?, handle(right)?) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    })
}

/// Reject symlink components below a source root before resolving or reading inputs.
/// Missing components are allowed so watch sessions can observe later repairs.
pub fn validate_source_path(root: &Path, path: &Path) -> Result<()> {
    let relative = path
        .strip_prefix(root)
        .with_context(|| format!("Go source outside project/module cache: {}", path.display()))?;
    ensure!(
        relative
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_))),
        "Go source path must stay within its root: {}",
        path.display()
    );
    let mut component = root.to_owned();
    for name in std::iter::once(None).chain(relative.iter().map(Some)) {
        if let Some(name) = name {
            component.push(name);
        }
        match std::fs::symlink_metadata(&component) {
            Ok(metadata) => ensure!(
                !metadata.file_type().is_symlink(),
                "Go source symlinks are unsupported: {}",
                component.display()
            ),
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("checking Go source path: {}", component.display()));
            }
        }
    }
    Ok(())
}

/// Directory trees must be disjoint when one contains inputs and the other receives writes.
/// Compare ancestor identities so case, Unicode and symlink aliases cannot bypass the check.
pub(crate) fn directories_overlap(left: &Path, right: &Path) -> Result<bool> {
    let left = resolve_directory(left)?;
    let right = resolve_directory(right)?;
    for ancestor in left.ancestors() {
        if paths_refer_to_same_file(ancestor, &right)? {
            return Ok(true);
        }
    }
    for ancestor in right.ancestors() {
        if paths_refer_to_same_file(ancestor, &left)? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Resolve a directory without creating it. Missing suffixes are appended to the nearest
/// canonical ancestor, so rejected cache paths do not leave directories among source inputs.
pub(crate) fn resolve_directory(path: &Path) -> Result<PathBuf> {
    let mut absolute = PathBuf::new();
    for part in std::path::absolute(path)?.components() {
        match part {
            std::path::Component::ParentDir => {
                absolute.pop();
            }
            _ => absolute.push(part.as_os_str()),
        }
    }
    let mut parent = absolute.as_path();
    let mut missing = Vec::new();
    loop {
        match std::fs::canonicalize(parent) {
            Ok(mut path) => {
                path.extend(missing.into_iter().rev());
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                missing.push(
                    parent
                        .file_name()
                        .context("cache path has no existing ancestor")?
                        .to_owned(),
                );
                parent = parent.parent().context("cache path has no parent")?;
            }
            Err(error) => return Err(error).context("resolving Go cache directory"),
        }
    }
}

/// Resolve existing directory names as Go sees them, while keeping the proposed output
/// filename. On case-sensitive filesystems, differently cased directories stay distinct.
pub(crate) fn relative_output_path(path: &Path, root: &Path) -> Result<Option<PathBuf>> {
    let mut ancestor = None;
    for candidate in path.ancestors() {
        if paths_refer_to_same_file(candidate, root)? {
            ancestor = Some(candidate);
            break;
        }
    }
    let Some(ancestor) = ancestor else {
        return Ok(None);
    };
    let parts: Vec<_> = path.strip_prefix(ancestor)?.iter().collect();
    let mut directory = root.to_owned();
    let mut relative = PathBuf::new();
    for (index, name) in parts.iter().enumerate() {
        if index + 1 == parts.len() {
            relative.push(name);
            break;
        }
        let candidate = directory.join(name);
        let Some(candidate_handle) = handle(&candidate)? else {
            // Missing parents have no aliases. The CLI creates output parents before checking,
            // but library callers can also ask about a path that does not exist yet.
            relative.extend(&parts[index..]);
            break;
        };
        let entries = std::fs::read_dir(&directory)?.collect::<io::Result<Vec<_>>>()?;
        let actual = if let Some(entry) = entries.iter().find(|entry| entry.file_name() == **name) {
            entry.file_name()
        } else {
            let mut actual = None;
            for entry in &entries {
                if entry.file_type()?.is_dir()
                    && handle(&entry.path())?.is_some_and(|entry| entry == candidate_handle)
                {
                    actual = Some(entry.file_name());
                    break;
                }
            }
            actual.with_context(|| format!("output directory changed: {}", directory.display()))?
        };
        directory.push(&actual);
        relative.push(actual);
    }
    Ok(Some(relative))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_use_filesystem_identity() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let file = temp.path().join("source");
        let link = temp.path().join("alias");
        std::fs::write(&file, "source")?;
        std::fs::hard_link(&file, &link)?;
        assert!(paths_refer_to_same_file(&file, &link)?);
        assert!(!paths_refer_to_same_file(
            &file,
            &temp.path().join("missing")
        )?);
        assert!(paths_refer_to_same_file(
            &temp.path().join("missing"),
            &temp.path().join("missing")
        )?);
        let alias = temp.path().join("SOURCE");
        if alias.exists() {
            assert!(paths_refer_to_same_file(&file, &alias)?);
        } else {
            std::fs::write(&alias, "distinct")?;
            assert!(!paths_refer_to_same_file(&file, &alias)?);
        }
        Ok(())
    }

    #[test]
    fn output_directories_use_filesystem_names() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let root = std::fs::canonicalize(temp.path())?;
        std::fs::create_dir(root.join("assets"))?;
        let alias = root.join("ASSETS");
        if alias.exists() {
            assert!(directories_overlap(&alias, &root.join("assets"))?);
            assert_eq!(
                relative_output_path(&alias.join("new/output"), &root)?,
                Some(PathBuf::from("assets/new/output"))
            );
        } else {
            std::fs::create_dir(&alias)?;
            assert!(!directories_overlap(&alias, &root.join("assets"))?);
            assert_eq!(
                relative_output_path(&alias.join("new/output"), &root)?,
                Some(PathBuf::from("ASSETS/new/output"))
            );
        }
        let future = root.join("assets/missing/cache");
        assert_eq!(resolve_directory(&future)?, future);
        assert!(!root.join("assets/missing").exists());
        assert_eq!(
            resolve_directory(&root.join("assets/../assets/missing/cache"))?,
            future
        );
        assert_eq!(
            relative_output_path(&root.join("assets/new.TXT"), &root)?,
            Some(PathBuf::from("assets/new.TXT"))
        );
        assert!(directories_overlap(&root, &root.join("assets"))?);
        assert!(directories_overlap(&root.join("assets"), &root)?);
        #[cfg(unix)]
        {
            let outside = tempfile::tempdir()?;
            let alias = outside.path().join("cache");
            std::os::unix::fs::symlink(root.join("assets"), &alias)?;
            assert!(directories_overlap(&alias, &root)?);
            assert!(directories_overlap(&root, &alias)?);
        }
        assert_eq!(
            relative_output_path(&root.join("assets/new/output"), &root.join("assets"))?,
            Some(PathBuf::from("new/output"))
        );
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn source_paths_reject_symlink_components() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let root = std::fs::canonicalize(temp.path())?;
        let outside = tempfile::tempdir()?;
        std::fs::create_dir(root.join("real"))?;
        std::fs::write(root.join("real/main.go"), "package main")?;
        validate_source_path(&root, &root.join("real/main.go"))?;
        validate_source_path(&root, &root.join("missing/main.go"))?;
        for (alias, target) in [
            ("inside", root.join("real")),
            ("outside", outside.path().to_owned()),
            ("dangling", root.join("absent")),
        ] {
            let alias = root.join(alias);
            std::os::unix::fs::symlink(target, &alias)?;
            for path in [&alias, &alias.join("nested/main.go")] {
                let error = validate_source_path(&root, path).unwrap_err();
                assert!(
                    error
                        .to_string()
                        .contains("Go source symlinks are unsupported"),
                    "{error:#}"
                );
            }
            assert!(validate_source_path(&alias, &alias.join("main.go")).is_err());
        }
        assert!(validate_source_path(&root, outside.path()).is_err());
        assert!(validate_source_path(&root, &root.join("real/../real/main.go")).is_err());
        Ok(())
    }
}
