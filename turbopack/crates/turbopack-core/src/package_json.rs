use std::ops::Deref;

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileJsonContent, FileSystemPath};

use super::issue::Issue;
use crate::{
    asset::Asset,
    issue::{
        IssueExt, IssueSource, IssueStage, OptionIssueSource, OptionStyledString, StyledString,
    },
    source::Source,
    source_pos::SourcePos,
};

/// PackageJson wraps the parsed JSON content of a `package.json` file. The
/// wrapper is necessary so that we can reference the [FileJsonContent]'s inner
/// [serde_json::Value] without cloning it.
#[derive(PartialEq, Eq, ValueDebugFormat, TraceRawVcs, NonLocalValue)]
pub struct PackageJson(ReadRef<FileJsonContent>);

impl Deref for PackageJson {
    type Target = JsonValue;
    fn deref(&self) -> &Self::Target {
        match &*self.0 {
            FileJsonContent::Content(json) => json,
            _ => unreachable!("PackageJson is guaranteed to hold Content"),
        }
    }
}

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct OptionPackageJson(Option<PackageJson>);

/// Reads a package.json file (if it exists). If the file is unparsable, it
/// emits a useful [Issue] pointing to the invalid location.
#[turbo_tasks::function]
pub async fn read_package_json(path: ResolvedVc<Box<dyn Source>>) -> Result<Vc<OptionPackageJson>> {
    let read = path.content().parse_json().await?;
    match &*read {
        FileJsonContent::Content(_) => Ok(OptionPackageJson(Some(PackageJson(read))).cell()),
        FileJsonContent::NotFound => Ok(OptionPackageJson(None).cell()),
        FileJsonContent::Unparsable(e) => {
            let error_message = RcStr::from(format!(
                "package.json is not parseable: invalid JSON: {}",
                e.message
            ));

            let source = match (e.start_location, e.end_location) {
                (None, None) => IssueSource::from_source_only(path),
                (Some((line, column)), None) | (None, Some((line, column))) => {
                    IssueSource::from_line_col(
                        path,
                        SourcePos { line, column },
                        SourcePos { line, column },
                    )
                }
                (Some((start_line, start_column)), Some((end_line, end_column))) => {
                    IssueSource::from_line_col(
                        path,
                        SourcePos {
                            line: start_line,
                            column: start_column,
                        },
                        SourcePos {
                            line: end_line,
                            column: end_column,
                        },
                    )
                }
            };
            PackageJsonIssue {
                error_message,
                source,
            }
            .resolved_cell()
            .emit();
            Ok(OptionPackageJson(None).cell())
        }
    }
}

/// Reusable Issue struct representing any problem with a `package.json`
#[turbo_tasks::value(shared)]
pub struct PackageJsonIssue {
    pub error_message: RcStr,
    pub source: IssueSource,
}

#[turbo_tasks::value_impl]
impl Issue for PackageJsonIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Error parsing package.json file")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.error_message.clone()).resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}
