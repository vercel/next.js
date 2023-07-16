use std::{
    collections::{HashMap, HashSet},
    env, fs,
};

use anyhow::{anyhow, bail, Context, Result};
use once_cell::sync::Lazy;
use similar::TextDiff;
use turbo_tasks::{debug::ValueDebugString, ReadRef, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystem, File, FileContent, FileSystemEntryType,
    FileSystemPath,
};
use turbo_tasks_hash::encode_hex;
use turbopack_core::{asset::AssetContent, issue::PlainIssue};

// Updates the existing snapshot outputs with the actual outputs of this run.
// e.g. `UPDATE=1 cargo test -p turbopack-tests -- test_my_pattern`
static UPDATE: Lazy<bool> = Lazy::new(|| env::var("UPDATE").unwrap_or_default() == "1");

pub async fn snapshot_issues<
    I: IntoIterator<Item = (ReadRef<PlainIssue>, ReadRef<ValueDebugString>)>,
>(
    captured_issues: I,
    issues_path: Vc<FileSystemPath>,
    workspace_root: &str,
) -> Result<()> {
    let expected_issues = expected(issues_path).await?;
    let mut seen = HashSet::new();
    for (plain_issue, debug_string) in captured_issues.into_iter() {
        let title = plain_issue
            .title
            .replace('/', "__")
            // We replace "*", "?", and '"' because they're not allowed in filenames on Windows.
            .replace('*', "__star__")
            .replace('"', "__quo__")
            .replace('?', "__q__")
            .replace(':', "__c__");
        let title = if title.len() > 50 {
            &title[0..50]
        } else {
            &title
        };
        let hash = encode_hex(plain_issue.internal_hash_ref(true));

        let path = issues_path.join(format!("{title}-{}.txt", &hash[0..6]));
        if !seen.insert(path) {
            continue;
        }

        // Annoyingly, the PlainIssue.source -> PlainIssueSource.asset ->
        // PlainAsset.path -> FileSystemPath.fs -> DiskFileSystem.root changes
        // for everyone.
        let content = debug_string
            .as_str()
            .replace(workspace_root, "WORKSPACE_ROOT")
            // Normalize syspaths from Windows. These appear in stack traces.
            .replace("\\\\", "/");
        let asset = AssetContent::file(File::from(content).into());

        diff(path, asset).await?;
    }

    matches_expected(expected_issues, seen).await
}

pub async fn expected(dir: Vc<FileSystemPath>) -> Result<HashSet<Vc<FileSystemPath>>> {
    let mut expected = HashSet::new();
    let entries = dir.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*entries {
        for (file, entry) in entries {
            match entry {
                DirectoryEntry::File(file) => {
                    expected.insert(*file);
                }
                _ => bail!(
                    "expected file at {}, found {:?}",
                    file,
                    FileSystemEntryType::from(entry)
                ),
            }
        }
    }
    Ok(expected)
}

pub async fn matches_expected(
    expected: HashSet<Vc<FileSystemPath>>,
    seen: HashSet<Vc<FileSystemPath>>,
) -> Result<()> {
    for path in diff_paths(&expected, &seen).await? {
        let p = &path.await?.path;
        if *UPDATE {
            remove_file(path).await?;
            println!("removed file {}", p);
        } else {
            bail!("expected file {}, but it was not emitted", p);
        }
    }
    Ok(())
}

pub async fn diff(path: Vc<FileSystemPath>, actual: Vc<AssetContent>) -> Result<()> {
    let path_str = &path.await?.path;
    let expected = AssetContent::file(path.read());

    let actual = get_contents(actual, path).await?;
    let expected = get_contents(expected, path).await?;

    if actual != expected {
        if let Some(actual) = actual {
            if *UPDATE {
                let content = File::from(actual).into();
                path.write(content).await?;
                println!("updated contents of {}", path_str);
            } else {
                if expected.is_none() {
                    eprintln!("new file {path_str} detected:");
                } else {
                    eprintln!("contents of {path_str} did not match:");
                }
                let expected = expected.unwrap_or_default();
                let diff = TextDiff::from_lines(&expected, &actual);
                eprintln!(
                    "{}",
                    diff.unified_diff()
                        .context_radius(3)
                        .header("expected", "actual")
                );
                bail!("contents of {path_str} did not match");
            }
        } else {
            bail!("{path_str} was not generated");
        }
    }

    Ok(())
}

async fn get_contents(file: Vc<AssetContent>, path: Vc<FileSystemPath>) -> Result<Option<String>> {
    Ok(
        match &*file.await.context(format!(
            "Unable to read AssetContent of {}",
            path.to_string().await?
        ))? {
            AssetContent::File(file) => match &*file.await.context(format!(
                "Unable to read FileContent of {}",
                path.to_string().await?
            ))? {
                FileContent::NotFound => None,
                FileContent::Content(expected) => {
                    Some(expected.content().to_str()?.trim().to_string())
                }
            },
            AssetContent::Redirect { target, link_type } => Some(format!(
                "Redirect {{ target: {target}, link_type: {:?} }}",
                link_type
            )),
        },
    )
}

async fn remove_file(path: Vc<FileSystemPath>) -> Result<()> {
    let fs = Vc::try_resolve_downcast_type::<DiskFileSystem>(path.fs())
        .await?
        .context(anyhow!("unexpected fs type"))?
        .await?;
    let sys_path = fs.to_sys_path(path).await?;
    fs::remove_file(&sys_path).context(format!("remove file {} error", sys_path.display()))?;
    Ok(())
}

/// Values in left that are not in right.
/// Vc<FileSystemPath> hashes as a Vc, not as the file path, so we need to get
/// the path to properly diff.
async fn diff_paths(
    left: &HashSet<Vc<FileSystemPath>>,
    right: &HashSet<Vc<FileSystemPath>>,
) -> Result<HashSet<Vc<FileSystemPath>>> {
    let mut map = left
        .iter()
        .map(|p| async move { Ok((p.await?.path.clone(), *p)) })
        .try_join()
        .await?
        .iter()
        .cloned()
        .collect::<HashMap<_, _>>();
    for p in right {
        map.remove(&p.await?.path);
    }
    Ok(map.values().copied().collect())
}
