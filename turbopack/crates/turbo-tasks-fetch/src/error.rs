use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub enum FetchErrorKind {
    Connect,
    Timeout,
    Status(u16),
    Other,
}

#[turbo_tasks::value(shared)]
pub struct FetchError {
    pub url: ResolvedVc<RcStr>,
    pub kind: ResolvedVc<FetchErrorKind>,
    pub detail: ResolvedVc<StyledString>,
}

impl FetchError {
    pub(crate) fn from_reqwest_error(error: &reqwest::Error, url: &str) -> FetchError {
        let kind = if error.is_connect() {
            FetchErrorKind::Connect
        } else if error.is_timeout() {
            FetchErrorKind::Timeout
        } else if let Some(status) = error.status() {
            FetchErrorKind::Status(status.as_u16())
        } else {
            FetchErrorKind::Other
        };

        FetchError {
            detail: StyledString::Text(error.to_string().into()).resolved_cell(),
            url: ResolvedVc::cell(url.into()),
            kind: kind.resolved_cell(),
        }
    }
}

#[turbo_tasks::value_impl]
impl FetchError {
    #[turbo_tasks::function]
    pub fn to_issue(
        &self,
        severity: IssueSeverity,
        issue_context: FileSystemPath,
    ) -> Vc<FetchIssue> {
        FetchIssue {
            issue_context,
            severity,
            url: self.url,
            kind: self.kind,
            detail: self.detail,
        }
        .cell()
    }
}

#[turbo_tasks::value(shared)]
pub struct FetchIssue {
    pub issue_context: FileSystemPath,
    pub severity: IssueSeverity,
    pub url: ResolvedVc<RcStr>,
    pub kind: ResolvedVc<FetchErrorKind>,
    pub detail: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for FetchIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.issue_context.clone().cell()
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Error while requesting resource")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Load.cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let url = &*self.url.await?;
        let kind = &*self.kind.await?;

        Ok(Vc::cell(Some(
            match kind {
                FetchErrorKind::Connect => StyledString::Line(vec![
                    StyledString::Text(rcstr!(
                        "There was an issue establishing a connection while requesting "
                    )),
                    StyledString::Code(url.clone()),
                ]),
                FetchErrorKind::Status(status) => StyledString::Line(vec![
                    StyledString::Text(rcstr!("Received response with status ")),
                    StyledString::Code(RcStr::from(status.to_string())),
                    StyledString::Text(rcstr!(" when requesting ")),
                    StyledString::Code(url.clone()),
                ]),
                FetchErrorKind::Timeout => StyledString::Line(vec![
                    StyledString::Text(rcstr!("Connection timed out when requesting ")),
                    StyledString::Code(url.clone()),
                ]),
                FetchErrorKind::Other => StyledString::Line(vec![
                    StyledString::Text(rcstr!("There was an issue requesting ")),
                    StyledString::Code(url.clone()),
                ]),
            }
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }
}
