use anyhow::Result;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack_core::{
    issue::IssueSource,
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        handle_resolve_error, handle_resolve_source_error,
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve, ModuleResolveResult, ResolveResult,
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
    is_optional: bool,
    issue_source: Option<ResolvedVc<IssueSource>>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = Value::new(ReferenceType::EcmaScriptModules(ty.into_value()));
    let options = apply_esm_specific_options(origin.resolve_options(ty.clone()), ty.clone())
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, is_optional, issue_source).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    issue_source: Option<ResolvedVc<IssueSource>>,
    is_optional: bool,
) -> Result<Vc<ModuleResolveResult>> {
    // TODO pass CommonJsReferenceSubType
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()))
        .resolve()
        .await?;
    specific_resolve(origin, request, options, ty, is_optional, issue_source).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve_source(
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: Option<ResolvedVc<IssueSource>>,
    is_optional: bool,
) -> Result<Vc<ResolveResult>> {
    // TODO pass CommonJsReferenceSubType
    let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
    let options = apply_cjs_specific_options(origin.resolve_options(ty.clone()))
        .resolve()
        .await?;
    let result = resolve(
        origin.origin_path().parent().resolve().await?,
        ty.clone(),
        *request,
        options,
    );

    handle_resolve_source_error(
        result,
        ty,
        origin.origin_path(),
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
    reference_type: Value<ReferenceType>,
    is_optional: bool,
    issue_source: Option<ResolvedVc<IssueSource>>,
) -> Result<Vc<ModuleResolveResult>> {
    let result = origin.resolve_asset(request, options, reference_type.clone());

    handle_resolve_error(
        result,
        reference_type,
        origin.origin_path(),
        request,
        options,
        is_optional,
        issue_source,
    )
    .await
}
