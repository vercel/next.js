use std::fmt::Write;

use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{PrettyPrintError, ReadRef, ResolvedVc, ValueToString, ValueToStringRef, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSource, IssueStage, StyledString};
use crate::{
    issue::IssueSeverity,
    resolve::{
        options::{ImportMap, ImportMapResult, ResolveOptions},
        parse::Request,
    },
};

#[turbo_tasks::value(shared)]
pub struct ResolvingIssue {
    pub severity: IssueSeverity,
    pub request_type: String,
    pub request: ResolvedVc<Request>,
    pub file_path: FileSystemPath,
    pub resolve_options: ResolvedVc<ResolveOptions>,
    pub error_message: Option<String>,
    pub source: Option<IssueSource>,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        self.title_impl().await
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl().await
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        self.detail_impl().await
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn title(&self) -> Result<StyledString> {
        self.title_impl()
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl()
    }

    fn detail(&self) -> Result<Option<StyledString>> {
        self.detail_impl()
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}

/// Mode-agnostic bodies for the dual `Issue` impls above.
impl ResolvingIssue {
    turbo_tasks::dual_fn! {
        fn title_impl(&self) -> Result<StyledString> {
            let request =
                turbo_tasks::read!(self.request.request_pattern().to_string().owned())?;
            Ok(StyledString::Line(vec![
                StyledString::Strong(rcstr!("Module not found")),
                StyledString::Text(rcstr!(": Can't resolve ")),
                StyledString::Code(request),
            ]))
        }
    }

    turbo_tasks::dual_fn! {
        fn description_impl(&self) -> Result<Option<StyledString>> {
            let mut description = String::new();
            if let Some(error_message) = &self.error_message {
                writeln!(description, "{error_message}")?;
            }
            let request_value = turbo_tasks::read!(self.request)?;
            let request_parts = match &*request_value {
                Request::Alternatives { requests } => requests.as_slice(),
                _ => &[self.request],
            };

            if let Some(import_map) = &turbo_tasks::read!(self.resolve_options)?.import_map {
                for req in request_parts {
                    match turbo_tasks::read!(lookup_import_map(
                        **import_map,
                        self.file_path.clone(),
                        **req
                    )) {
                        Ok(None) => {}
                        Ok(Some(str)) => writeln!(description, "Import map: {str}")?,
                        Err(err) => {
                            writeln!(
                                description,
                                "Error while looking up import map: {}",
                                PrettyPrintError(&err)
                            )?;
                        }
                    }
                }
            }
            Ok(Some(StyledString::Text(description.into())))
        }
    }

    turbo_tasks::dual_fn! {
        fn detail_impl(&self) -> Result<Option<StyledString>> {
            let mut detail = String::new();

            if self.error_message.is_some() {
                writeln!(detail, "An error happened during resolving.")?;
            } else {
                writeln!(detail, "It was not possible to find the requested file.")?;
            }
            writeln!(
                detail,
                "Parsed request as written in source code: {request}",
                request = turbo_tasks::read!(self.request.to_string())?
            )?;
            writeln!(
                detail,
                "Path where resolving has started: {context}",
                context = turbo_tasks::read!(self.file_path.to_string_ref())?
            )?;
            writeln!(
                detail,
                "Type of request: {request_type}",
                request_type = self.request_type,
            )?;
            Ok(Some(StyledString::Text(detail.into())))
        }
    }
}

turbo_tasks::dual_fn! {
fn lookup_import_map(
    import_map: Vc<ImportMap>,
    file_path: FileSystemPath,
    request: Vc<Request>,
) -> Result<Option<ReadRef<RcStr>>> {
    let result =
        turbo_tasks::read!(turbo_tasks::read!(import_map)?.lookup(file_path, request))?;

    if matches!(result, ImportMapResult::NoEntry) {
        return Ok(None);
    }
    Ok(Some(turbo_tasks::read!(result.cell().to_string())?))
}
}
