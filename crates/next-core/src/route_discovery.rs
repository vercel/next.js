//! Authored development files, separate from the effective routes used to serve requests.
//!
//! Keep filesystem paths in their native representation here. Absolute host paths are only
//! materialized by the bindings, rather than persisted in turbo-tasks cache entries.

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPath};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, ValueDebugFormat, Encode, Decode)]
pub struct AuthoredFile {
    pub kind: RcStr,
    pub original_name: RcStr,
    pub source: FileSystemPath,
    /// Metadata naming can depend on generator exports even in branches with no endpoint.
    pub runtime_pathname: Option<RcStr>,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, ValueDebugFormat, Encode, Decode)]
pub struct AuthoredSlot {
    pub name: RcStr,
    pub parent: RcStr,
}

#[derive(Default, Clone, Debug, PartialEq, Eq, NonLocalValue, ValueDebugFormat, Encode, Decode)]
pub struct DevelopmentDiscovery {
    pub files: Vec<AuthoredFile>,
    pub slots: Vec<AuthoredSlot>,
    pub has_type_script_files: bool,
    pub has_root_not_found: bool,
    pub authored_pages_special_routes: Vec<RcStr>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionDevelopmentDiscovery(pub Option<DevelopmentDiscovery>);

/// Matches the innermost slot recorded by Next's development file classifier. A helper or layout
/// can declare a slot even if that branch does not yet contain an executable page.
pub fn authored_slot(directory: &str) -> Option<AuthoredSlot> {
    let segments: Vec<_> = directory.split('/').collect();
    let index = segments
        .iter()
        .rposition(|segment| segment.starts_with('@') && *segment != "@children")?;
    let parent = segments[..index]
        .iter()
        .filter(|segment| {
            !segment.is_empty()
                && !segment.starts_with('@')
                && !(segment.starts_with('(') && segment.ends_with(')'))
        })
        .copied()
        .collect::<Vec<_>>()
        .join("/");
    Some(AuthoredSlot {
        name: segments[index][1..].into(),
        parent: format!("/{parent}").replace("%5F", "_").into(),
    })
}

/// TypeScript can be enabled by an unimported helper, including one in a private App directory.
/// This observes directory listings, without parsing or compiling files. Once TypeScript is
/// configured the caller stops depending on this task.
#[turbo_tasks::function]
pub async fn has_typescript_files(directory: FileSystemPath) -> Result<Vc<bool>> {
    let DirectoryContent::Entries(entries) = &*directory.read_dir().await? else {
        return Ok(Vc::cell(false));
    };
    for (name, entry) in entries {
        if name == "node_modules" || name == ".git" {
            continue;
        }
        match entry.clone().resolve_symlink().await? {
            DirectoryEntry::File(_) => {
                if !name.ends_with(".d.ts") && (name.ends_with(".ts") || name.ends_with(".tsx")) {
                    return Ok(Vc::cell(true));
                }
            }
            DirectoryEntry::Directory(path) => {
                if *has_typescript_files(path).await? {
                    return Ok(Vc::cell(true));
                }
            }
            _ => {}
        }
    }
    Ok(Vc::cell(false))
}

pub fn app_file_kind(stem: &str) -> Option<RcStr> {
    Some(match stem {
        "page" => rcstr!("app-page"),
        "route" => rcstr!("app-route"),
        "layout" => rcstr!("app-layout"),
        "default" => rcstr!("app-default"),
        "error" | "global-error" | "global-not-found" | "loading" | "template" | "forbidden"
        | "unauthorized" | "not-found" => rcstr!("app-special"),
        _ => return None,
    })
}
