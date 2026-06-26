use std::fmt::Write;

use anyhow::Result;
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

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        let request = self.request.request_pattern().to_string().owned().await?;
        Ok(StyledString::Line(vec![
            StyledString::Strong(rcstr!("Module not found")),
            StyledString::Text(rcstr!(": Can't resolve ")),
            StyledString::Code(request),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let mut description = String::new();
        if let Some(error_message) = &self.error_message {
            writeln!(description, "{error_message}")?;
        }
        let request_value = self.request.await?;
        let request_parts = match &*request_value {
            Request::Alternatives { requests } => requests.as_slice(),
            _ => &[self.request],
        };

        if let Some(import_map) = &self.resolve_options.await?.import_map {
            for req in request_parts {
                match lookup_import_map(**import_map, self.file_path.clone(), **req).await {
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

    async fn detail(&self) -> Result<Option<StyledString>> {
        let mut detail = String::new();

        if self.error_message.is_some() {
            writeln!(detail, "An error happened during resolving.")?;
        } else {
            writeln!(detail, "It was not possible to find the requested file.")?;
        }
        writeln!(
            detail,
            "Parsed request as written in source code: {request}",
            request = self.request.to_string().await?
        )?;
        writeln!(
            detail,
            "Path where resolving has started: {context}",
            context = self.file_path.to_string_ref().await?
        )?;
        writeln!(
            detail,
            "Type of request: {request_type}",
            request_type = self.request_type,
        )?;
        Ok(Some(StyledString::Text(detail.into())))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}

async fn lookup_import_map(
    import_map: Vc<ImportMap>,
    file_path: FileSystemPath,
    request: Vc<Request>,
) -> Result<Option<ReadRef<RcStr>>> {
    let result = import_map.await?.lookup(file_path, request).await?;

    if matches!(result, ImportMapResult::NoEntry) {
        return Ok(None);
    }
    Ok(Some(result.cell().to_string().await?))
}
