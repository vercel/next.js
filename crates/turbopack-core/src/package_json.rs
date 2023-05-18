use std::{fmt::Write, ops::Deref};

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_tasks::{debug::ValueDebugFormat, primitives::StringVc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileJsonContent, FileJsonContentReadRef, FileSystemPathVc};

use super::issue::{Issue, IssueVc};

/// PackageJson wraps the parsed JSON content of a `package.json` file. The
/// wrapper is necessary so that we can reference the [FileJsonContent]'s inner
/// [serde_json::Value] without cloning it.
#[derive(PartialEq, Eq, ValueDebugFormat, TraceRawVcs)]
pub struct PackageJson(FileJsonContentReadRef);

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
pub async fn read_package_json(path: FileSystemPathVc) -> Result<OptionPackageJsonVc> {
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
                error_message: message,
                path,
            }
            .cell()
            .as_issue()
            .emit();
            Ok(OptionPackageJson(None).cell())
        }
    }
}

/// Reusable Issue struct representing any problem with a `package.json`
#[turbo_tasks::value(shared)]
pub struct PackageJsonIssue {
    pub path: FileSystemPathVc,
    pub error_message: String,
}

#[turbo_tasks::value_impl]
impl Issue for PackageJsonIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error parsing package.json file".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("parse".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        StringVc::cell(self.error_message.clone())
    }
}
