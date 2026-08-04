use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, StyledString};

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

impl FetchIssue {
    turbo_tasks::dual_fn! {
    fn description_impl(&self) -> Result<Option<StyledString>> {
        let url = &*turbo_tasks::read!(self.url)?;
        let kind = &*turbo_tasks::read!(self.kind)?;

        Ok(Some(match kind {
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
        }))
    }
    }

    turbo_tasks::dual_fn! {
    fn detail_impl(&self) -> Result<Option<StyledString>> {
        Ok(Some((*turbo_tasks::read!(self.detail)?).clone()))
    }
    }
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for FetchIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.issue_context.clone())
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Error while requesting resource"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Load
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl().await
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        self.detail_impl().await
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for FetchIssue {
    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.issue_context.clone())
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Error while requesting resource"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Load
    }

    fn description(&self) -> Result<Option<StyledString>> {
        self.description_impl()
    }

    fn detail(&self) -> Result<Option<StyledString>> {
        self.detail_impl()
    }
}
