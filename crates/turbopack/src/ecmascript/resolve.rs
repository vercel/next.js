use anyhow::Result;
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    module,
    resolve::{
        options::{ConditionValue, ResolveIntoPackage, ResolveOptions, ResolveOptionsVc},
        parse::RequestVc,
        resolve, resolve_options, ResolveResult, ResolveResultVc,
    },
};

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
) -> Result<ResolveResultVc> {
    specific_resolve(request, context, apply_esm_specific_options).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
) -> Result<ResolveResultVc> {
    specific_resolve(request, context, apply_cjs_specific_options).await
}

async fn specific_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
    apply_specific_options: fn(ResolveOptionsVc) -> ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let options = resolve_options(context.clone());

    let options = apply_specific_options(options);

    let result = resolve(context.clone(), request.clone(), options);

    Ok(match result.await {
        Ok(result) => {
            let result = result
                .map(
                    |a| module(a.clone()).resolve(),
                    |i| {
                        let i = i.clone();
                        async { Ok(i) }
                    },
                )
                .await?;
            match &result {
                ResolveResult::Unresolveable(_) => {
                    // TODO report this to stream
                    println!(
                        "unable to resolve esm request {} in {}",
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
                "fatal error during resolving esm request {} in {}: {}",
                request.to_string().await?,
                context.to_string().await?,
                err
            );
            ResolveResult::Unresolveable(None).into()
        }
    })
}
