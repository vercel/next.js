use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::resolve_options_context::ResolveOptionsContext;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity},
    resolve::parse::Request,
};
use turbopack_ecmascript::resolve::apply_cjs_specific_options;

#[turbo_tasks::function]
fn react_refresh_request() -> Vc<Request> {
    Request::parse_string("@next/react-refresh-utils/dist/runtime".to_string())
}

#[turbo_tasks::function]
fn react_refresh_request_in_next() -> Vc<Request> {
    Request::parse_string("next/dist/compiled/@next/react-refresh-utils/dist/runtime".to_string())
}

#[turbo_tasks::value]
pub enum ResolveReactRefreshResult {
    NotFound,
    Found(Vc<Request>),
}

impl ResolveReactRefreshResult {
    pub fn as_request(&self) -> Option<Vc<Request>> {
        match self {
            ResolveReactRefreshResult::NotFound => None,
            ResolveReactRefreshResult::Found(r) => Some(*r),
        }
    }
    pub fn is_found(&self) -> bool {
        match self {
            ResolveReactRefreshResult::NotFound => false,
            ResolveReactRefreshResult::Found(_) => true,
        }
    }
}

/// Checks whether we can resolve the React Refresh runtime module from the
/// given path. Emits an issue if we can't.
#[turbo_tasks::function]
pub async fn assert_can_resolve_react_refresh(
    path: Vc<FileSystemPath>,
    resolve_options_context: Vc<ResolveOptionsContext>,
) -> Result<Vc<ResolveReactRefreshResult>> {
    let resolve_options =
        apply_cjs_specific_options(turbopack::resolve_options(path, resolve_options_context));
    for request in [react_refresh_request_in_next(), react_refresh_request()] {
        let result = turbopack_core::resolve::resolve(path, request, resolve_options).first_asset();

        if result.await?.is_some() {
            return Ok(ResolveReactRefreshResult::Found(request).cell());
        }
    }
    ReactRefreshResolvingIssue { path }.cell().emit();
    Ok(ResolveReactRefreshResult::NotFound.cell())
}

/// An issue that occurred while resolving the React Refresh runtime module.
#[turbo_tasks::value(shared)]
pub struct ReactRefreshResolvingIssue {
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell("Could not resolve React Refresh runtime".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        Vc::cell(
            "React Refresh will be disabled.\nTo enable React Refresh, install the \
             `react-refresh` and `@next/react-refresh-utils` modules."
                .to_string(),
        )
    }
}
