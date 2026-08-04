use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
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
        let result = turbo_tasks::read!(turbopack_core::resolve::resolve(
            path.clone(),
            ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
            request,
            resolve_options,
        ))?;

        if result.first_source().is_some() {
            return Ok(ResolveReactRefreshResult::Found(turbo_tasks::read!(
                request.to_resolved()
            )?)
            .cell());
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

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Could not resolve React Refresh runtime"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!(
                "React Refresh will be disabled.\nTo enable React Refresh, install the "
            )),
            StyledString::Code(rcstr!("react-refresh")),
            StyledString::Text(rcstr!(" and ")),
            StyledString::Code(rcstr!("@next/react-refresh-utils")),
            StyledString::Text(rcstr!(" modules.")),
        ])))
    }
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Could not resolve React Refresh runtime"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!(
                "React Refresh will be disabled.\nTo enable React Refresh, install the "
            )),
            StyledString::Code(rcstr!("react-refresh")),
            StyledString::Text(rcstr!(" and ")),
            StyledString::Code(rcstr!("@next/react-refresh-utils")),
            StyledString::Text(rcstr!(" modules.")),
        ])))
    }
}
