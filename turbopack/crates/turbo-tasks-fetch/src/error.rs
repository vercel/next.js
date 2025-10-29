use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub enum FetchErrorKind {
    Connect {
        has_system_certs: bool,
        has_rustls_cause: bool,
    },
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

/// Attempt to determine if there's a `rustls::Error` in the error's source chain.
///
/// This logic is fragile (e.g. depends that our copy of rustls and the version that reqwest uses
/// match exactly), but it's covered by unit tests. This seems slightly better than using `Display`
/// or `Debug` and inspecting the string.
fn has_rustls_cause(err: &reqwest::Error) -> bool {
    // make sure this cfg matches the one in `Cargo.toml`!
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "aarch64"),
        target_arch = "wasm32"
    )))]
    {
        let mut source = std::error::Error::source(err);
        while let Some(err) = source {
            if err.downcast_ref::<rustls::Error>().is_some() {
                return true;
            }
            if let Some(err) = err.downcast_ref::<std::io::Error>() {
                // `std::io::Error`'s `source` implementation returns the source of the wrapped
                // error instead of the wrapped error itself, so we need to special-case this,
                // otherwise we risk skipping over the rustls error.
                source = err.get_ref().map(|e| e as &dyn std::error::Error);
            } else {
                source = std::error::Error::source(err);
            }
        }
        return false;
    };

    // uses native-tls
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    return false;
}

impl FetchError {
    pub(crate) fn from_reqwest_error(
        error: &reqwest::Error,
        url: &str,
        webpki_certs_only: bool,
    ) -> FetchError {
        let kind = if error.is_connect() {
            FetchErrorKind::Connect {
                has_system_certs: webpki_certs_only,
                has_rustls_cause: has_rustls_cause(error),
            }
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
            match kind {
                FetchErrorKind::Connect {
                    has_system_certs,
                    has_rustls_cause,
                } => {
                    let base_message = StyledString::Line(vec![
                        StyledString::Text(rcstr!(
                            "There was an issue establishing a connection while requesting "
                        )),
                        StyledString::Code(url.clone()),
                    ]);
                    if !*has_system_certs && *has_rustls_cause {
                        StyledString::Stack(vec![
                            base_message,
                            StyledString::Line(vec![
                                StyledString::Strong(rcstr!("Hint: ")),
                                StyledString::Text(rcstr!(
                                    "It looks like this error was TLS-related. Try enabling \
                                     system TLS certificates with "
                                )),
                                StyledString::Code(rcstr!(
                                    "NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1"
                                )),
                                StyledString::Text(rcstr!(" as an environment variable, or set ")),
                                StyledString::Code(rcstr!(
                                    "experimental.turbopackUseSystemTlsCerts"
                                )),
                                StyledString::Text(rcstr!(" in your ")),
                                StyledString::Code(rcstr!("next.config.js")),
                                StyledString::Text(rcstr!(" file.")),
                            ]),
                        ])
                    } else {
                        base_message
                    }
                }
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
