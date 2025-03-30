use std::{fmt::Write, ops::Deref};

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc, Vc,
};
use turbo_tasks_fs::{FileContent, FileJsonContent, FileSystemPath};

use super::issue::Issue;
use crate::issue::{IssueExt, IssueStage, OptionStyledString, StyledString};

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

/// Reads a package.json file (if it exists). If the file is unparseable, it
/// emits a useful [Issue] pointing to the invalid location.
#[turbo_tasks::function]
pub async fn read_package_json(path: ResolvedVc<FileSystemPath>) -> Result<Vc<OptionPackageJson>> {
    let read = path.read_json().await?;
    match &*read {
        FileJsonContent::Content(_) => Ok(OptionPackageJson(Some(PackageJson(read))).cell()),
        FileJsonContent::NotFound => Ok(OptionPackageJson(None).cell()),
        FileJsonContent::Unparseable(e) => {
            let mut message = "package.json is not parseable: invalid JSON: ".to_string();
            if let FileContent::Content(content) = &*path.read().await? {
                let text = content.content().to_str()?;
                e.write_with_content(&mut message, &text)?;
            } else {
                write!(message, "{}", e)?;
            }
            PackageJsonIssue {
                error_message: message.into(),
                path,
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
    pub path: ResolvedVc<FileSystemPath>,
    pub error_message: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for PackageJsonIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error parsing package.json file".into()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.error_message.clone()).resolved_cell(),
        ))
    }
}
