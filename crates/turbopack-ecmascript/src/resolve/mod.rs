pub mod node_native_binding;

use anyhow::Result;
use turbopack_core::{
    context::AssetContextVc,
    resolve::{
        handle_resolve_error,
        options::{ConditionValue, ResolveIntoPackage, ResolveOptions, ResolveOptionsVc},
        parse::RequestVc,
        ResolveResultVc,
    },
};

#[turbo_tasks::function]
pub async fn apply_esm_specific_options(options: ResolveOptionsVc) -> Result<ResolveOptionsVc> {
    let mut options: ResolveOptions = options.await?.clone_value();
    for item in options.into_package.iter_mut() {
        match item {
            ResolveIntoPackage::ExportsField { conditions, .. } => {
                conditions.insert("import".to_string(), ConditionValue::Set);
                conditions.insert("require".to_string(), ConditionValue::Unset);
            }
            ResolveIntoPackage::MainField(_) | ResolveIntoPackage::Default(_) => {}
        }
    }
    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: ResolveOptionsVc) -> Result<ResolveOptionsVc> {
    let mut options: ResolveOptions = options.await?.clone_value();
    for item in options.into_package.iter_mut() {
        match item {
            ResolveIntoPackage::ExportsField { conditions, .. } => {
                conditions.insert("import".to_string(), ConditionValue::Unset);
                conditions.insert("require".to_string(), ConditionValue::Set);
            }
            ResolveIntoPackage::MainField(_) | ResolveIntoPackage::Default(_) => {}
        }
    }
    Ok(options.into())
}

#[turbo_tasks::function]
pub async fn esm_resolve(request: RequestVc, context: AssetContextVc) -> Result<ResolveResultVc> {
    let options = apply_esm_specific_options(context.resolve_options());
    specific_resolve(request, context, options, "esm request").await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(request: RequestVc, context: AssetContextVc) -> Result<ResolveResultVc> {
    let options = apply_cjs_specific_options(context.resolve_options());
    specific_resolve(request, context, options, "commonjs request").await
}

async fn specific_resolve(
    request: RequestVc,
    context: AssetContextVc,
    options: ResolveOptionsVc,
    request_type: &str,
) -> Result<ResolveResultVc> {
    let context_path = context.context_path();
    let result = context.resolve_asset(context_path, request, options);

    handle_resolve_error(result, request_type, context_path, request, options).await
}
