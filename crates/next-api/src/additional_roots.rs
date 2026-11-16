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
use turbo_unix_path::unix_to_sys;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, PlainIssue, StyledString};
use turbopack_nodejs::global_virtual_store::{
    GlobalVirtualStoreError, find_global_virtual_store_untracked,
};

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
    Encode,
    Decode,
)]
pub struct AdditionalRootConfig {
    pub name: AdditionalRootName,
    pub path: RcStr,
    pub ignore_if_missing: bool,
}

/// A root that is detected automatically, rather than configured in `next.config.js`.
#[turbo_tasks::task_input]
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, Hash, OperationValue, Serialize, Deserialize, Encode, Decode,
)]
pub enum BuiltinRootKind {
    /// See [`find_global_virtual_store_untracked`].
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

/// Identifies an additional root, and determines its [`DiskFileSystem`] name.
#[turbo_tasks::task_input]
#[derive(
    Clone, Debug, PartialEq, Eq, Hash, OperationValue, Serialize, Deserialize, Encode, Decode,
)]
pub enum AdditionalRootName {
    Builtin(BuiltinRootKind),
    /// The key of a root configured in `next.config.js`. This must pass validation before it is
    /// used to create a file system.
    Configured(RcStr),
}

impl AdditionalRootName {
    /// Configured roots are namespaced with an `@` prefix, so they can't collide with builtin
    /// roots.
    fn fs_name(&self) -> RcStr {
        match self {
            Self::Builtin(kind) => kind.name(),
            Self::Configured(key) => RcStr::from(format!("@{key}")),
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
    /// The package manager's manifest describing a builtin root could not be parsed.
    InvalidManifest(RcStr),
    InvalidName(AdditionalRootInvalidName),
    NameCollision {
        existing_key: RcStr,
    },
    OverlappingRoot {
        /// The overlapped additional root, or `None` for the project root.
        name: Option<AdditionalRootName>,
        path: RcStr,
    },
}

impl AdditionalRootIssueReason {
    fn description(&self) -> StyledString {
        match self {
            Self::Io(error) | Self::InvalidManifest(error) => StyledString::Text(error.clone()),
            Self::InvalidName(reason) => reason.description(),
            Self::NameCollision { existing_key } => StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "the name collides case-insensitively with the earlier root "
                )),
                StyledString::Code(existing_key.clone()),
            ]),
            Self::OverlappingRoot {
                name: Some(AdditionalRootName::Configured(key)),
                path,
            } => StyledString::Line(vec![
                StyledString::Text(rcstr!("the root overlaps additional root ")),
                StyledString::Code(path.clone()),
                StyledString::Text(rcstr!(" configured as ")),
                StyledString::Code(key.clone()),
            ]),
            Self::OverlappingRoot {
                name: Some(AdditionalRootName::Builtin(kind)),
                path,
            } => StyledString::Line(vec![
                StyledString::Text(rcstr!("the root overlaps the detected ")),
                StyledString::Text(kind.label()),
                StyledString::Text(rcstr!(" ")),
                StyledString::Code(path.clone()),
            ]),
            Self::OverlappingRoot { name: None, path } => StyledString::Line(vec![
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
    /// Keyed by [`AdditionalRootName::fs_name`].
    pub roots_by_name: FxIndexMap<RcStr, AdditionalDiskFileSystem>,
    pub issues: Vec<ReadRef<PlainIssue>>,
}

/// Options controlling which builtin roots are automatically detected.
pub(crate) struct BuiltinRootsConfig {
    /// See [`find_global_virtual_store_untracked`].
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

    let mut push_issue = async |root: AdditionalRootName,
                                configured_path: Option<RcStr>,
                                reason: AdditionalRootIssueReason|
           -> Result<()> {
        if let Some(issue) = &*additional_root_issue_operation(
            container,
            issue_path.clone(),
            root,
            configured_path,
            reason,
        )
        .read_strongly_consistent()
        .await?
        {
            issues.push(issue.clone());
        }
        Ok(())
    };

    let mut builtin_roots_to_add: Vec<AdditionalRootConfig> = Vec::new();
    if builtin_roots.detect_global_virtual_store {
        let name = AdditionalRootName::Builtin(BuiltinRootKind::GlobalVirtualStore);
        match find_global_virtual_store_untracked(
            Path::new(&**project_root),
            Path::new(unix_to_sys(project_path).as_ref()),
        ) {
            Ok(path) => {
                if let Some(path) = path.and_then(|path| path.into_os_string().into_string().ok()) {
                    builtin_roots_to_add.push(AdditionalRootConfig {
                        name,
                        path: RcStr::from(path),
                        ignore_if_missing: false,
                    });
                }
            }
            Err(error) => {
                let message = RcStr::from(error.to_string());
                let reason = match error {
                    GlobalVirtualStoreError::Io(_) => AdditionalRootIssueReason::Io(message),
                    GlobalVirtualStoreError::InvalidManifest { .. } => {
                        AdditionalRootIssueReason::InvalidManifest(message)
                    }
                };
                push_issue(name, None, reason).await?;
            }
        }
    }

    // Builtin roots are checked after configured roots, so that a configured root covering the
    // same location takes precedence.
    let all_roots = additional_roots.into_iter().chain(builtin_roots_to_add);

    for AdditionalRootConfig {
        name,
        path,
        ignore_if_missing,
    } in all_roots
    {
        if let AdditionalRootName::Configured(key) = &name {
            if let Err(reason) = validate_additional_root_name(key) {
                push_issue(
                    name,
                    Some(path),
                    AdditionalRootIssueReason::InvalidName(reason),
                )
                .await?;
                continue;
            }

            let lowercase_key = RcStr::from(key.to_ascii_lowercase());
            if let Some(existing_key) = configured_names.get(&lowercase_key) {
                let existing_key = existing_key.clone();
                push_issue(
                    name,
                    Some(path),
                    AdditionalRootIssueReason::NameCollision { existing_key },
                )
                .await?;
                continue;
            }
            configured_names.insert(lowercase_key, key.clone());
        }

        let canonical = match canonicalize_to_rcstr(Path::new(&*path)) {
            Ok(canonical) => canonical,
            Err(_) if ignore_if_missing => continue,
            Err(error) => {
                push_issue(
                    name,
                    Some(path),
                    AdditionalRootIssueReason::Io(RcStr::from(error.to_string())),
                )
                .await?;
                continue;
            }
        };
        // A virtual store inside the project root (e.g. the default `node_modules/.pnpm`) is not a
        // global virtual store, and doesn't need an additional root.
        if name == AdditionalRootName::Builtin(BuiltinRootKind::GlobalVirtualStore)
            && Path::new(&*canonical).starts_with(&**project_root)
        {
            continue;
        }
        if let Err((overlapping_name, overlapping_path)) =
            overlapping_check.insert(Some(name.clone()), canonical.clone())
        {
            push_issue(
                name,
                Some(path),
                AdditionalRootIssueReason::OverlappingRoot {
                    name: overlapping_name,
                    path: overlapping_path,
                },
            )
            .await?;
            continue;
        }
        accepted_roots.push((name.fs_name(), canonical));
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
    root: AdditionalRootName,
    configured_path: Option<RcStr>,
    reason: AdditionalRootIssueReason,
) -> Result<Vc<OptionalAdditionalRootIssue>> {
    let issue = AdditionalRootIssue {
        path,
        root,
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

/// Accepted roots, keyed by their canonical path. `None` is the project root.
type AcceptedRoot = (Option<AdditionalRootName>, RcStr);

struct OverlappingRootCheck {
    accepted: BTreeMap<PathBuf, AcceptedRoot>,
}

impl OverlappingRootCheck {
    fn new(project_root: RcStr) -> Self {
        Self {
            accepted: BTreeMap::from([(PathBuf::from(&*project_root), (None, project_root))]),
        }
    }

    fn insert(
        &mut self,
        root: Option<AdditionalRootName>,
        path: RcStr,
    ) -> Result<(), AcceptedRoot> {
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
        self.accepted.insert(canonical.to_path_buf(), (root, path));
        Ok(())
    }
}

#[turbo_tasks::value(shared)]
struct AdditionalRootIssue {
    path: FileSystemPath,
    root: AdditionalRootName,
    /// `None` if a builtin root could not be detected.
    configured_path: Option<RcStr>,
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
        let configured_path = self.configured_path.clone().unwrap_or_default();
        let description = match &self.root {
            AdditionalRootName::Builtin(builtin) => {
                let reason = if self.configured_path.is_some() {
                    StyledString::Line(vec![
                        StyledString::Text(rcstr!("The detected ")),
                        StyledString::Text(builtin.label()),
                        StyledString::Text(rcstr!(" ")),
                        StyledString::Code(configured_path),
                        StyledString::Text(rcstr!(" cannot be used as the additional root ")),
                        StyledString::Code(builtin.name()),
                        StyledString::Text(rcstr!(": ")),
                        self.reason.description(),
                    ])
                } else {
                    StyledString::Line(vec![
                        StyledString::Text(rcstr!("Failed to detect the ")),
                        StyledString::Text(builtin.label()),
                        StyledString::Text(rcstr!(" for the additional root ")),
                        StyledString::Code(builtin.name()),
                        StyledString::Text(rcstr!(": ")),
                        self.reason.description(),
                    ])
                };
                StyledString::Stack(vec![
                    reason,
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
            }
            AdditionalRootName::Configured(key) => StyledString::Line(vec![
                StyledString::Text(rcstr!("The additional root ")),
                StyledString::Code(configured_path),
                StyledString::Text(rcstr!(" configured as ")),
                StyledString::Code(key.clone()),
                StyledString::Text(rcstr!(" is invalid: ")),
                self.reason.description(),
            ]),
        };
        Ok(Some(description))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_an_overlapping_root() {
        let configured = |key: &str| Some(AdditionalRootName::Configured(RcStr::from(key)));
        let mut roots = OverlappingRootCheck::new(rcstr!("/workspace/project"));
        assert_eq!(
            roots.insert(
                configured("packages"),
                rcstr!("/workspace/project/packages")
            ),
            Err((None, rcstr!("/workspace/project")))
        );
        roots
            .insert(configured("vendor"), rcstr!("/workspace/vendor"))
            .unwrap();
        assert_eq!(
            roots.insert(configured("workspace"), rcstr!("/workspace")),
            Err((None, rcstr!("/workspace/project")))
        );
        assert_eq!(
            roots.insert(configured("package"), rcstr!("/workspace/vendor/package")),
            Err((configured("vendor"), rcstr!("/workspace/vendor")))
        );
        assert_eq!(
            roots.insert(
                configured("project-other"),
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
