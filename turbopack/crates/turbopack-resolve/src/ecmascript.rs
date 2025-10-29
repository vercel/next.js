use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    issue::IssueSource,
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ModuleResolveResult, ResolveResult, handle_resolve_error, handle_resolve_source_error,
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve,
    },
};
/// Retrieves the [ResolutionConditions] of the "into" and "in" package resolution options, so that
/// they can be manipulated together.
///
/// - "into" allows a package to control how it can be imported
/// - "in" controls how this package imports others
pub fn get_condition_maps(
    options: &mut ResolveOptions,
) -> impl Iterator<Item = &mut ResolutionConditions> {
    options
        .into_package
        .iter_mut()
        .filter_map(|item| {
            if let ResolveIntoPackage::ExportsField { conditions, .. } = item {
                Some(conditions)
            } else {
                None
            }
        })
        .chain(options.in_package.iter_mut().filter_map(|item| {
            if let ResolveInPackage::ImportsField { conditions, .. } = item {
                Some(conditions)
            } else {
                None
            }
        }))
}

pub fn apply_esm_specific_options(
    options: Vc<ResolveOptions>,
    reference_type: ReferenceType,
) -> Vc<ResolveOptions> {
    let clear_extensions = matches!(
        reference_type,
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportWithType(_))
    );

    apply_esm_specific_options_internal(options, clear_extensions)
}

#[turbo_tasks::function]
async fn apply_esm_specific_options_internal(
    options: Vc<ResolveOptions>,
    clear_extensions: bool,
) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.owned().await?;
    // TODO set fully_specified when in strict ESM mode
    // options.fully_specified = true;
    for conditions in get_condition_maps(&mut options) {
        conditions.insert(rcstr!("import"), ConditionValue::Set);
        conditions.insert(rcstr!("require"), ConditionValue::Unset);
    }

    if clear_extensions {
        options.extensions.clear();
    }

    options.parse_data_uris = true;

    Ok(options.cell())
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.owned().await?;
    for conditions in get_condition_maps(&mut options) {
        conditions.insert(rcstr!("import"), ConditionValue::Unset);
        conditions.insert(rcstr!("require"), ConditionValue::Set);
    }
    Ok(options.into())
}

pub async fn esm_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: EcmaScriptModulesReferenceSubType,
    is_optional: bool,
    issue_source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = ReferenceType::EcmaScriptModules(ty);
    let options = apply_esm_specific_options(origin.resolve_options(ty.clone()).await?, ty.clone())
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, is_optional, issue_source).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: CommonJsReferenceSubType,
    issue_source: Option<IssueSource>,
    is_optional: bool,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = ReferenceType::CommonJs(ty);
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()).await?)
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, is_optional, issue_source).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve_source(
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    ty: CommonJsReferenceSubType,
    issue_source: Option<IssueSource>,
    is_optional: bool,
) -> Result<Vc<ResolveResult>> {
    let ty = ReferenceType::CommonJs(ty);
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()).await?)
        .resolve()
        .await?;
    let result = resolve(
        origin.origin_path().await?.parent(),
        ty.clone(),
        *request,
        options,
    );

    handle_resolve_source_error(
        result,
        ty,
        origin.origin_path().owned().await?,
        *request,
        options,
        is_optional,
        issue_source,
    )
    .await
}

async fn specific_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: ReferenceType,
    is_optional: bool,
    issue_source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    let result = origin
        .resolve_asset(request, options, reference_type.clone())
        .await?;

    handle_resolve_error(
        result,
        reference_type,
        origin.origin_path().owned().await?,
        request,
        options,
        is_optional,
        issue_source,
    )
    .await
}
