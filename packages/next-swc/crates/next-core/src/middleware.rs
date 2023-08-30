use anyhow::Result;
use indexmap::indexmap;
use indoc::writedoc;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{rope::RopeBuilder, File, FileSystemPath};
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent, context::AssetContext, module::Module, reference_type::ReferenceType,
        virtual_source::VirtualSource,
    },
    ecmascript::utils::StringifyJs,
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

#[turbo_tasks::function]
pub async fn wrap_edge_entry(
    context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
    original_name: String,
) -> Result<Vc<Box<dyn Module>>> {
    use std::io::Write;
    let mut source = RopeBuilder::default();
    writedoc!(
        source,
        r#"
            import * as module from "MODULE"

            self._ENTRIES ||= {{}}
            self._ENTRIES[{}] = module
        "#,
        StringifyJs(&format_args!("middleware_{}", original_name))
    )?;
    let file = File::from(source.build());
    // TODO(alexkirsz) Figure out how to name this virtual asset.
    let virtual_source = VirtualSource::new(
        project_root.join("edge-wrapper.js".to_string()),
        AssetContent::file(file.into()),
    );
    let inner_assets = indexmap! {
        "MODULE".to_string() => entry
    };

    Ok(context.process(
        Vc::upcast(virtual_source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    ))
}
