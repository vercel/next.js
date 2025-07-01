use std::{env, path::PathBuf};

use anyhow::{Context, Result, bail};
use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::{FxHashMap, FxHashSet};
use similar::TextDiff;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContent, FileSystemEntryType, FileSystemPath,
};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_cli_utils::issue::{LogOptions, format_issue};
use turbopack_core::{
    asset::AssetContent,
    issue::{IssueSeverity, PlainIssue, StyledString},
};

// Updates the existing snapshot outputs with the actual outputs of this run.
// e.g. `UPDATE=1 cargo test -p turbopack-tests -- test_my_pattern`
pub static UPDATE: Lazy<bool> = Lazy::new(|| env::var("UPDATE").unwrap_or_default() == "1");

static ANSI_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\x1b\[\d+m").unwrap());

pub async fn snapshot_issues<I: IntoIterator<Item = ReadRef<PlainIssue>>>(
    captured_issues: I,
    issues_path: FileSystemPath,
    workspace_root: &str,
) -> Result<()> {
    let expected_issues = expected(issues_path.clone()).await?;
    let mut seen = FxHashSet::default();
    for plain_issue in captured_issues.into_iter() {
        let title = styled_string_to_file_safe_string(&plain_issue.title)
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

        let path = issues_path.join(&format!("{title}-{}.txt", &hash[0..6]))?;
        if !seen.insert(path.clone()) {
            continue;
        }

        let formatted = format_issue(
            &plain_issue,
            None,
            &LogOptions {
                current_dir: PathBuf::new(),
                project_dir: PathBuf::new(),
                show_all: true,
                log_detail: true,
                log_level: IssueSeverity::Info,
            },
        );

        // Annoyingly, the PlainIssue.source -> PlainIssueSource.asset ->
        // PlainSource.path -> Vc<FileSystemPath>.fs -> DiskFileSystem.root changes
        // for everyone.
        let content: RcStr = formatted
            .as_str()
            .replace(workspace_root, "WORKSPACE_ROOT")
            .replace(&*ANSI_REGEX, "")
            // Normalize syspaths from Windows. These appear in stack traces.
            .replace("\\\\", "/")
            .into();

        let asset = AssetContent::file(File::from(content).into());

        diff(path, asset).await?;
    }

    matches_expected(expected_issues, seen).await
}

pub async fn expected(dir: FileSystemPath) -> Result<FxHashSet<FileSystemPath>> {
    let mut expected = FxHashSet::default();
    let entries = dir.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*entries {
        for (file, entry) in entries {
            match entry {
                DirectoryEntry::File(file) => {
                    expected.insert(file.clone());
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
    expected: FxHashSet<FileSystemPath>,
    seen: FxHashSet<FileSystemPath>,
) -> Result<()> {
    for path in diff_paths(&expected, &seen).await? {
        let p = &path.path;
        if *UPDATE {
            remove_file(path.clone()).await?;
            println!("removed file {p}");
        } else {
            bail!("expected file {}, but it was not emitted", p);
        }
    }
    Ok(())
}

pub async fn diff(path: FileSystemPath, actual: Vc<AssetContent>) -> Result<()> {
    let path_str = &path.path;
    let expected = AssetContent::file(path.read());

    let actual = get_contents(actual, path.clone()).await?;
    let expected = get_contents(expected, path.clone()).await?;

    if actual != expected {
        if let Some(actual) = actual {
            if *UPDATE {
                let content = File::from(RcStr::from(actual)).into();
                path.write(content).await?;
                println!("updated contents of {path_str}");
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

async fn get_contents(file: Vc<AssetContent>, path: FileSystemPath) -> Result<Option<String>> {
    Ok(
        match &*file.await.context(format!(
            "Unable to read AssetContent of {}",
            path.value_to_string().await?
        ))? {
            AssetContent::File(file) => match &*file.await.context(format!(
                "Unable to read FileContent of {}",
                path.value_to_string().await?
            ))? {
                FileContent::NotFound => None,
                FileContent::Content(expected) => {
                    let rope = expected.content();
                    let str = rope.to_str();
                    match str {
                        Ok(str) => Some(str.trim().to_string()),
                        Err(_) => {
                            let hash = hash_xxh3_hash64(rope);
                            Some(format!("Binary content {hash:016x}"))
                        }
                    }
                }
            },
            AssetContent::Redirect { target, link_type } => Some(format!(
                "Redirect {{ target: {target}, link_type: {link_type:?} }}"
            )),
        },
    )
}

async fn remove_file(path: FileSystemPath) -> Result<()> {
    path.write(FileContent::NotFound.cell()).await?;
    Ok(())
}

/// Values in left that are not in right.
/// FileSystemPath hashes as a Vc, not as the file path, so we need to get
/// the path to properly diff.
async fn diff_paths(
    left: &FxHashSet<FileSystemPath>,
    right: &FxHashSet<FileSystemPath>,
) -> Result<FxHashSet<FileSystemPath>> {
    let mut map = left
        .iter()
        .map(|p| async move { Ok((p.path.clone(), p.clone())) })
        .try_join()
        .await?
        .iter()
        .cloned()
        .collect::<FxHashMap<_, _>>();
    for p in right {
        map.remove(&p.path);
    }
    Ok(map.values().cloned().collect())
}

fn styled_string_to_file_safe_string(styled_string: &StyledString) -> String {
    match styled_string {
        StyledString::Line(parts) => {
            let mut string = String::new();
            string += "__l_";
            for part in parts {
                string.push_str(&styled_string_to_file_safe_string(part));
            }
            string += "__";
            string
        }
        StyledString::Stack(parts) => {
            let mut string = String::new();
            string += "__s_";
            for part in parts {
                string.push_str(&styled_string_to_file_safe_string(part));
                string.push('_');
            }
            string += "__";
            string
        }
        StyledString::Text(string) => string.to_string(),
        StyledString::Code(string) => format!("__c_{string}__"),
        StyledString::Strong(string) => format!("__{string}__"),
    }
}
