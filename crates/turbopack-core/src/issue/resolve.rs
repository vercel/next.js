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
    async fn title(&self) -> Result<StringVc> {
        if self.error_message.is_some() {
            Ok(StringVc::cell(format!(
                "error during resolving {request_type}",
                request_type = self.request_type,
            )))
        } else {
            Ok(StringVc::cell(format!(
                "unable to resolve {request_type} {module_name}",
                request_type = self.request_type,
                module_name = self.request.to_string().await?
            )))
        }
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
        if let Some(error_message) = &self.error_message {
            Ok(StringVc::cell(format!(
                "An error happened during resolving.
Error message: {error}
Parsed request as written in source code: {request}
Directory where resolving has started: {context}
Type of request: {request_type}",
                error = error_message,
                request_type = self.request_type,
                request = self.request.to_string().await?,
                context = self.context.to_string().await?
            )))
        } else {
            Ok(StringVc::cell(format!(
                "It was not possible to find the requested file.
Parsed request as written in source code: {request}
Directory where resolving has started: {context}
Type of request: {request_type}",
                request_type = self.request_type,
                request = self.request.to_string().await?,
                context = self.context.to_string().await?
            )))
        }
    }

    // TODO add sub_issue for a description of resolve_options
    // TODO add source link
}
