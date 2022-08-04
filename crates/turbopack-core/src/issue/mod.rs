pub mod analyze;
pub mod resolve;

use std::fmt::Display;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileLine, FileLinesContent, FileSystemPathVc};

use crate::asset::AssetVc;

#[turbo_tasks::value(shared)]
#[derive(PartialOrd, Ord, Copy, Clone)]
pub enum IssueSeverity {
    Bug,
    Fatal,
    Error,
    Warning,
    Hint,
    Note,
    Suggestions,
    Info,
}

impl Display for IssueSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IssueSeverity::Bug => f.write_str("bug"),
            IssueSeverity::Fatal => f.write_str("fatal"),
            IssueSeverity::Error => f.write_str("error"),
            IssueSeverity::Warning => f.write_str("warning"),
            IssueSeverity::Hint => f.write_str("hint"),
            IssueSeverity::Note => f.write_str("note"),
            IssueSeverity::Suggestions => f.write_str("suggestions"),
            IssueSeverity::Info => f.write_str("info"),
        }
    }
}

#[turbo_tasks::value_trait]
pub trait Issue {
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Error.into()
    }
    fn context(&self) -> FileSystemPathVc;
    fn category(&self) -> StringVc {
        StringVc::cell("".to_string())
    }

    // TODO add StyledStringVc
    fn title(&self) -> StringVc;
    // TODO add StyledStringVc
    fn description(&self) -> StringVc;
    fn documentation_link(&self) -> StringVc {
        StringVc::cell("".to_string())
    }

    // TODO add processing path

    fn source(&self) -> OptionIssueSourceVc {
        OptionIssueSourceVc::cell(None)
    }

    fn sub_issues(&self) -> IssuesVc {
        IssuesVc::cell(Vec::new())
    }
}

#[turbo_tasks::value(transparent)]
pub struct Issues(Vec<IssueVc>);

#[derive(Default, Debug, PartialEq, Eq, Copy, Clone, TraceRawVcs, Serialize, Deserialize)]
pub struct SourcePos {
    pub line: usize,
    pub column: usize,
}

impl SourcePos {
    pub fn max() -> Self {
        Self {
            line: usize::MAX,
            column: usize::MAX,
        }
    }
}

#[turbo_tasks::value]
pub struct IssueSource {
    pub asset: AssetVc,
    pub start: SourcePos,
    pub end: SourcePos,
}

#[turbo_tasks::value_impl]
impl IssueSourceVc {
    #[turbo_tasks::function]
    pub async fn from_byte_offset(asset: AssetVc, start: usize, end: usize) -> Result<Self> {
        fn find_line_and_column(lines: &[FileLine], offset: usize) -> SourcePos {
            match lines.binary_search_by(|line| line.bytes_offset.cmp(&offset)) {
                Ok(i) => SourcePos { line: i, column: 0 },
                Err(i) => {
                    if i == 0 {
                        SourcePos {
                            line: 0,
                            column: offset,
                        }
                    } else {
                        SourcePos {
                            line: i - 1,
                            column: offset - lines[i - 1].bytes_offset,
                        }
                    }
                }
            }
        }
        Ok(Self::cell(
            if let FileLinesContent::Lines(lines) = &*asset.content().lines().await? {
                let start = find_line_and_column(lines, start);
                let end = find_line_and_column(lines, end);
                IssueSource { asset, start, end }
            } else {
                IssueSource {
                    asset,
                    start: SourcePos::default(),
                    end: SourcePos::max(),
                }
            },
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionIssueSource(Option<IssueSourceVc>);
