pub mod node_native_binding;

use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    context::AssetContext,
    issue::{IssueSeverity, IssueSource, OptionIssueSource},
    reference_type::{
        CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType,
        UrlReferenceSubType,
    },
    resolve::{
        handle_resolve_error,
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve, ModuleResolveResult,
    },
};
/// Retrieves the [ResolutionConditions] of both the "into" package (allowing a
/// package to control how it can be imported) and the "in" package (controlling
/// how this package imports others) resolution options, so that they can be
/// manipulated together.
fn get_condition_maps(options: &mut ResolveOptions) -> Vec<&mut ResolutionConditions> {
    let mut condition_maps = Vec::with_capacity(2);
    for item in options.into_package.iter_mut() {
        if let ResolveIntoPackage::ExportsField { conditions, .. } = item {
            condition_maps.push(conditions);
        }
    }
    for item in options.in_package.iter_mut() {
        if let ResolveInPackage::ImportsField { conditions, .. } = item {
            condition_maps.push(conditions);
        }
    }
    condition_maps
}

#[turbo_tasks::function]
pub async fn apply_esm_specific_options(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.await?.clone_value();
    for conditions in get_condition_maps(&mut options) {
        conditions.insert("import".to_string(), ConditionValue::Set);
        conditions.insert("require".to_string(), ConditionValue::Unset);
    }
    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.await?.clone_value();
    for conditions in get_condition_maps(&mut options) {
        conditions.insert("import".to_string(), ConditionValue::Unset);
        conditions.insert("require".to_string(), ConditionValue::Set);
    }
    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn esm_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: Value<EcmaScriptModulesReferenceSubType>,
    issue_source: Vc<OptionIssueSource>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = Value::new(ReferenceType::EcmaScriptModules(ty.into_value()));
    let options = apply_esm_specific_options(origin.resolve_options(ty.clone()));
    specific_resolve(origin, request, options, ty, issue_source, issue_severity).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    issue_source: Vc<OptionIssueSource>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    // TODO pass CommonJsReferenceSubType
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()));
    specific_resolve(origin, request, options, ty, issue_source, issue_severity).await
}

#[turbo_tasks::function]
pub async fn url_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: Value<UrlReferenceSubType>,
    issue_source: Vc<IssueSource>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = Value::new(ReferenceType::Url(ty.into_value()));
    let resolve_options = origin.resolve_options(ty.clone());
    let rel_request = request.as_relative();
    let rel_result = resolve(origin.origin_path().parent(), rel_request, resolve_options);
    let result = if *rel_result.is_unresolveable().await? && rel_request.resolve().await? != request
    {
        resolve(origin.origin_path().parent(), request, resolve_options)
            .with_affecting_sources(rel_result.await?.get_affecting_sources().clone())
    } else {
        rel_result
    };
    let result = origin.context().process_resolve_result(result, ty.clone());
    handle_resolve_error(
        result,
        ty,
        origin.origin_path(),
        request,
        resolve_options,
        OptionIssueSource::some(issue_source),
        issue_severity,
    )
    .await
}

async fn specific_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: Value<ReferenceType>,
    issue_source: Vc<OptionIssueSource>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    let result = origin.resolve_asset(request, options, reference_type.clone());

    handle_resolve_error(
        result,
        reference_type,
        origin.origin_path(),
        request,
        options,
        issue_source,
        issue_severity,
    )
    .await
}

pub fn try_to_severity(in_try: bool) -> Vc<IssueSeverity> {
    if in_try {
        IssueSeverity::Warning.cell()
    } else {
        IssueSeverity::Error.cell()
    }
}
