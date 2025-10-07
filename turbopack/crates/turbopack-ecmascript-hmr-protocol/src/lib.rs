use std::{collections::BTreeMap, fmt::Display, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use turbo_rcstr::RcStr;
use turbopack_cli_utils::issue::{LogOptions, format_issue};
use turbopack_core::{
    issue::{IssueSeverity, IssueStage, PlainIssue, StyledString},
    source_pos::SourcePos,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ResourceIdentifier {
    pub path: RcStr,
    pub headers: Option<BTreeMap<RcStr, RcStr>>,
}

impl Display for ResourceIdentifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.path)?;
        if let Some(headers) = &self.headers {
            for (key, value) in headers.iter() {
                write!(f, " [{key}: {value}]")?;
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "turbopack-subscribe")]
    Subscribe {
        #[serde(flatten)]
        resource: ResourceIdentifier,
    },
    #[serde(rename = "turbopack-unsubscribe")]
    Unsubscribe {
        #[serde(flatten)]
        resource: ResourceIdentifier,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInstruction<'a> {
    pub resource: &'a ResourceIdentifier,
    #[serde(flatten)]
    pub ty: ClientUpdateInstructionType<'a>,
    pub issues: &'a [Issue<'a>],
}

pub const EMPTY_ISSUES: &[Issue<'static>] = &[];

impl<'a> ClientUpdateInstruction<'a> {
    pub fn new(
        resource: &'a ResourceIdentifier,
        ty: ClientUpdateInstructionType<'a>,
        issues: &'a [Issue<'a>],
    ) -> Self {
        Self {
            resource,
            ty,
            issues,
        }
    }

    pub fn restart(resource: &'a ResourceIdentifier, issues: &'a [Issue<'a>]) -> Self {
        Self::new(resource, ClientUpdateInstructionType::Restart, issues)
    }

    /// Returns a [`ClientUpdateInstruction`] that indicates that the resource
    /// was not found.
    pub fn not_found(resource: &'a ResourceIdentifier) -> Self {
        Self::new(resource, ClientUpdateInstructionType::NotFound, &[])
    }

    pub fn partial(
        resource: &'a ResourceIdentifier,
        instruction: &'a Value,
        issues: &'a [Issue<'a>],
    ) -> Self {
        Self::new(
            resource,
            ClientUpdateInstructionType::Partial { instruction },
            issues,
        )
    }

    pub fn issues(resource: &'a ResourceIdentifier, issues: &'a [Issue<'a>]) -> Self {
        Self::new(resource, ClientUpdateInstructionType::Issues, issues)
    }

    pub fn with_issues(self, issues: &'a [Issue<'a>]) -> Self {
        Self {
            resource: self.resource,
            ty: self.ty,
            issues,
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientUpdateInstructionType<'a> {
    Restart,
    NotFound,
    Partial { instruction: &'a Value },
    Issues,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerError {
    SSR(String),
    Turbo(String),
}

#[derive(Serialize)]
pub struct Asset<'a> {
    pub path: &'a str,
}

#[derive(Serialize)]
pub struct IssueSource<'a> {
    pub asset: Asset<'a>,
    pub range: Option<IssueSourceRange>,
}

#[derive(Serialize)]
pub struct IssueSourceRange {
    pub start: SourcePos,
    pub end: SourcePos,
}

#[derive(Serialize)]
pub struct Issue<'a> {
    pub severity: IssueSeverity,
    pub file_path: &'a str,
    pub stage: &'a IssueStage,

    pub title: &'a StyledString,
    pub description: Option<&'a StyledString>,
    pub detail: Option<&'a StyledString>,
    pub documentation_link: &'a str,

    pub source: Option<IssueSource<'a>>,

    pub formatted: String,
}

impl<'a> From<&'a PlainIssue> for Issue<'a> {
    fn from(plain: &'a PlainIssue) -> Self {
        let source = plain.source.as_ref().map(|source| IssueSource {
            asset: Asset {
                path: &source.asset.ident,
            },
            range: source
                .range
                .map(|(start, end)| IssueSourceRange { start, end }),
        });

        Issue {
            severity: plain.severity,
            file_path: &plain.file_path,
            stage: &plain.stage,
            title: &plain.title,
            description: plain.description.as_ref(),
            documentation_link: &plain.documentation_link,
            detail: plain.detail.as_ref(),
            source,
            // TODO(WEB-691) formatting the issue should be handled by the error overlay.
            // The browser could handle error formatting in a better way than the text only
            // formatting here
            formatted: format_issue(
                plain,
                None,
                &LogOptions {
                    current_dir: PathBuf::new(),
                    project_dir: PathBuf::new(),
                    show_all: true,
                    log_detail: true,
                    log_level: IssueSeverity::Info,
                },
            ),
        }
    }
}
