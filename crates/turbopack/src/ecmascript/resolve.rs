use anyhow::Result;
use turbo_tasks_fs::FileSystemPathRef;

use crate::{
    module,
    resolve::{
        options::ResolveOptionsRef, parse::RequestRef, resolve, resolve_options, ResolveResult,
        ResolveResultRef,
    },
};

#[turbo_tasks::function]
pub async fn apply_esm_specific_options(options: ResolveOptionsRef) -> ResolveOptionsRef {
    // TODO magic
    options
}

#[turbo_tasks::function]
pub async fn apply_cjs_specific_options(options: ResolveOptionsRef) -> ResolveOptionsRef {
    // TODO magic
    options
}

#[turbo_tasks::function]
pub async fn esm_resolve(
    request: RequestRef,
    context: FileSystemPathRef,
) -> Result<ResolveResultRef> {
    specific_resolve(request, context, apply_esm_specific_options).await
}

#[turbo_tasks::function]
pub async fn cjs_resolve(
    request: RequestRef,
    context: FileSystemPathRef,
) -> Result<ResolveResultRef> {
    specific_resolve(request, context, apply_cjs_specific_options).await
}

async fn specific_resolve(
    request: RequestRef,
    context: FileSystemPathRef,
    apply_specific_options: fn(ResolveOptionsRef) -> ResolveOptionsRef,
) -> Result<ResolveResultRef> {
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
                        request.get().await?,
                        context.get().await?
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
                request.get().await?,
                context.get().await?,
                err
            );
            ResolveResult::Unresolveable(None).into()
        }
    })
}
