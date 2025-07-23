#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod reqwest_client_cache;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, duration_span, mark_session_dependent};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

use crate::reqwest_client_cache::try_get_cached_reqwest_client;
pub use crate::reqwest_client_cache::{
    __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len, ProxyConfig,
    ReqwestClientConfig,
};

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[turbo_tasks::value(transparent)]
pub struct FetchResult(Result<ResolvedVc<HttpResponse>, ResolvedVc<FetchError>>);

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: ResolvedVc<HttpResponseBody>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponseBody(pub Vec<u8>);

#[turbo_tasks::value_impl]
impl HttpResponseBody {
    #[turbo_tasks::function]
    pub async fn to_string(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let this = &*self.await?;
        Ok(Vc::cell(std::str::from_utf8(&this.0)?.into()))
    }
}

#[turbo_tasks::function(network)]
pub async fn fetch(
    url: RcStr,
    user_agent: Option<RcStr>,
    client_config: Vc<ReqwestClientConfig>,
) -> Result<Vc<FetchResult>> {
    let url_ref = &*url;
    let client_config = client_config.await?;
    let response_result: reqwest::Result<HttpResponse> = async move {
        let client = try_get_cached_reqwest_client(client_config)?;

        let mut builder = client.get(url_ref);
        if let Some(user_agent) = user_agent {
            builder = builder.header("User-Agent", user_agent.as_str());
        }

        let response = {
            let _span = duration_span!("fetch request", url = url_ref);
            builder.send().await
        }
        .and_then(|r| r.error_for_status())?;

        let status = response.status().as_u16();

        let body = {
            let _span = duration_span!("fetch response", url = url_ref);
            response.bytes().await?
        }
        .to_vec();

        Ok(HttpResponse {
            status,
            body: HttpResponseBody(body).resolved_cell(),
        })
    }
    .await;

    match response_result {
        Ok(resp) => Ok(Vc::cell(Ok(resp.resolved_cell()))),
        Err(err) => {
            // the client failed to construct or the HTTP request failed
            mark_session_dependent();
            Ok(Vc::cell(Err(
                FetchError::from_reqwest_error(&err, &url).resolved_cell()
            )))
        }
    }
}

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
    fn from_reqwest_error(error: &reqwest::Error, url: &str) -> FetchError {
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
        IssueStage::Load.into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let url = &*self.url.await?;
        let kind = &*self.kind.await?;

        Ok(Vc::cell(Some(
            StyledString::Text(match kind {
                FetchErrorKind::Connect => {
                    format!("There was an issue establishing a connection while requesting {url}.")
                        .into()
                }
                FetchErrorKind::Status(status) => {
                    format!("Received response with status {status} when requesting {url}").into()
                }
                FetchErrorKind::Timeout => {
                    format!("Connection timed out when requesting {url}").into()
                }
                FetchErrorKind::Other => format!("There was an issue requesting {url}").into(),
            })
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }
}
