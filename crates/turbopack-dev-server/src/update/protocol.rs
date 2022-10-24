use std::{collections::BTreeMap, ops::Deref, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use turbopack_cli_utils::issue::{format_issue, LogOptions};
use turbopack_core::{
    issue::{IssueSeverity, PlainIssue},
    source_pos::SourcePos,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct ResourceIdentifier {
    pub path: String,
    pub headers: Option<BTreeMap<String, String>>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Subscribe {
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
    pub start: SourcePos,
    pub end: SourcePos,
}

#[derive(Serialize)]
pub struct Issue<'a> {
    pub severity: IssueSeverity,
    pub context: &'a str,
    pub category: &'a str,

    pub title: &'a str,
    pub description: &'a str,
    pub detail: &'a str,
    pub documentation_link: &'a str,

    pub source: Option<IssueSource<'a>>,
    pub sub_issues: Vec<Issue<'a>>,

    pub formatted: String,
}

impl<'a> From<&'a PlainIssue> for Issue<'a> {
    fn from(plain: &'a PlainIssue) -> Self {
        let source = plain.source.as_deref().map(|source| IssueSource {
            asset: Asset {
                path: &source.asset.path.path,
            },
            start: source.start,
            end: source.end,
        });

        Issue {
            severity: plain.severity,
            context: &plain.context,
            category: &plain.category,
            title: &plain.title,
            description: &plain.description,
            documentation_link: &plain.documentation_link,
            detail: &plain.detail,
            source,
            sub_issues: plain.sub_issues.iter().map(|p| p.deref().into()).collect(),
            formatted: format_issue(
                plain,
                None,
                &LogOptions {
                    current_dir: PathBuf::new(),
                    show_all: true,
                    log_detail: true,
                    log_level: IssueSeverity::Info,
                },
            ),
        }
    }
}
