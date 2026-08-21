use std::{io, path::Path};

use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, OperationValue, OperationVc, ResolvedVc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, DiskWatcherRecursiveMode, FileSystemPath,
    canonicalize_to_rcstr,
};
use turbopack_core::issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString};

use crate::project::{
    ProjectContainer, additional_root_path_operation, disk_file_system_operation,
};

/// A named additional filesystem root with a canonicalized path.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
    TraceRawVcs,
    Encode,
    Decode,
)]
pub struct AdditionalRootConfig {
    pub(crate) key: RcStr,
    pub(crate) canonical_path: RcStr,
}

impl AdditionalRootConfig {
    pub fn canonicalize(key: RcStr, path: &str) -> io::Result<Self> {
        Ok(Self {
            key,
            canonical_path: canonicalize_to_rcstr(Path::new(path))?,
        })
    }
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
    TraceRawVcs,
    Encode,
    Decode,
)]
pub struct AdditionalRootError {
    key: RcStr,
    configured_path: RcStr,
    reason: AdditionalRootIssueReason,
}

impl AdditionalRootError {
    pub fn from_io_error(key: RcStr, path: RcStr, error: &io::Error) -> Self {
        Self {
            key,
            configured_path: path,
            reason: AdditionalRootIssueReason::Io(RcStr::from(error.to_string())),
        }
    }
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
    TraceRawVcs,
    Encode,
    Decode,
)]
enum AdditionalRootIssueReason {
    // io errors are stringified because `io::Error` does not implement the required traits
    Io(RcStr),
    OverlappingRoot { key: Option<RcStr>, path: RcStr },
}

impl AdditionalRootIssueReason {
    fn description(&self) -> StyledString {
        match self {
            Self::Io(error) => StyledString::Text(error.clone()),
            Self::OverlappingRoot {
                key: Some(key),
                path,
            } => StyledString::Line(vec![
                StyledString::Text(rcstr!("the root overlaps additional root ")),
                StyledString::Code(path.clone()),
                StyledString::Text(rcstr!(" configured as ")),
                StyledString::Code(key.clone()),
            ]),
            Self::OverlappingRoot { key: None, path } => StyledString::Line(vec![
                StyledString::Text(rcstr!("the additional root overlaps the project root ")),
                StyledString::Code(path.clone()),
            ]),
        }
    }
}

/// Constructed file systems and errors for the configured additional roots.
pub(crate) struct AdditionalRootFileSystems {
    pub file_systems: Vec<(RcStr, OperationVc<DiskFileSystem>)>,
    pub errors: Vec<AdditionalRootError>,
}

pub(crate) fn create_additional_root_file_systems(
    container: ResolvedVc<ProjectContainer>,
    additional_roots: &[Result<AdditionalRootConfig, AdditionalRootError>],
    project_root: &RcStr,
    watcher_config: DiskWatcherConfig,
    map: OperationVc<DiskFileSystemMap>,
) -> Result<AdditionalRootFileSystems> {
    let mut accepted: Vec<(RcStr, RcStr)> = Vec::new();
    let mut file_systems = Vec::new();
    let mut errors = Vec::new();
    for additional_root in additional_roots {
        let additional_root = match additional_root {
            Ok(additional_root) => additional_root,
            Err(error) => {
                errors.push(error.clone());
                continue;
            }
        };
        let canonical = additional_root.canonical_path.clone();
        let canonical_path = Path::new(&*canonical);
        if let Some((overlapping_key, overlapping_path)) =
            find_overlapping_root(canonical_path, project_root, &accepted)
        {
            errors.push(AdditionalRootError {
                key: additional_root.key.clone(),
                configured_path: canonical,
                reason: AdditionalRootIssueReason::OverlappingRoot {
                    key: overlapping_key,
                    path: overlapping_path,
                },
            });
            continue;
        }
        // We're not inside a turbo-task function: Call an operation to create a cell for us. We
        // pass the `ProjectContainer` and a key, which both have a stable identity, this reduces
        // invalidations when additional roots are added or removed.
        let canonical_root = additional_root_path_operation(container, additional_root.key.clone());
        let operation = disk_file_system_operation(
            RcStr::from(format!("additional-root-{}", additional_root.key)),
            canonical_root,
            Vec::new(),
            DiskWatcherConfig {
                // we assume that most files in an additional root won't be read, so a recursive
                // watcher may be more expensive than we'd like, always use a non-recursive watcher.
                recursive_mode: Some(DiskWatcherRecursiveMode::NonRecursive),
                ..watcher_config
            },
            map,
        );
        accepted.push((additional_root.key.clone(), canonical));
        file_systems.push((additional_root.key.clone(), operation));
    }

    Ok(AdditionalRootFileSystems {
        file_systems,
        errors,
    })
}

fn find_overlapping_root(
    canonical: &Path,
    project_root: &RcStr,
    additional_roots: &[(RcStr, RcStr)],
) -> Option<(Option<RcStr>, RcStr)> {
    let project_root_path = Path::new(&**project_root);
    if canonical.starts_with(project_root_path) || project_root_path.starts_with(canonical) {
        return Some((None, project_root.clone()));
    }

    additional_roots.iter().find_map(|(key, root)| {
        let root_path = Path::new(&**root);
        (canonical.starts_with(root_path) || root_path.starts_with(canonical))
            .then(|| (Some(key.clone()), root.clone()))
    })
}

pub(crate) fn emit_additional_root_issues(path: FileSystemPath, errors: Vec<AdditionalRootError>) {
    for error in errors {
        AdditionalRootIssue {
            path: path.clone(),
            error,
        }
        .resolved_cell()
        .emit();
    }
}

#[turbo_tasks::value(shared)]
struct AdditionalRootIssue {
    path: FileSystemPath,
    error: AdditionalRootError,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for AdditionalRootIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Config
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Invalid Turbopack additional root"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!("The additional root ")),
            StyledString::Code(self.error.configured_path.clone()),
            StyledString::Text(rcstr!(" configured as ")),
            StyledString::Code(self.error.key.clone()),
            StyledString::Text(rcstr!(" is invalid: ")),
            self.error.reason.description(),
        ])))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_an_overlapping_project_root() {
        assert_eq!(
            find_overlapping_root(
                Path::new("/workspace/project/packages"),
                &rcstr!("/workspace/project"),
                &[],
            ),
            Some((None, rcstr!("/workspace/project")))
        );
    }
}
