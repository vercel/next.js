#![feature(min_specialization)]

use anyhow::Result;
use turbo_tasks::primitives::{OptionStringVc, StringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueSeverityVc, IssueVc};

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[turbo_tasks::value(transparent)]
pub struct FetchResult(Result<HttpResponseVc, FetchErrorVc>);

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: HttpResponseBodyVc,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponseBody(pub Vec<u8>);

#[turbo_tasks::value_impl]
impl HttpResponseBodyVc {
    #[turbo_tasks::function]
    pub async fn to_string(self) -> Result<StringVc> {
        let this = &*self.await?;
        Ok(StringVc::cell(std::str::from_utf8(&this.0)?.to_owned()))
    }
}

#[turbo_tasks::function]
pub async fn fetch(url: StringVc, user_agent: OptionStringVc) -> Result<FetchResultVc> {
    let url = url.await?.clone();
    let user_agent = &*user_agent.await?;
    let client = reqwest::Client::new();

    let mut builder = client.get(&url);
    if let Some(user_agent) = user_agent {
        builder = builder.header("User-Agent", user_agent);
    }

    let response = builder.send().await.and_then(|r| r.error_for_status());
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let body = response.bytes().await?.to_vec();

            Ok(FetchResultVc::cell(Ok(HttpResponse {
                status,
                body: HttpResponseBodyVc::cell(HttpResponseBody(body)),
            }
            .cell())))
        }
        Err(err) => Ok(FetchResultVc::cell(Err(FetchError::from_reqwest_error(
            &err, &url,
        )
        .cell()))),
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
    pub url: StringVc,
    pub kind: FetchErrorKindVc,
    pub detail: StringVc,
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
            detail: StringVc::cell(error.to_string()),
            url: StringVc::cell(url.to_owned()),
            kind: kind.into(),
        }
    }
}

#[turbo_tasks::value_impl]
impl FetchErrorVc {
    #[turbo_tasks::function]
    pub async fn to_issue(
        self,
        severity: IssueSeverityVc,
        context: FileSystemPathVc,
    ) -> Result<FetchIssueVc> {
        let this = &*self.await?;
        Ok(FetchIssue {
            context,
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
    pub context: FileSystemPathVc,
    pub severity: IssueSeverityVc,
    pub url: StringVc,
    pub kind: FetchErrorKindVc,
    pub detail: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for FetchIssue {
    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error while requesting resource".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("fetch".to_string())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        let url = &*self.url.await?;
        let kind = &*self.kind.await?;

        Ok(StringVc::cell(match kind {
            FetchErrorKind::Connect => format!(
                "There was an issue establishing a connection while requesting {}.",
                url
            ),
            FetchErrorKind::Status(status) => {
                format!(
                    "Received response with status {} when requesting {}",
                    status, url
                )
            }
            FetchErrorKind::Timeout => format!("Connection timed out when requesting {}", url),
            FetchErrorKind::Other => format!("There was an issue requesting {}", url),
        }))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> StringVc {
        self.detail
    }
}
