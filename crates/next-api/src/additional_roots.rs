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
};
use turbo_tasks_fs::{
    DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig, FileSystemPath, canonicalize_to_rcstr,
};
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, PlainIssue, StyledString};

use crate::{
    global_virtual_store::find_global_virtual_store,
    project::{ProjectContainer, additional_root_path_operation, disk_file_system_operation},
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
    Encode,
    Decode,
)]
pub struct AdditionalRootConfig {
    pub key: RcStr,
    pub path: RcStr,
    pub ignore_if_missing: bool,
}

/// A root that is detected automatically, rather than configured in `next.config.js`.
#[turbo_tasks::task_input]
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, Hash, OperationValue, Serialize, Deserialize, Encode, Decode,
)]
pub(crate) enum BuiltinRootKind {
    /// See [`find_global_virtual_store`].
    GlobalVirtualStore,
}

impl BuiltinRootKind {
    /// The [`DiskFileSystem`] name. Unlike configured roots, this does not have an `@` prefix, so
    /// it cannot collide with them.
    fn name(self) -> RcStr {
        match self {
            Self::GlobalVirtualStore => rcstr!("gvs"),
        }
    }

    fn label(self) -> RcStr {
        match self {
            Self::GlobalVirtualStore => rcstr!("package manager global virtual store"),
        }
    }

    fn config_option(self) -> RcStr {
        match self {
            Self::GlobalVirtualStore => rcstr!("experimental.turbopackDetectGlobalVirtualStore"),
        }
    }
}

#[turbo_tasks::task_input]
#[derive(
    Clone, Debug, PartialEq, Eq, Hash, OperationValue, Serialize, Deserialize, Encode, Decode,
)]
enum AdditionalRootInvalidName {
    Empty,
    TooLong,
    InvalidCharacter,
    WindowsDeviceName,
}

impl AdditionalRootInvalidName {
    fn description(&self) -> StyledString {
        match self {
            Self::Empty => StyledString::Text(rcstr!("the name must not be empty")),
            Self::TooLong => {
                StyledString::Text(rcstr!("the name must be at most 40 ASCII characters"))
            }
            Self::InvalidCharacter => StyledString::Text(rcstr!(
                "the name must contain only ASCII letters, digits, underscores, and hyphens"
            )),
            Self::WindowsDeviceName => {
                StyledString::Text(rcstr!("the name must not be a Windows device name"))
            }
        }
    }
}

#[turbo_tasks::task_input]
#[derive(
    Clone, Debug, PartialEq, Eq, Hash, OperationValue, Serialize, Deserialize, Encode, Decode,
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

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, OperationValue, Encode, Decode)]
pub(crate) struct AdditionalDiskFileSystem {
    pub canonical_path: RcStr,
    pub file_system: OperationVc<DiskFileSystem>,
}

/// Constructed file systems and issues for the configured additional roots.
pub(crate) struct AdditionalRootsInitialization {
    /// Keyed by the [`DiskFileSystem`] name: `@{key}` for configured roots, or a bare name (e.g.
    /// `gvs`) for builtin roots.
    pub roots_by_name: FxIndexMap<RcStr, AdditionalDiskFileSystem>,
    pub issues: Vec<ReadRef<PlainIssue>>,
}

/// Options controlling which builtin roots are automatically detected.
pub(crate) struct BuiltinRootsConfig {
    /// See [`find_global_virtual_store`].
    pub detect_global_virtual_store: bool,
}

pub(crate) async fn create_additional_root_file_systems(
    container: ResolvedVc<ProjectContainer>,
    additional_roots: Vec<AdditionalRootConfig>,
    builtin_roots: BuiltinRootsConfig,
    project_root: &RcStr,
    project_path: &RcStr,
    watcher_config: DiskWatcherConfig,
    map: OperationVc<DiskFileSystemMap>,
    issue_path: FileSystemPath,
) -> Result<AdditionalRootsInitialization> {
    let mut overlapping_check = OverlappingRootCheck::new(project_root.clone());
    let mut configured_names: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
    // `(file system name, canonical path)` pairs
    let mut accepted_roots: Vec<(RcStr, RcStr)> = Vec::new();
    let mut issues: Vec<ReadRef<PlainIssue>> = Vec::new();

    // Builtin roots are checked after configured roots, so that a configured root covering the
    // same location takes precedence.
    let builtin_roots = builtin_roots
        .detect_global_virtual_store
        .then(|| find_global_virtual_store(Path::new(&**project_root), project_path))
        .flatten()
        .map(|path| {
            let kind = BuiltinRootKind::GlobalVirtualStore;
            (
                Some(kind),
                AdditionalRootConfig {
                    key: kind.name(),
                    path,
                    ignore_if_missing: true,
                },
            )
        });

    // builtin roots are configured after user roots, in the case of conflicts, user-configured
    // roots take precedence
    let all_roots = additional_roots
        .into_iter()
        .map(|root| (None, root))
        .chain(builtin_roots);

    for (builtin, additional_root) in all_roots {
        let mut push_issue = async |reason: AdditionalRootIssueReason| -> Result<()> {
            if let Some(issue) = &*additional_root_issue_operation(
                container,
                issue_path.clone(),
                builtin,
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

        // Built-in roots don't need name validation, additional roots are namespaced (@-prefixed)
        // to avoid collisions with built-in roots
        if builtin.is_none() {
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
        }

        let canonical = match canonicalize_to_rcstr(Path::new(&*additional_root.path)) {
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
        // A virtual store inside the project root (e.g. the default `node_modules/.pnpm`) is not a
        // global virtual store, and doesn't need an additional root.
        if builtin == Some(BuiltinRootKind::GlobalVirtualStore)
            && Path::new(&*canonical).starts_with(&**project_root)
        {
            continue;
        }
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
        let name = match builtin {
            Some(kind) => kind.name(),
            None => RcStr::from(format!("@{}", additional_root.key)),
        };
        accepted_roots.push((name, canonical));
    }

    let mut roots_by_name = FxIndexMap::default();
    for (name, canonical) in accepted_roots {
        // We're not inside a turbo-task function: Call an operation to create a cell for us. We
        // pass the `ProjectContainer` and a name, which both have a stable identity, this reduces
        // invalidations when additional roots are added or removed.
        let canonical_root = additional_root_path_operation(container, name.clone());
        let operation = disk_file_system_operation(
            name.clone(),
            canonical_root,
            Vec::new(),
            watcher_config,
            map,
        );
        roots_by_name.insert(
            name,
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
    if !name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(AdditionalRootInvalidName::InvalidCharacter);
    }

    let uppercase_name = name.to_ascii_uppercase();
    let is_device_number =
        |suffix: &str| suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9');
    let is_device_name = matches!(uppercase_name.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || uppercase_name
            .strip_prefix("COM")
            .is_some_and(is_device_number)
        || uppercase_name
            .strip_prefix("LPT")
            .is_some_and(is_device_number);
    if is_device_name {
        return Err(AdditionalRootInvalidName::WindowsDeviceName);
    }

    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn additional_root_issue_operation(
    container: ResolvedVc<ProjectContainer>,
    path: FileSystemPath,
    builtin: Option<BuiltinRootKind>,
    key: RcStr,
    configured_path: RcStr,
    reason: AdditionalRootIssueReason,
) -> Result<Vc<OptionalAdditionalRootIssue>> {
    let issue = AdditionalRootIssue {
        path,
        builtin,
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
    /// `None` for roots configured in `next.config.js`.
    builtin: Option<BuiltinRootKind>,
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
        let description = if let Some(builtin) = self.builtin {
            StyledString::Stack(vec![
                StyledString::Line(vec![
                    StyledString::Text(rcstr!("The detected ")),
                    StyledString::Text(builtin.label()),
                    StyledString::Text(rcstr!(" ")),
                    StyledString::Code(self.configured_path.clone()),
                    StyledString::Text(rcstr!(" cannot be used as the additional root ")),
                    StyledString::Code(builtin.name()),
                    StyledString::Text(rcstr!(": ")),
                    self.reason.description(),
                ]),
                StyledString::Line(vec![
                    StyledString::Text(rcstr!("To disable this additional root, set ")),
                    StyledString::Code(builtin.config_option()),
                    StyledString::Text(rcstr!(" to ")),
                    StyledString::Code(rcstr!("false")),
                    StyledString::Text(rcstr!(" in ")),
                    StyledString::Code(rcstr!("next.config.js")),
                    StyledString::Text(rcstr!(".")),
                ]),
            ])
        } else {
            StyledString::Line(vec![
                StyledString::Text(rcstr!("The additional root ")),
                StyledString::Code(self.configured_path.clone()),
                StyledString::Text(rcstr!(" configured as ")),
                StyledString::Code(self.key.clone()),
                StyledString::Text(rcstr!(" is invalid: ")),
                self.reason.description(),
            ])
        };
        Ok(Some(description))
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
        for valid in [
            "linkedPackages",
            "packages-1",
            "with_underscore",
            "letters-AND_123",
            "COM10",
        ] {
            assert_eq!(validate_additional_root_name(valid), Ok(()), "{valid}");
        }

        assert_eq!(
            validate_additional_root_name(""),
            Err(AdditionalRootInvalidName::Empty)
        );
        assert_eq!(
            validate_additional_root_name("this-name-is-more-than-forty-ascii-characters-long"),
            Err(AdditionalRootInvalidName::TooLong)
        );

        for invalid_character in [
            ".",
            "..",
            "nön-ascii",
            "control\u{1f}",
            "delete\u{7f}",
            "with/slash",
            "with space",
            "trailing ",
            "trailing.",
        ] {
            assert_eq!(
                validate_additional_root_name(invalid_character),
                Err(AdditionalRootInvalidName::InvalidCharacter),
                "{invalid_character}"
            );
        }

        for device_name in ["CON", "prn", "Aux", "NUL", "cOm1", "LPT9"] {
            assert_eq!(
                validate_additional_root_name(device_name),
                Err(AdditionalRootInvalidName::WindowsDeviceName),
                "{device_name}"
            );
        }

        assert_eq!(
            AdditionalRootInvalidName::InvalidCharacter.description(),
            StyledString::Text(rcstr!(
                "the name must contain only ASCII letters, digits, underscores, and hyphens"
            ))
        );
    }
}
