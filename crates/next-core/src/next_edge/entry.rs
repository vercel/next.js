use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{context::AssetContext, module::Module, reference_type::ReferenceType};

use crate::util::load_next_js_template_no_imports;

#[turbo_tasks::function]
pub async fn wrap_edge_entry(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    pathname: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    // The actual wrapper lives in the Next.js templates directory as `edge-wrapper.js`.
    // We use the template expansion helper so this code is kept in sync with other
    // Next.js runtime templates. This particular template does not have any imports
    // of its own, so we use the variant that allows templates without relative
    // imports to be rewritten.
    let template_source = load_next_js_template_no_imports(
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
