use std::{
    collections::BTreeMap,
    ops::Bound,
    path::{Path, PathBuf},
};

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
enum AdditionalRootInvalidName {
    Empty,
    TooLong,
    DotOrDotDot,
    NonAscii,
    AsciiControlCharacter,
    ReservedCharacter(RcStr),
    TrailingSpaceOrPeriod,
    WindowsDeviceName,
}

impl AdditionalRootInvalidName {
    fn description(&self) -> StyledString {
        match self {
            Self::Empty => StyledString::Text(rcstr!("the name must not be empty")),
            Self::TooLong => {
                StyledString::Text(rcstr!("the name must be at most 40 ASCII characters"))
            }
            Self::DotOrDotDot => StyledString::Text(rcstr!("the name must not be `.` or `..`")),
            Self::NonAscii => {
                StyledString::Text(rcstr!("the name must contain only ASCII characters"))
            }
            Self::AsciiControlCharacter => StyledString::Text(rcstr!(
                "the name must not contain NUL or ASCII control characters"
            )),
            Self::ReservedCharacter(character) => StyledString::Line(vec![
                StyledString::Text(rcstr!("the name contains the reserved character ")),
                StyledString::Code(character.clone()),
            ]),
            Self::TrailingSpaceOrPeriod => {
                StyledString::Text(rcstr!("the name must not end in a space or period"))
            }
            Self::WindowsDeviceName => {
                StyledString::Text(rcstr!("the name must not be a Windows device name"))
            }
        }
    }
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
    InvalidName(AdditionalRootInvalidName),
    NameCollision { existing_key: RcStr },
    OverlappingRoot { key: Option<RcStr>, path: RcStr },
}

impl AdditionalRootIssueReason {
    fn description(&self) -> StyledString {
        match self {
            Self::Io(error) => StyledString::Text(error.clone()),
            Self::InvalidName(reason) => reason.description(),
            Self::NameCollision { existing_key } => StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "the name collides case-insensitively with the earlier root "
                )),
                StyledString::Code(existing_key.clone()),
            ]),
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

#[derive(
    Clone, Debug, PartialEq, Eq, NonLocalValue, OperationValue, TraceRawVcs, Encode, Decode,
)]
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
    let mut overlapping_check = OverlappingRootCheck::new(project_root.clone());
    let mut configured_names: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
    let mut roots_by_name = FxIndexMap::default();
    let mut issues: Vec<ReadRef<PlainIssue>> = Vec::new();
    for additional_root in additional_roots {
        let mut push_issue = async |reason: AdditionalRootIssueReason| -> Result<()> {
            if let Some(issue) = &*additional_root_issue_operation(
                container,
                issue_path.clone(),
                additional_root.key.clone(),
                additional_root.path.clone(),
                reason,
            )
            .read_strongly_consistent()
            .await?
            {
                issues.push(issue.clone());
            }
            Ok(())
        };

        if let Err(reason) = validate_additional_root_name(&additional_root.key) {
            push_issue(AdditionalRootIssueReason::InvalidName(reason)).await?;
            continue;
        }

        let folded_name = RcStr::from(additional_root.key.to_ascii_lowercase());
        if let Some(existing_key) = configured_names.get(&folded_name) {
            push_issue(AdditionalRootIssueReason::NameCollision {
                existing_key: existing_key.clone(),
            })
            .await?;
            continue;
        }
        configured_names.insert(folded_name, additional_root.key.clone());

        let configured_path = additional_root.path.clone();
        let canonical = match tokio::task::spawn_blocking(move || {
            canonicalize_to_rcstr(Path::new(&*configured_path))
        })
        .await?
        {
            Ok(canonical) => canonical,
            Err(_) if additional_root.ignore_if_missing => continue,
            Err(error) => {
                push_issue(AdditionalRootIssueReason::Io(RcStr::from(
                    error.to_string(),
                )))
                .await?;
                continue;
            }
        };
        if let Err((overlapping_key, overlapping_path)) =
            overlapping_check.insert(Some(additional_root.key.clone()), canonical.clone())
        {
            push_issue(AdditionalRootIssueReason::OverlappingRoot {
                key: overlapping_key,
                path: overlapping_path,
            })
            .await?;
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

fn validate_additional_root_name(name: &str) -> Result<(), AdditionalRootInvalidName> {
    if name.is_empty() {
        return Err(AdditionalRootInvalidName::Empty);
    }
    if name.len() > 40 {
        return Err(AdditionalRootInvalidName::TooLong);
    }
    if name == "." || name == ".." {
        return Err(AdditionalRootInvalidName::DotOrDotDot);
    }
    if !name.is_ascii() {
        return Err(AdditionalRootInvalidName::NonAscii);
    }
    if name.bytes().any(|byte| byte.is_ascii_control()) {
        return Err(AdditionalRootInvalidName::AsciiControlCharacter);
    }
    if let Some(byte) = name.bytes().find(|byte| {
        matches!(
            byte,
            b'<' | b'>' | b':' | b'"' | b'/' | b'\\' | b'|' | b'?' | b'*'
        )
    }) {
        return Err(AdditionalRootInvalidName::ReservedCharacter(RcStr::from(
            char::from(byte).to_string(),
        )));
    }
    if name.ends_with([' ', '.']) {
        return Err(AdditionalRootInvalidName::TrailingSpaceOrPeriod);
    }

    let basename = name.split('.').next().unwrap_or(name);
    let basename = basename.to_ascii_uppercase();
    let is_device_number =
        |suffix: &str| suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9');
    let is_device_name = matches!(basename.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || basename.strip_prefix("COM").is_some_and(is_device_number)
        || basename.strip_prefix("LPT").is_some_and(is_device_number);
    if is_device_name {
        return Err(AdditionalRootInvalidName::WindowsDeviceName);
    }

    Ok(())
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

struct OverlappingRootCheck {
    accepted: BTreeMap<PathBuf, (Option<RcStr>, RcStr)>,
}

impl OverlappingRootCheck {
    fn new(project_root: RcStr) -> Self {
        Self {
            accepted: BTreeMap::from([(PathBuf::from(&*project_root), (None, project_root))]),
        }
    }

    fn insert(&mut self, key: Option<RcStr>, path: RcStr) -> Result<(), (Option<RcStr>, RcStr)> {
        let canonical = Path::new(&*path);
        if let Some((root, value)) = self
            .accepted
            .range::<Path, _>((Bound::Unbounded, Bound::Included(canonical)))
            .next_back()
            && canonical.starts_with(root)
        {
            return Err(value.clone());
        }
        if let Some((_, value)) = self
            .accepted
            .range::<Path, _>((Bound::Included(canonical), Bound::Unbounded))
            .next()
            .filter(|(root, _)| root.starts_with(canonical))
        {
            return Err(value.clone());
        }
        self.accepted.insert(canonical.to_path_buf(), (key, path));
        Ok(())
    }
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
    fn identifies_an_overlapping_root() {
        let mut roots = OverlappingRootCheck::new(rcstr!("/workspace/project"));
        assert_eq!(
            roots.insert(
                Some(rcstr!("packages")),
                rcstr!("/workspace/project/packages")
            ),
            Err((None, rcstr!("/workspace/project")))
        );
        roots
            .insert(Some(rcstr!("vendor")), rcstr!("/workspace/vendor"))
            .unwrap();
        assert_eq!(
            roots.insert(Some(rcstr!("workspace")), rcstr!("/workspace")),
            Err((None, rcstr!("/workspace/project")))
        );
        assert_eq!(
            roots.insert(Some(rcstr!("package")), rcstr!("/workspace/vendor/package")),
            Err((Some(rcstr!("vendor")), rcstr!("/workspace/vendor")))
        );
        assert_eq!(
            roots.insert(
                Some(rcstr!("project-other")),
                rcstr!("/workspace/project-other")
            ),
            Ok(())
        );
    }

    #[test]
    fn validates_additional_root_names() {
        for valid in ["linkedPackages", "packages-1", "with space", "COM10"] {
            assert_eq!(validate_additional_root_name(valid), Ok(()), "{valid}");
        }

        for invalid in [
            "",
            ".",
            "..",
            "this-name-is-more-than-forty-ascii-characters-long",
            "nön-ascii",
            "control\u{1f}",
            "delete\u{7f}",
            "with/slash",
            "trailing ",
            "trailing.",
            "CON",
            "nul.txt",
            "cOm1.data",
            "LPT9",
        ] {
            assert!(validate_additional_root_name(invalid).is_err(), "{invalid}");
        }

        let reason = AdditionalRootInvalidName::ReservedCharacter(rcstr!("/"));
        assert_eq!(
            validate_additional_root_name("with/slash"),
            Err(reason.clone())
        );
        assert_eq!(
            reason.description(),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("the name contains the reserved character ")),
                StyledString::Code(rcstr!("/")),
            ])
        );
    }
}
