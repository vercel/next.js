use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::parse::Request,
};
use turbopack_resolve::{
    ecmascript::apply_cjs_specific_options, resolve_options_context::ResolveOptionsContext,
};

#[turbo_tasks::function]
fn react_refresh_request() -> Vc<Request> {
    Request::parse_string(rcstr!("@next/react-refresh-utils/dist/runtime"))
}

#[turbo_tasks::function]
fn react_refresh_request_in_next() -> Vc<Request> {
    Request::parse_string(rcstr!(
        "next/dist/compiled/@next/react-refresh-utils/dist/runtime"
    ))
}

#[turbo_tasks::value]
pub enum ResolveReactRefreshResult {
    NotFound,
    Found(ResolvedVc<Request>),
}

impl ResolveReactRefreshResult {
    pub fn as_request(&self) -> Option<Vc<Request>> {
        match self {
            ResolveReactRefreshResult::NotFound => None,
            ResolveReactRefreshResult::Found(r) => Some(**r),
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
    path: FileSystemPath,
    resolve_options_context: Vc<ResolveOptionsContext>,
) -> Result<Vc<ResolveReactRefreshResult>> {
    let resolve_options = apply_cjs_specific_options(turbopack_resolve::resolve::resolve_options(
        path.clone(),
        resolve_options_context,
    ));
    for request in [react_refresh_request_in_next(), react_refresh_request()] {
        let result = turbopack_core::resolve::resolve(
            path.clone(),
            ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
            request,
            resolve_options,
        )
        .first_source();

        if result.await?.is_some() {
            return Ok(ResolveReactRefreshResult::Found(request.to_resolved().await?).cell());
        }
    }
    ReactRefreshResolvingIssue { path }.resolved_cell().emit();
    Ok(ResolveReactRefreshResult::NotFound.cell())
}

/// An issue that occurred while resolving the React Refresh runtime module.
#[turbo_tasks::value(shared)]
pub struct ReactRefreshResolvingIssue {
    path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Could not resolve React Refresh runtime")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "React Refresh will be disabled.\nTo enable React Refresh, install the "
                )),
                StyledString::Code(rcstr!("react-refresh")),
                StyledString::Text(rcstr!(" and ")),
                StyledString::Code(rcstr!("@next/react-refresh-utils")),
                StyledString::Text(rcstr!(" modules.")),
            ])
            .resolved_cell(),
        ))
    }
}
