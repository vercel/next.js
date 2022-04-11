use anyhow::Result;
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    module,
    resolve::{
        options::{ConditionValue, ResolveIntoPackage, ResolveOptions, ResolveOptionsVc},
        parse::RequestVc,
        resolve, ResolveResult, ResolveResultVc,
    },
};

use super::typescript::resolve::TypescriptTypesAssetReferenceVc;

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
pub async fn esm_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let options = apply_esm_specific_options(options);
    specific_resolve(request, context, options).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let options = apply_cjs_specific_options(options);
    specific_resolve(request, context, options).await
}

async fn specific_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let result = resolve(context.clone(), request.clone(), options.clone());

    Ok(match result.await {
        Ok(result) => {
            let mut result = result
                .map(
                    |a| module(a.clone()).resolve(),
                    |i| {
                        let i = i.clone();
                        async { Ok(i) }
                    },
                )
                .await?;
            if *options.clone().resolve_typescript_types().await? {
                let types_reference =
                    TypescriptTypesAssetReferenceVc::new(request.clone(), context.clone(), options);
                result.add_reference(types_reference.into());
            }
            match &result {
                ResolveResult::Unresolveable(_) => {
                    // TODO report this to stream
                    println!(
                        "unable to resolve request {} in {}",
                        request.to_string().await?,
                        context.to_string().await?
                    );
                }
                _ => {}
            }
            result.into()
        }
        Err(err) => {
            // TODO report this to stream
            println!(
                "fatal error during resolving request {} in {}: {}",
                request.to_string().await?,
                context.to_string().await?,
                err
            );
            ResolveResult::unresolveable().into()
        }
    })
}
