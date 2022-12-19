use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;

use super::{Issue, IssueVc};
use crate::resolve::{options::ResolveOptionsVc, parse::RequestVc};

#[turbo_tasks::value(shared)]
pub struct ResolvingIssue {
    pub request_type: String,
    pub request: RequestVc,
    pub context: FileSystemPathVc,
    pub resolve_options: ResolveOptionsVc,
    pub error_message: Option<String>,
}

#[turbo_tasks::value_impl]
impl Issue for ResolvingIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell(format!(
            "Error resolving {request_type}",
            request_type = self.request_type,
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "unable to resolve {module_name}",
            module_name = self.request.to_string().await?
        )))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<StringVc> {
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
            let result = import_map.lookup(self.request);

            writeln!(detail, "Import map: {}", result.to_string().await?)?;
        }
        Ok(StringVc::cell(detail))
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}
