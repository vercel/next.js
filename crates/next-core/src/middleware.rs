use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{context::AssetContext, module::Module, reference_type::ReferenceType};

use crate::util::load_next_js_template;

#[turbo_tasks::function]
pub async fn middleware_files(page_extensions: Vc<Vec<RcStr>>) -> Result<Vc<Vec<RcStr>>> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware.", "proxy.", "src/proxy."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
                .map(RcStr::from)
        })
        .collect();
    Ok(Vc::cell(files))
}

#[turbo_tasks::function]
pub async fn get_middleware_module(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    userland_module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_MIDDLEWARE_MODULE";

    // Determine if this is a proxy file by checking the module path
    let userland_path = userland_module.ident().path().await?;
    let is_proxy = userland_path.file_stem() == Some("proxy");
    let page_path = if is_proxy { "/proxy" } else { "/middleware" };

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "middleware.js",
        project_root,
        &[("VAR_USERLAND", INNER), ("VAR_DEFINITION_PAGE", page_path)],
        &[],
        &[],
    )
    .await?;

    let inner_assets = fxindexmap! {
        rcstr!(INNER) => userland_module
    };

    let module = asset_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    Ok(module)
}
