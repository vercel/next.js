use anyhow::{anyhow, Result};
use turbo_tasks::{debug::ValueDebug, primitives::StringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    ecmascript::{
        chunk::EcmascriptChunkPlaceableVc,
        resolve::{apply_cjs_specific_options, cjs_resolve},
    },
    resolve_options_context::ResolveOptionsContextVc,
};
use turbopack_core::{
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResult},
};

#[turbo_tasks::function]
fn react_refresh_request() -> RequestVc {
    RequestVc::parse_string("@next/react-refresh-utils/dist/runtime".to_string())
}

#[turbo_tasks::function]
fn react_refresh_request_in_next() -> RequestVc {
    RequestVc::parse_string("next/dist/compiled/@next/react-refresh-utils/dist/runtime".to_string())
}

#[turbo_tasks::value]
pub enum AssertReactRefreshResult {
    NotFound,
    Found(RequestVc),
}

impl AssertReactRefreshResult {
    pub fn as_request(&self) -> Option<RequestVc> {
        match self {
            AssertReactRefreshResult::NotFound => None,
            AssertReactRefreshResult::Found(r) => Some(*r),
        }
    }
    pub fn is_found(&self) -> bool {
        match self {
            AssertReactRefreshResult::NotFound => false,
            AssertReactRefreshResult::Found(_) => true,
        }
    }
}

/// Checks whether we can resolve the React Refresh runtime module from the
/// given path. Emits an issue if we can't.
///
/// Differs from `resolve_react_refresh` in that we don't have access to an
/// [AssetContextVc] when we first want to check for RR.
#[turbo_tasks::function]
pub async fn assert_can_resolve_react_refresh(
    path: FileSystemPathVc,
    resolve_options_context: ResolveOptionsContextVc,
) -> Result<AssertReactRefreshResultVc> {
    let resolve_options =
        apply_cjs_specific_options(turbopack::resolve_options(path, resolve_options_context));
    for request in [react_refresh_request_in_next(), react_refresh_request()] {
        let result = turbopack_core::resolve::resolve(path, request, resolve_options);

        match &*result.await? {
            ResolveResult::Single(_, _) | ResolveResult::Alternatives(_, _) => {
                return Ok(AssertReactRefreshResult::Found(request).cell())
            }
            _ => {}
        }
    }
    ReactRefreshResolvingIssue {
        path,
        detail: StringVc::cell(format!(
            "resolve options: {:?}",
            resolve_options.dbg().await?
        )),
    }
    .cell()
    .as_issue()
    .emit();
    Ok(AssertReactRefreshResult::NotFound.cell())
}

/// Resolves the React Refresh runtime module from the given [AssetContextVc].
#[turbo_tasks::function]
pub async fn resolve_react_refresh(origin: ResolveOriginVc) -> Result<EcmascriptChunkPlaceableVc> {
    match &*cjs_resolve(origin, react_refresh_request()).await? {
        ResolveResult::Single(asset, _) => {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                Ok(placeable)
            } else {
                Err(anyhow!("React Refresh runtime asset is not placeable"))
            }
        }
        ResolveResult::Alternatives(assets, _) if !assets.is_empty() => {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(assets[0]).await? {
                Ok(placeable)
            } else {
                Err(anyhow!("React Refresh runtime asset is not placeable"))
            }
        }
        // The react-refresh-runtime module is not installed.
        ResolveResult::Unresolveable(_) => Err(anyhow!(
            "could not resolve the `@next/react-refresh-utils/dist/runtime` module"
        )),
        _ => Err(anyhow!("invalid React Refresh runtime asset")),
    }
}

/// An issue that occurred while resolving the React Refresh runtime module.
#[turbo_tasks::value(shared)]
pub struct ReactRefreshResolvingIssue {
    path: FileSystemPathVc,
    detail: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Could not resolve React Refresh runtime".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        StringVc::cell(
            "React Refresh will be disabled.\nTo enable React Refresh, install the \
             `react-refresh` and `@next/react-refresh-utils` modules."
                .to_string(),
        )
    }

    #[turbo_tasks::function]
    fn detail(&self) -> StringVc {
        self.detail
    }
}
