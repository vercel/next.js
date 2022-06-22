pub mod node_native_binding;

use anyhow::Result;
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    context::AssetContextVc,
    resolve::{
        options::{ConditionValue, ResolveIntoPackage, ResolveOptions, ResolveOptionsVc},
        parse::RequestVc,
        ResolveResult, ResolveResultVc,
    },
};

use crate::ProcessingGoalVc;

#[turbo_tasks::function]
pub async fn apply_esm_specific_options(options: ResolveOptionsVc) -> Result<ResolveOptionsVc> {
    let mut options: ResolveOptions = options.await?.clone();
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
    let mut options: ResolveOptions = options.await?.clone();
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
pub async fn cjs_resolve(
    request: RequestVc,
    context: AssetContextVc,
    processing_goal: ProcessingGoalVc,
) -> Result<ResolveResultVc> {
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

    handle_resolve_error(result, request_type, context_path, request).await
}

pub async fn handle_resolve_error(
    result: ResolveResultVc,
    request_type: &str,
    context_path: FileSystemPathVc,
    request: RequestVc,
) -> Result<ResolveResultVc> {
    Ok(match result.is_unresolveable().await {
        Ok(unresolveable) => {
            if *unresolveable {
                // TODO report this to stream
                println!(
                    "unable to resolve {request_type} {} in {}",
                    request.to_string().await?,
                    context_path.to_string().await?
                );
            }
            result
        }
        Err(err) => {
            // TODO report this to stream
            println!(
                "fatal error during resolving request {} in {}: {}",
                request.to_string().await?,
                context_path.to_string().await?,
                err
            );
            ResolveResult::unresolveable().into()
        }
    })
}
