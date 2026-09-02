use std::path::Path;

use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, OperationValue, OperationVc, ReadRef, ResolvedVc, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, DiskWatcherRecursiveMode, FileSystemPath,
    canonicalize_to_rcstr,
};
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, PlainIssue, StyledString};

use crate::project::{
    ProjectContainer, additional_root_path_operation, disk_file_system_operation,
};

/// A named additional filesystem root.
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
    pub key: RcStr,
    pub path: RcStr,
    pub ignore_if_missing: bool,
}

#[turbo_tasks::task_input]
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Hash,
    OperationValue,
    TraceRawVcs,
    Serialize,
    Deserialize,
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

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, OperationValue, TraceRawVcs)]
pub(crate) struct AdditionalDiskFileSystem {
    pub canonical_path: RcStr,
    pub file_system: OperationVc<DiskFileSystem>,
}

/// Constructed file systems and issues for the configured additional roots.
pub(crate) struct AdditionalRootsInitialization {
    pub roots_by_name: FxIndexMap<RcStr, AdditionalDiskFileSystem>,
    pub issues: Vec<ReadRef<PlainIssue>>,
}

pub(crate) async fn create_additional_root_file_systems(
    container: ResolvedVc<ProjectContainer>,
    additional_roots: Vec<AdditionalRootConfig>,
    project_root: &RcStr,
    watcher_config: DiskWatcherConfig,
    map: OperationVc<DiskFileSystemMap>,
    issue_path: FileSystemPath,
) -> Result<AdditionalRootsInitialization> {
    let mut accepted: Vec<(RcStr, RcStr)> = Vec::new();
    let mut roots_by_name = FxIndexMap::default();
    let mut issues = Vec::new();
    for additional_root in additional_roots {
        let configured_path = additional_root.path.clone();
        let canonical = match tokio::task::spawn_blocking(move || {
            canonicalize_to_rcstr(Path::new(&*configured_path))
        })
        .await?
        {
            Ok(canonical) => canonical,
            Err(_) if additional_root.ignore_if_missing => continue,
            Err(error) => {
                if let Some(issue) = &*additional_root_issue_operation(
                    container,
                    issue_path.clone(),
                    additional_root.key,
                    additional_root.path,
                    AdditionalRootIssueReason::Io(RcStr::from(error.to_string())),
                )
                .read_strongly_consistent()
                .await?
                {
                    issues.push(issue.clone());
                }
                continue;
            }
        };
        let canonical_path = Path::new(&*canonical);
        if let Some((overlapping_key, overlapping_path)) =
            find_overlapping_root(canonical_path, project_root, &accepted)
        {
            if let Some(issue) = &*additional_root_issue_operation(
                container,
                issue_path.clone(),
                additional_root.key.clone(),
                canonical,
                AdditionalRootIssueReason::OverlappingRoot {
                    key: overlapping_key,
                    path: overlapping_path,
                },
            )
            .read_strongly_consistent()
            .await?
            {
                issues.push(issue.clone());
            }
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
        accepted.push((additional_root.key.clone(), canonical.clone()));
        roots_by_name.insert(
            additional_root.key,
            AdditionalDiskFileSystem {
                canonical_path: canonical,
                file_system: operation,
            },
        );
    }

    Ok(AdditionalRootsInitialization {
        roots_by_name,
        issues,
    })
}

#[turbo_tasks::function(operation, root)]
async fn additional_root_issue_operation(
    container: ResolvedVc<ProjectContainer>,
    path: FileSystemPath,
    key: RcStr,
    configured_path: RcStr,
    reason: AdditionalRootIssueReason,
) -> Result<Vc<OptionalAdditionalRootIssue>> {
    let issue = AdditionalRootIssue {
        path,
        key,
        configured_path,
        reason,
    };
    let filter = container.project().issue_filter().await?;
    Ok(Vc::cell(if filter.matches_ref(&issue).await? {
        Some(ReadRef::new_owned(
            PlainIssue::from_issue_ref(&issue, None).await?,
        ))
    } else {
        None
    }))
}

#[turbo_tasks::value(transparent, serialization = "skip")]
struct OptionalAdditionalRootIssue(Option<ReadRef<PlainIssue>>);

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

#[turbo_tasks::value(shared)]
struct AdditionalRootIssue {
    path: FileSystemPath,
    key: RcStr,
    configured_path: RcStr,
    reason: AdditionalRootIssueReason,
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
            StyledString::Code(self.configured_path.clone()),
            StyledString::Text(rcstr!(" configured as ")),
            StyledString::Code(self.key.clone()),
            StyledString::Text(rcstr!(" is invalid: ")),
            self.reason.description(),
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
