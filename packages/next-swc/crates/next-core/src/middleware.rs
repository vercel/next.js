use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::core::{
    context::AssetContext, module::Module, reference_type::ReferenceType,
};

use crate::util::load_next_js_template;

#[turbo_tasks::function]
pub async fn middleware_files(page_extensions: Vc<Vec<String>>) -> Result<Vc<Vec<String>>> {
    let extensions = page_extensions.await?;
    let files = ["middleware.", "src/middleware."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
        })
        .collect();
    Ok(Vc::cell(files))
}

#[turbo_tasks::function]
pub async fn get_middleware_module(
    context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    userland_module: Vc<Box<dyn Module>>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_MIDDLEWARE_MODULE";

    // Load the file from the next.js codebase.
    let source = load_next_js_template(
        "middleware.js",
        project_root,
        indexmap! {
            "VAR_USERLAND" => INNER.to_string(),
            "VAR_DEFINITION_PAGE" => "/middleware".to_string(),
        },
        indexmap! {},
        indexmap! {},
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.to_string() => userland_module
    };

    let module = context
        .process(
            source,
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    Ok(module)
}
