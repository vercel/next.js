use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::{
    turbo::{
        tasks::Value,
        tasks_fs::{rope::RopeBuilder, File},
    },
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
    },
};

use crate::{
    next_edge::entry::wrap_edge_entry,
    util::{load_next_js_template, virtual_next_js_template_path, NextRuntime},
};

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
            "pages.js"
        }
        (ReferenceType::Entry(EntryReferenceSubType::PagesApi), NextRuntime::NodeJs) => {
            // Load the Pages API entry file.
            "pages-api.js"
        }
        (ReferenceType::Entry(EntryReferenceSubType::PagesApi), NextRuntime::Edge) => {
            // Load the Pages API entry file.
            "pages-edge-api.js"
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

    let mut result = RopeBuilder::default();
    result.push_bytes(file.as_bytes());

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
