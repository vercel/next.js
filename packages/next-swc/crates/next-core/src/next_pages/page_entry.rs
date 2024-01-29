use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use serde::Serialize;
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
            file_source::FileSource,
            module::Module,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
    },
};

use crate::{
    next_config::NextConfig,
    next_edge::entry::wrap_edge_entry,
    pages_structure::{PagesStructure, PagesStructureItem},
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
    pages_structure: Vc<PagesStructure>,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let definition_page = &*next_original_name.await?;
    let definition_pathname = &*pathname.await?;

    let ssr_module = ssr_module_context
        .process(source, reference_type.clone())
        .module();

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

    const INNER_DOCUMENT: &str = "INNER_DOCUMENT";
    const INNER_APP: &str = "INNER_APP";

    let mut replacements = indexmap! {
        "VAR_DEFINITION_PAGE" => definition_page.clone(),
        "VAR_DEFINITION_PATHNAME" => definition_pathname.clone(),
        "VAR_USERLAND" => INNER.to_string(),
    };

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        replacements.insert("VAR_MODULE_DOCUMENT", INNER_DOCUMENT.to_string());
        replacements.insert("VAR_MODULE_APP", INNER_APP.to_string());
    }

    // Load the file from the next.js codebase.
    let mut source = load_next_js_template(
        template_file,
        project_root,
        replacements,
        indexmap! {},
        indexmap! {},
    )
    .await?;

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

    let mut inner_assets = indexmap! {
        INNER.to_string() => ssr_module,
    };

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        inner_assets.insert(
            INNER_DOCUMENT.to_string(),
            process_global_item(
                pages_structure.document(),
                Value::new(reference_type.clone()),
                ssr_module_context,
            ),
        );
        inner_assets.insert(
            INNER_APP.to_string(),
            process_global_item(
                pages_structure.app(),
                Value::new(reference_type.clone()),
                ssr_module_context,
            ),
        );
    }

    let mut ssr_module = ssr_module_context
        .process(
            source,
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    if matches!(runtime, NextRuntime::Edge) {
        if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
            ssr_module = wrap_edge_page(
                ssr_module_context,
                project_root,
                ssr_module,
                definition_page.clone(),
                definition_pathname.clone(),
                Value::new(reference_type),
                pages_structure,
                next_config,
            );
        } else {
            ssr_module = wrap_edge_entry(
                ssr_module_context,
                project_root,
                ssr_module,
                definition_pathname.to_string(),
            );
        }
    }

    let Some(ssr_module) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(ssr_module).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(ssr_module)
}

#[turbo_tasks::function]
async fn process_global_item(
    item: Vc<PagesStructureItem>,
    reference_type: Value<ReferenceType>,
    module_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Module>>> {
    let source = Vc::upcast(FileSource::new(item.project_path()));

    let module = module_context.process(source, reference_type).module();

    Ok(module)
}

#[turbo_tasks::function]
async fn wrap_edge_page(
    context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: Vc<Box<dyn Module>>,
    page: String,
    pathname: String,
    reference_type: Value<ReferenceType>,
    pages_structure: Vc<PagesStructure>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    const INNER_DOCUMENT: &str = "INNER_DOCUMENT";
    const INNER_APP: &str = "INNER_APP";
    const INNER_ERROR: &str = "INNER_ERROR";

    let next_config = &*next_config.await?;

    // TODO(WEB-1824): add build support
    let build_id = "development";
    let dev = true;

    let sri_enabled = !dev
        && next_config
            .experimental
            .sri
            .as_ref()
            .map(|sri| sri.algorithm.as_ref())
            .is_some();

    let source = load_next_js_template(
        "edge-ssr.js",
        project_root,
        indexmap! {
            "VAR_USERLAND" => INNER.to_string(),
            "VAR_PAGE" => pathname.clone(),
            "VAR_BUILD_ID" => build_id.to_string(),
            "VAR_MODULE_DOCUMENT" => INNER_DOCUMENT.to_string(),
            "VAR_MODULE_APP" => INNER_APP.to_string(),
            "VAR_MODULE_GLOBAL_ERROR" => INNER_ERROR.to_string(),
        },
        indexmap! {
            "pagesType" => StringifyJs("pages").to_string(),
            "sriEnabled" => serde_json::Value::Bool(sri_enabled).to_string(),
            "nextConfig" => serde_json::to_string(next_config)?,
            "dev" => serde_json::Value::Bool(dev).to_string(),
            "pageRouteModuleOptions" => serde_json::to_string(&get_route_module_options(page.clone(), pathname.clone()))?,
            "errorRouteModuleOptions" => serde_json::to_string(&get_route_module_options("/_error".to_string(), "/_error".to_string()))?,
            "user500RouteModuleOptions" => serde_json::to_string(&get_route_module_options("/500".to_string(), "/500".to_string()))?,
        },
        indexmap! {
            // TODO
            "incrementalCacheHandler" => None,
            "userland500Page" => None,
        },
    )
    .await?;

    let inner_assets = indexmap! {
        INNER.to_string() => entry,
        INNER_DOCUMENT.to_string() => process_global_item(pages_structure.document(), reference_type.clone(), context),
        INNER_APP.to_string() => process_global_item(pages_structure.app(), reference_type.clone(), context),
        INNER_ERROR.to_string() => process_global_item(pages_structure.error(), reference_type.clone(), context),
    };

    let wrapped = context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    Ok(wrap_edge_entry(
        context,
        project_root,
        wrapped,
        pathname.clone(),
    ))
}

#[derive(Serialize)]
struct PartialRouteModuleOptions {
    definition: RouteDefinition,
}

#[derive(Serialize)]
struct RouteDefinition {
    kind: String,
    bundle_path: String,
    filename: String,
    /// Describes the pathname including all internal modifiers such as
    /// intercepting routes, parallel routes and route/page suffixes that are
    /// not part of the pathname.
    page: String,

    /// The pathname (including dynamic placeholders) for a route to resolve.
    pathname: String,
}

fn get_route_module_options(page: String, pathname: String) -> PartialRouteModuleOptions {
    PartialRouteModuleOptions {
        definition: RouteDefinition {
            kind: "PAGES".to_string(),
            page,
            pathname,
            // The following aren't used in production.
            bundle_path: "".to_string(),
            filename: "".to_string(),
        },
    }
}
