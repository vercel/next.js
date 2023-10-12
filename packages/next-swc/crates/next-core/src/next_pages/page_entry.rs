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
            asset::{Asset, AssetContent},
            context::AssetContext,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::chunk::EcmascriptChunkPlaceable,
    },
};

use crate::{
    next_edge::entry::wrap_edge_entry,
    util::{file_content_rope, load_next_js_template, NextRuntime},
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
    let definition_page = &*next_original_name.await?;
    let definition_pathname = &*pathname.await?;

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

    const INNER: &str = "INNER_PAGE";

    let mut replacements = indexmap! {
        "VAR_DEFINITION_PAGE" => definition_page.clone(),
        "VAR_DEFINITION_PATHNAME" => definition_pathname.clone(),
        "VAR_USERLAND" => INNER.to_string(),
    };

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        replacements.insert(
            "VAR_MODULE_DOCUMENT",
            "@vercel/turbopack-next/pages/_document".to_string(),
        );
        replacements.insert(
            "VAR_MODULE_APP",
            "@vercel/turbopack-next/pages/_app".to_string(),
        );
    }

    // Load the file from the next.js codebase.
    let mut source =
        load_next_js_template(template_file, project_root, replacements, indexmap! {}).await?;

    // When we're building the instrumentation page (only when the
    // instrumentation file conflicts with a page also labeled
    // /instrumentation) hoist the `register` method.
    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page)
        && (*definition_page == "/instrumentation" || *definition_page == "/src/instrumentation")
    {
        let file = &*file_content_rope(source.content().file_content()).await?;

        let mut result = RopeBuilder::default();
        result += file;

        writeln!(
            result,
            r#"export const register = hoist(userland, "register")"#
        )?;

        let file = File::from(result.build());

        source = Vc::upcast(VirtualSource::new(
            source.ident().path(),
            AssetContent::file(file.into()),
        ));
    }

    let mut ssr_module = ssr_module_context.process(
        source,
        Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
            INNER.to_string() => ssr_module,
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
