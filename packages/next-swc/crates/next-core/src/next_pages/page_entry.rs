use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use indoc::writedoc;
use turbo_tasks::Vc;
use turbo_tasks_fs::{rope::Rope, FileSystemPath};
use turbopack_binding::{
    turbo::{
        tasks::Value,
        tasks_fs::{rope::RopeBuilder, File},
    },
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            module::Module,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
    },
};

use crate::util::{load_next_js_template, virtual_next_js_template_path, NextRuntime};

#[turbo_tasks::function]
pub async fn create_page_ssr_entry_module(
    pathname: Vc<String>,
    reference_type: Value<ReferenceType>,
    project_root: Vc<FileSystemPath>,
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    next_original_name: Vc<String>,
    runtime: NextRuntime,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let definition_page = next_original_name.await?;
    let definition_pathname = pathname.await?;

    let ssr_module = ssr_module_context.process(source, reference_type.clone());

    let reference_type = reference_type.into_value();

    let template_file = match (&reference_type, runtime) {
        (ReferenceType::Entry(EntryReferenceSubType::Page), _) => {
            // Load the Page entry file.
            "build/templates/pages.js"
        }
        (ReferenceType::Entry(EntryReferenceSubType::PagesApi), NextRuntime::NodeJs) => {
            // Load the Pages API entry file.
            "build/templates/pages-api.js"
        }
        (ReferenceType::Entry(EntryReferenceSubType::PagesApi), NextRuntime::Edge) => {
            // Load the Pages API entry file.
            "build/templates/pages-edge-api.js"
        }
        _ => bail!("Invalid path type"),
    };

    // Load the file from the next.js codebase.
    let file = load_next_js_template(project_root, template_file.to_string()).await?;

    let mut file = file
        .to_str()?
        .replace(
            "\"VAR_DEFINITION_PAGE\"",
            &StringifyJs(&definition_page).to_string(),
        )
        .replace(
            "\"VAR_DEFINITION_PATHNAME\"",
            &StringifyJs(&definition_pathname).to_string(),
        );

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        file = file
            .replace(
                "\"VAR_MODULE_DOCUMENT\"",
                &StringifyJs("@vercel/turbopack-next/pages/_document").to_string(),
            )
            .replace(
                "\"VAR_MODULE_APP\"",
                &StringifyJs("@vercel/turbopack-next/pages/_app").to_string(),
            );
    }

    // Ensure that the last line is a newline.
    if !file.ends_with('\n') {
        file.push('\n');
    }

    let file = Rope::from(file);
    let mut result = RopeBuilder::default();
    result += &file;

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        // When we're building the instrumentation page (only when the
        // instrumentation file conflicts with a page also labeled
        // /instrumentation) hoist the `register` method.
        if definition_page.to_string() == "/instrumentation"
            || definition_page.to_string() == "/src/instrumentation"
        {
            writeln!(
                result,
                r#"export const register = hoist(userland, "register")"#
            )?;
        }
    }

    let file = File::from(result.build());

    let template_path = virtual_next_js_template_path(project_root, template_file.to_string());

    let source = VirtualSource::new(template_path, AssetContent::file(file.into()));

    let mut ssr_module = ssr_module_context.process(
        Vc::upcast(source),
        Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
            "VAR_USERLAND".to_string() => ssr_module,
        }))),
    );

    if matches!(runtime, NextRuntime::Edge) {
        ssr_module = wrap_edge_entry(
            ssr_module_context,
            project_root,
            ssr_module,
            definition_pathname.to_string(),
        );
    }

    let Some(ssr_module) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(ssr_module).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(ssr_module)
}

#[turbo_tasks::function]
pub async fn wrap_edge_entry(
    context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
    pathname: String,
) -> Result<Vc<Box<dyn Module>>> {
    let mut source = RopeBuilder::default();
    writedoc!(
        source,
        r#"
            import * as module from "MODULE"

            self._ENTRIES ||= {{}}
            self._ENTRIES[{}] = module
        "#,
        StringifyJs(&format_args!("middleware_{}", pathname))
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
