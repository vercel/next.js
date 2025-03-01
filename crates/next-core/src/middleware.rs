use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, FxIndexMap, ResolvedVc, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{context::AssetContext, module::Module, reference_type::ReferenceType};

use crate::util::load_next_js_template;

#[turbo_tasks::function]
pub async fn middleware_files(page_extensions: Vc<Vec<RcStr>>) -> Result<Vc<Vec<RcStr>>> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware."]
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
    project_root: Vc<FileSystemPath>,
    userland_module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_MIDDLEWARE_MODULE";

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "middleware.js",
        project_root,
        fxindexmap! {
            "VAR_USERLAND" => INNER.into(),
            "VAR_DEFINITION_PAGE" => "/middleware".into(),
        },
        FxIndexMap::default(),
        FxIndexMap::default(),
    )
    .await?;

    let inner_assets = fxindexmap! {
        INNER.into() => userland_module
    };

    let module = asset_context
        .process(
            source,
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module();

    Ok(module)
}
