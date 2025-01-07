use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSource, IssueStage, OptionIssueSource, OptionStyledString, StyledString};
use crate::{
    error::PrettyPrintError,
    issue::IssueSeverity,
    resolve::{
        options::{ImportMap, ImportMapResult, ResolveOptions},
        parse::Request,
    },
};

#[turbo_tasks::value(shared)]
pub struct ResolvingIssue {
    pub severity: ResolvedVc<IssueSeverity>,
    pub request_type: String,
    pub request: ResolvedVc<Request>,
    pub file_path: ResolvedVc<FileSystemPath>,
    pub resolve_options: ResolvedVc<ResolveOptions>,
    pub error_message: Option<String>,
    pub source: Option<ResolvedVc<IssueSource>>,
}

#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let request = self
            .request
            .request_pattern()
            .to_string()
            .await?
            .clone_value();
        Ok(StyledString::Line(vec![
            StyledString::Strong("Module not found".into()),
            StyledString::Text(": Can't resolve ".into()),
            StyledString::Code(request),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
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
            for request in request_parts {
                match lookup_import_map(**import_map, *self.file_path, **request).await {
                    Ok(None) => {}
                    Ok(Some(str)) => writeln!(description, "Import map: {}", str)?,
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
        Ok(Vc::cell(Some(
            StyledString::Text(description.into()).resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<Vc<OptionStyledString>> {
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
            context = self.file_path.to_string().await?
        )?;
        writeln!(
            detail,
            "Type of request: {request_type}",
            request_type = self.request_type,
        )?;
        Ok(Vc::cell(Some(
            StyledString::Text(detail.into()).resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    async fn source(&self) -> Result<Vc<OptionIssueSource>> {
        Ok(Vc::cell(match self.source {
            Some(source) => Some(
                source
                    .resolve_source_map(*self.file_path)
                    .to_resolved()
                    .await?,
            ),
            None => None,
        }))
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}

async fn lookup_import_map(
    import_map: Vc<ImportMap>,
    file_path: Vc<FileSystemPath>,
    request: Vc<Request>,
) -> Result<Option<ReadRef<RcStr>>> {
    let result = import_map.await?.lookup(file_path, request).await?;

    if matches!(result, ImportMapResult::NoEntry) {
        return Ok(None);
    }
    Ok(Some(result.cell().to_string().await?))
}
