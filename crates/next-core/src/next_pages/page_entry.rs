use std::io::Write;

use anyhow::{Result, bail};
use serde::Serialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileSystemPath, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};

use crate::{
    next_config::NextConfig,
    next_edge::entry::wrap_edge_entry,
    pages_structure::{PagesStructure, PagesStructureItem},
    util::{NextRuntime, file_content_rope, load_next_js_template, pages_function_name},
};

#[turbo_tasks::value]
pub struct PageSsrEntryModule {
    pub ssr_module: ResolvedVc<Box<dyn Module>>,
    pub app_module: Option<ResolvedVc<Box<dyn Module>>>,
    pub document_module: Option<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::function]
pub async fn create_page_ssr_entry_module(
    pathname: RcStr,
    reference_type: ReferenceType,
    project_root: FileSystemPath,
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    next_original_name: RcStr,
    pages_structure: Vc<PagesStructure>,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<Vc<PageSsrEntryModule>> {
    let definition_page = next_original_name;
    let definition_pathname = pathname;

    let ssr_module = ssr_module_context
        .process(source, reference_type.clone())
        .module()
        .to_resolved()
        .await?;

    let template_file = match (&reference_type, runtime) {
        (ReferenceType::Entry(EntryReferenceSubType::Page), _)
        | (ReferenceType::Entry(EntryReferenceSubType::PageData), _) => {
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

    let inner = rcstr!("INNER_PAGE");

    let inner_document = rcstr!("INNER_DOCUMENT");
    let inner_app = rcstr!("INNER_APP");

    let mut replacements = vec![
        ("VAR_DEFINITION_PAGE", &*definition_page),
        ("VAR_DEFINITION_PATHNAME", &definition_pathname),
        ("VAR_USERLAND", &inner),
    ];

    let is_page = matches!(
        reference_type,
        ReferenceType::Entry(EntryReferenceSubType::Page)
            | ReferenceType::Entry(EntryReferenceSubType::PageData)
    );
    if is_page {
        replacements.push(("VAR_MODULE_DOCUMENT", &inner_document));
        replacements.push(("VAR_MODULE_APP", &inner_app));
    }
    let source_ident = source.ident().await?;
    // for PagesData we apply a ?server-data query parameter to avoid conflicts with the Page
    // module.
    // We need to copy that to all the modules we create.
    let source_query = source_ident.query.clone();

    // Load the file from the next.js codebase.
    let mut source =
        load_next_js_template(template_file, project_root.clone(), &replacements, &[], &[]).await?;

    // When we're building the instrumentation page (only when the
    // instrumentation file conflicts with a page also labeled
    // /instrumentation) hoist the `register` method.
    if is_page
        && (definition_page == "/instrumentation" || definition_page == "/src/instrumentation")
    {
        let file = &*file_content_rope(source.content().file_content()).await?;

        let mut result = RopeBuilder::default();
        result += file;

        writeln!(
            result,
            r#"export const register = hoist(userland, "register")"#
        )?;

        let file = File::from(result.build());

        source = Vc::upcast(VirtualSource::new_with_ident(
            source.ident(),
            AssetContent::file(file.into()),
        ));
    }

    let mut inner_assets = fxindexmap! {
        inner => ssr_module,
    };

    let pages_structure_ref = pages_structure.await?;

    let (app_module, document_module) = if is_page {
        // We process the document and app modules in the same context and reference type.
        let document_module = process_global_item(
            *pages_structure_ref.document,
            reference_type.clone(),
            source_query.clone(),
            ssr_module_context,
        )
        .to_resolved()
        .await?;
        let app_module = process_global_item(
            *pages_structure_ref.app,
            reference_type.clone(),
            source_query.clone(),
            ssr_module_context,
        )
        .to_resolved()
        .await?;
        inner_assets.insert(inner_document, document_module);
        inner_assets.insert(inner_app, app_module);
        (Some(app_module), Some(document_module))
    } else {
        (None, None)
    };

    let mut ssr_module = ssr_module_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    if matches!(runtime, NextRuntime::Edge) {
        if is_page {
            ssr_module = wrap_edge_page(
                ssr_module_context,
                project_root,
                ssr_module,
                definition_page.clone(),
                definition_pathname.clone(),
                reference_type,
                pages_structure,
                next_config,
                source_query.clone(),
            );
        } else {
            ssr_module = wrap_edge_entry(
                ssr_module_context,
                project_root,
                ssr_module,
                pages_function_name(&definition_page).into(),
            );
        }
    }

    Ok(PageSsrEntryModule {
        ssr_module: ssr_module.to_resolved().await?,
        app_module,
        document_module,
    }
    .cell())
}

#[turbo_tasks::function]
async fn process_global_item(
    item: Vc<PagesStructureItem>,
    reference_type: ReferenceType,
    source_query: RcStr,
    module_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Module>>> {
    let source = Vc::upcast(FileSource::new_with_query(
        item.file_path().owned().await?,
        source_query,
    ));
    Ok(module_context.process(source, reference_type).module())
}

#[turbo_tasks::function]
async fn wrap_edge_page(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: FileSystemPath,
    entry: ResolvedVc<Box<dyn Module>>,
    page: RcStr,
    pathname: RcStr,
    reference_type: ReferenceType,
    pages_structure: Vc<PagesStructure>,
    next_config: Vc<NextConfig>,
    source_query: RcStr,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    const INNER_DOCUMENT: &str = "INNER_DOCUMENT";
    const INNER_APP: &str = "INNER_APP";
    const INNER_ERROR: &str = "INNER_ERROR";
    const INNER_ERROR_500: &str = "INNER_500";

    let next_config_val = &*next_config.await?;

    let source = load_next_js_template(
        "edge-ssr.js",
        project_root.clone(),
        &[
            ("VAR_USERLAND", INNER),
            ("VAR_PAGE", &pathname),
            ("VAR_MODULE_DOCUMENT", INNER_DOCUMENT),
            ("VAR_MODULE_APP", INNER_APP),
            ("VAR_MODULE_GLOBAL_ERROR", INNER_ERROR),
        ],
        &[
            // TODO do we really need to pass the entire next config here?
            // This is bad for invalidation as any config change will invalidate this
            ("nextConfig", &*serde_json::to_string(next_config_val)?),
            (
                "pageRouteModuleOptions",
                &serde_json::to_string(&get_route_module_options(page.clone(), pathname.clone()))?,
            ),
            (
                "errorRouteModuleOptions",
                &serde_json::to_string(&get_route_module_options(
                    rcstr!("/_error"),
                    rcstr!("/_error"),
                ))?,
            ),
            (
                "user500RouteModuleOptions",
                &serde_json::to_string(&get_route_module_options(rcstr!("/500"), rcstr!("/500")))?,
            ),
        ],
        &[
            // TODO
            ("incrementalCacheHandler", None),
            (
                "userland500Page",
                pages_structure.await?.error_500.map(|_| INNER_ERROR_500),
            ),
        ],
    )
    .await?;

    let pages_structure_ref = pages_structure.await?;

    let mut inner_assets = fxindexmap! {
        INNER.into() => entry,
        INNER_DOCUMENT.into() => process_global_item(
            *pages_structure_ref.document,
            reference_type.clone(),
            source_query.clone(),
            asset_context,
        ).to_resolved().await?,
        INNER_APP.into() => process_global_item(
            *pages_structure_ref.app,
            reference_type.clone(),
            source_query.clone(),
            asset_context,
        ).to_resolved().await?,
        INNER_ERROR.into() => process_global_item(
            *pages_structure_ref.error,
            reference_type.clone(),
            source_query.clone(),
            asset_context,
        ).to_resolved().await?,
    };

    if let Some(error_500) = pages_structure_ref.error_500 {
        inner_assets.insert(
            INNER_ERROR_500.into(),
            process_global_item(
                *error_500,
                reference_type.clone(),
                source_query.clone(),
                asset_context,
            )
            .to_resolved()
            .await?,
        );
    }

    let wrapped = asset_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets)),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
        project_root,
        wrapped,
        pages_function_name(&page).into(),
    ))
}

#[derive(Serialize)]
struct PartialRouteModuleOptions {
    definition: RouteDefinition,
}

#[derive(Serialize)]
struct RouteDefinition {
    kind: RcStr,
    bundle_path: RcStr,
    filename: RcStr,
    /// Describes the pathname including all internal modifiers such as
    /// intercepting routes, parallel routes and route/page suffixes that are
    /// not part of the pathname.
    page: RcStr,

    /// The pathname (including dynamic placeholders) for a route to resolve.
    pathname: RcStr,
}

fn get_route_module_options(page: RcStr, pathname: RcStr) -> PartialRouteModuleOptions {
    PartialRouteModuleOptions {
        definition: RouteDefinition {
            kind: rcstr!("PAGES"),
            page,
            pathname,
            // The following aren't used in production.
            bundle_path: rcstr!(""),
            filename: rcstr!(""),
        },
    }
}
