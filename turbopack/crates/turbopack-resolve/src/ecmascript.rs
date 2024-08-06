use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    issue::{IssueSeverity, IssueSource},
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        handle_resolve_error,
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        ModuleResolveResult,
    },
};
/// Retrieves the [ResolutionConditions] of both the "into" package (allowing a
/// package to control how it can be imported) and the "in" package (controlling
/// how this package imports others) resolution options, so that they can be
/// manipulated together.
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

#[turbo_tasks::function]
pub async fn apply_esm_specific_options(
    options: Vc<ResolveOptions>,
    reference_type: Value<ReferenceType>,
) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.await?.clone_value();
    // TODO set fully_specified when in strict ESM mode
    // options.fully_specified = true;
    for conditions in get_condition_maps(&mut options) {
        conditions.insert("import".into(), ConditionValue::Set);
        conditions.insert("require".into(), ConditionValue::Unset);
    }

    if matches!(
        reference_type.into_value(),
        ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportWithType(_))
    ) {
        options.extensions.clear();
    }

    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = options.await?.clone_value();
    for conditions in get_condition_maps(&mut options) {
        conditions.insert("import".into(), ConditionValue::Unset);
        conditions.insert("require".into(), ConditionValue::Set);
    }
    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn esm_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: Value<EcmaScriptModulesReferenceSubType>,
    issue_severity: Vc<IssueSeverity>,
    issue_source: Option<Vc<IssueSource>>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = Value::new(ReferenceType::EcmaScriptModules(ty.into_value()));
    let options = apply_esm_specific_options(origin.resolve_options(ty.clone()), ty.clone())
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, issue_severity, issue_source).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    issue_source: Option<Vc<IssueSource>>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    // TODO pass CommonJsReferenceSubType
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()))
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, issue_severity, issue_source).await
}

async fn specific_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: Value<ReferenceType>,
    issue_severity: Vc<IssueSeverity>,
    issue_source: Option<Vc<IssueSource>>,
) -> Result<Vc<ModuleResolveResult>> {
    let result = origin.resolve_asset(request, options, reference_type.clone());

    handle_resolve_error(
        result,
        reference_type,
        origin.origin_path(),
        request,
        options,
        issue_severity,
        issue_source,
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
