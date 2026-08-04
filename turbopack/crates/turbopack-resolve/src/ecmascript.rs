use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TraitRef, Vc};
use turbopack_core::{
    context::AssetContext,
    issue::IssueSource,
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ModuleResolveResult, ResolveErrorMode, ResolveResult,
        error::{handle_resolve_error, handle_resolve_source_error},
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        origin::ResolveOrigin,
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
    reference_type: &ReferenceType,
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
    let mut options: ResolveOptions = turbo_tasks::read!(options.owned())?;
    // TODO set fully_specified when in strict ESM mode
    // options.fully_specified = true;
    for conditions in get_condition_maps(&mut options) {
        conditions.insert(rcstr!("import"), ConditionValue::Set);
        conditions.insert(rcstr!("require"), ConditionValue::Unset);
        // Don't set "module-sync" to ConditionValue::Set here. When tracing, the Node.js runtime
        // version might not support it yet, so we still want the "import"/"require"/"default"
        // result anyway.
    }

    if clear_extensions {
        options.extensions.clear();
    }

    options.parse_data_uris = true;

    Ok(options.cell())
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut options: ResolveOptions = turbo_tasks::read!(options.owned())?;
    for conditions in get_condition_maps(&mut options) {
        conditions.insert(rcstr!("import"), ConditionValue::Unset);
        conditions.insert(rcstr!("require"), ConditionValue::Set);
        // Don't set "module-sync" to ConditionValue::Set here. When tracing, the Node.js runtime
        // version might not support it yet, so we still want the "import"/"require"/"default"
        // result anyway.
    }
    Ok(options.cell())
}

turbo_tasks::dual_fn! {
pub fn esm_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: EcmaScriptModulesReferenceSubType,
    error_mode: ResolveErrorMode,
    issue_source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = ReferenceType::EcmaScriptModules(ty);
    let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
    let options = *turbo_tasks::read!(apply_esm_specific_options(origin_ref.resolve_options(), &ty)
        .to_resolved())
        ?;
    turbo_tasks::read!(specific_resolve(origin_ref, request, options, ty, error_mode, issue_source))
}
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: CommonJsReferenceSubType,
    issue_source: Option<IssueSource>,
    error_mode: ResolveErrorMode,
) -> Result<Vc<ModuleResolveResult>> {
    let ty = ReferenceType::CommonJs(ty);
    let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
    let options = *turbo_tasks::read!(
        apply_cjs_specific_options(origin_ref.resolve_options()).to_resolved()
    )?;
    turbo_tasks::read!(specific_resolve(
        origin_ref,
        request,
        options,
        ty,
        error_mode,
        issue_source
    ))
}

#[turbo_tasks::function]
pub async fn cjs_resolve_source(
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    ty: CommonJsReferenceSubType,
    issue_source: Option<IssueSource>,
    error_mode: ResolveErrorMode,
) -> Result<Vc<ResolveResult>> {
    let ty = ReferenceType::CommonJs(ty);
    let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
    let options = *turbo_tasks::read!(
        apply_cjs_specific_options(origin_ref.resolve_options()).to_resolved()
    )?;
    let origin_path = origin_ref.origin_path();
    let result = resolve(origin_path.parent(), ty.clone(), *request, options);

    turbo_tasks::read!(handle_resolve_source_error(
        result,
        ty,
        origin_path,
        *request,
        options,
        error_mode,
        issue_source,
    ))
}

turbo_tasks::dual_fn! {
fn specific_resolve(
    origin: TraitRef<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: ReferenceType,
    error_mode: ResolveErrorMode,
    issue_source: Option<IssueSource>,
) -> Result<Vc<ModuleResolveResult>> {
    let result = origin.asset_context().resolve_asset(
        origin.origin_path(),
        request,
        options,
        reference_type.clone(),
    );

    turbo_tasks::read!(handle_resolve_error(
        result,
        reference_type,
        origin.origin_path(),
        request,
        options,
        error_mode,
        issue_source,
    ))
}
}
