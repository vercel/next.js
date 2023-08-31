use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_binding::turbopack::core::{
    asset::AssetContent, context::AssetContext, module::Module, reference_type::ReferenceType,
    virtual_source::VirtualSource,
};

use crate::util::{load_next_js_template, virtual_next_js_template_path};

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
    let template_file = "build/templates/middleware.js";

    // Load the file from the next.js codebase.
    let file = load_next_js_template(project_root, template_file.to_string()).await?;

    let file = File::from(file.clone_value());

    let template_path = virtual_next_js_template_path(project_root, template_file.to_string());

    let virtual_source = VirtualSource::new(template_path, AssetContent::file(file.into()));

    let inner_assets = indexmap! {
        "VAR_USERLAND".to_string() => userland_module
    };

    let module = context.process(
        Vc::upcast(virtual_source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    );

    Ok(module)
}
