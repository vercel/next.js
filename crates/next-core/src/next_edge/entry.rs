use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{context::AssetContext, module::Module, reference_type::ReferenceType};

use crate::util::load_next_js_template;

#[turbo_tasks::function]
pub async fn wrap_edge_entry(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    pathname: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    // The wrapped module could be an async module, we handle that with the proxy
    // here. The comma expression makes sure we don't call the function with the
    // module as the "this" arg.
    // Turn exports into functions that are also a thenable. This way you can await the whole object
    // or  exports (e.g. for Components) or call them directly as though they are async functions
    // (e.g. edge functions/middleware, this is what the Edge Runtime does).
    // Catch promise to prevent UnhandledPromiseRejectionWarning, this will be propagated through
    // the awaited export(s) anyway.
    //
    // The actual wrapper lives in the Next.js templates directory as `edge-wrapper.js`.
    // We use the template expansion helper so this code is kept in sync with other
    // Next.js runtime templates.
    let template_source = load_next_js_template(
        "edge-wrapper.js",
        project_root,
        &[("VAR_ENTRY_NAME", &format!("middleware_{pathname}"))],
        &[],
        &[],
    )
    .await?;

    let inner_assets = fxindexmap! {
        rcstr!("MODULE") => entry
    };

    Ok(asset_context
        .process(
            template_source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module())
}
