use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::Issue;
use crate::{
    error::PrettyPrintError,
    issue::{IssueSeverity, OptionIssueSource},
    resolve::{options::ResolveOptions, parse::Request},
};

#[turbo_tasks::value(shared)]
pub struct ResolvingIssue {
    pub severity: Vc<IssueSeverity>,
    pub request_type: String,
    pub request: Vc<Request>,
    pub context: Vc<FileSystemPath>,
    pub resolve_options: Vc<ResolveOptions>,
    pub error_message: Option<String>,
    pub source: Vc<OptionIssueSource>,
}

#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell(format!(
            "Error resolving {request_type}",
            request_type = self.request_type,
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.context
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "unable to resolve {module_name}",
            module_name = self.request.to_string().await?
        )))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<Vc<String>> {
        let mut detail = String::new();

        if let Some(error_message) = &self.error_message {
            writeln!(detail, "An error happened during resolving.")?;
            writeln!(detail, "Error message: {error_message}")?;
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
            context = self.context.to_string().await?
        )?;
        writeln!(
            detail,
            "Type of request: {request_type}",
            request_type = self.request_type,
        )?;
        if let Some(import_map) = &self.resolve_options.await?.import_map {
            let result = import_map.lookup(self.context, self.request);

            match result.to_string().await {
                Ok(str) => writeln!(detail, "Import map: {}", str)?,
                Err(err) => {
                    writeln!(
                        detail,
                        "Error while looking up import map: {}",
                        PrettyPrintError(&err)
                    )?;
                }
            }
        }
        Ok(Vc::cell(detail))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        self.source
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}
