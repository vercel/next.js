use std::{ops::Deref, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use turbopack_cli_utils::issue::{format_issue, LogOptions};
use turbopack_core::{
    issue::{IssueSeverity, PlainIssue},
    source_pos::SourcePos,
};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Subscribe {
        #[serde(rename = "chunkPath")]
        chunk_path: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInstruction<'a> {
    pub chunk_path: &'a str,
    #[serde(flatten)]
    pub ty: ClientUpdateInstructionType<'a>,
    pub issues: &'a [Issue<'a>],
}

pub const EMPTY_ISSUES: &[Issue<'static>] = &[];

impl<'a> ClientUpdateInstruction<'a> {
    pub fn new(
        chunk_path: &'a str,
        ty: ClientUpdateInstructionType<'a>,
        issues: &'a [Issue<'a>],
    ) -> Self {
        Self {
            chunk_path,
            ty,
            issues,
        }
    }

    pub fn restart(chunk_path: &'a str, issues: &'a [Issue<'a>]) -> Self {
        Self::new(chunk_path, ClientUpdateInstructionType::Restart, issues)
    }

    pub fn partial(chunk_path: &'a str, instruction: &'a Value, issues: &'a [Issue<'a>]) -> Self {
        Self::new(
            chunk_path,
            ClientUpdateInstructionType::Partial { instruction },
            issues,
        )
    }

    pub fn issues(chunk_path: &'a str, issues: &'a [Issue<'a>]) -> Self {
        Self::new(chunk_path, ClientUpdateInstructionType::Issues, issues)
    }

    pub fn with_issues(self, issues: &'a [Issue<'a>]) -> Self {
        Self {
            chunk_path: self.chunk_path,
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
