use anyhow::{anyhow, Result};
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::{
    chunk::EcmascriptChunkPlaceableVc,
    resolve::{apply_cjs_specific_options, cjs_resolve},
};
use turbopack_core::{
    context::AssetContextVc,
    environment::EnvironmentVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    resolve::{parse::RequestVc, ResolveResult},
};

#[turbo_tasks::function]
fn react_refresh_request() -> RequestVc {
    RequestVc::parse_string("@next/react-refresh-utils/dist/runtime".to_string())
}

/// Checks whether we can resolve the React Refresh runtime module from the
/// given path. Emits an issue if we can't.
///
/// Differs from `resolve_react_refresh` in that we don't have access to an
/// [AssetContextVc] when we first want to check for RR.
#[turbo_tasks::function]
pub async fn assert_can_resolve_react_refresh(
    path: FileSystemPathVc,
    environment: EnvironmentVc,
) -> Result<BoolVc> {
    let resolve_options = apply_cjs_specific_options(turbopack::resolve_options(path, environment));
    let result = turbopack_core::resolve::resolve(path, react_refresh_request(), resolve_options);

    Ok(match &*result.await? {
        ResolveResult::Single(_, _) => BoolVc::cell(true),
        _ => {
            ReactRefreshResolvingIssue {
                path,
                description: StringVc::cell(
                    "could not resolve the `@next/react-refresh-utils/dist/runtime` module"
                        .to_string(),
                ),
            }
            .cell()
            .as_issue()
            .emit();
            BoolVc::cell(false)
        }
    })
}

/// Resolves the React Refresh runtime module from the given [AssetContextVc].
#[turbo_tasks::function]
pub async fn resolve_react_refresh(context: AssetContextVc) -> Result<EcmascriptChunkPlaceableVc> {
    match &*cjs_resolve(react_refresh_request(), context).await? {
        ResolveResult::Single(asset, _) => {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
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
    description: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for ReactRefreshResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while resolving the React Refresh runtime. React Refresh will be \
             disabled.\nTo enable React Refresh, install the `react-refresh` and \
             `@next/react-refresh-utils` modules."
                .to_string(),
        ))
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
        self.description
    }
}
