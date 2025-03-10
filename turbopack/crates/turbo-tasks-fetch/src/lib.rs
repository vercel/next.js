#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{mark_session_dependent, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

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

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum ProxyConfig {
    Http(String),
    Https(String),
}

#[turbo_tasks::value(transparent)]
pub struct OptionProxyConfig(Option<ProxyConfig>);

#[turbo_tasks::function(network)]
pub async fn fetch(
    url: Vc<RcStr>,
    user_agent: Vc<Option<RcStr>>,
    proxy_option: Vc<OptionProxyConfig>,
) -> Result<Vc<FetchResult>> {
    let url = &*url.await?;
    let user_agent = &*user_agent.await?;
    let proxy_option = &*proxy_option.await?;

    let client_builder = reqwest::Client::builder();
    let client_builder = match proxy_option {
        Some(ProxyConfig::Http(proxy)) => client_builder.proxy(reqwest::Proxy::http(proxy)?),
        Some(ProxyConfig::Https(proxy)) => client_builder.proxy(reqwest::Proxy::https(proxy)?),
        _ => client_builder,
    };

    let client = client_builder.build()?;

    let mut builder = client.get(url.as_str());
    if let Some(user_agent) = user_agent {
        builder = builder.header("User-Agent", user_agent.as_str());
    }

    let response = builder.send().await.and_then(|r| r.error_for_status());
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let body = response.bytes().await?.to_vec();

            Ok(Vc::cell(Ok(HttpResponse {
                status,
                body: HttpResponseBody::resolved_cell(HttpResponseBody(body)),
            }
            .resolved_cell())))
        }
        Err(err) => {
            mark_session_dependent();
            Ok(Vc::cell(Err(
                FetchError::from_reqwest_error(&err, url).resolved_cell()
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
    pub async fn to_issue(
        self: Vc<Self>,
        severity: ResolvedVc<IssueSeverity>,
        issue_context: ResolvedVc<FileSystemPath>,
    ) -> Result<Vc<FetchIssue>> {
        let this = &*self.await?;
        Ok(FetchIssue {
            issue_context,
            severity,
            url: this.url,
            kind: this.kind,
            detail: this.detail,
        }
        .into())
    }
}

#[turbo_tasks::value(shared)]
pub struct FetchIssue {
    pub issue_context: ResolvedVc<FileSystemPath>,
    pub severity: ResolvedVc<IssueSeverity>,
    pub url: ResolvedVc<RcStr>,
    pub kind: ResolvedVc<FetchErrorKind>,
    pub detail: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for FetchIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.issue_context
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error while requesting resource".into()).cell()
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
                FetchErrorKind::Connect => format!(
                    "There was an issue establishing a connection while requesting {}.",
                    url
                )
                .into(),
                FetchErrorKind::Status(status) => format!(
                    "Received response with status {} when requesting {}",
                    status, url
                )
                .into(),
                FetchErrorKind::Timeout => {
                    format!("Connection timed out when requesting {}", url).into()
                }
                FetchErrorKind::Other => format!("There was an issue requesting {}", url).into(),
            })
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }
}
