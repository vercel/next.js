use std::io::Write;

use anyhow::{bail, Result};
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, FxIndexMap, ResolvedVc, Value, Vc};
use turbo_tasks_fs::{rope::RopeBuilder, File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::{
    next_config::NextConfig,
    next_edge::entry::wrap_edge_entry,
    pages_structure::{PagesStructure, PagesStructureItem},
    util::{file_content_rope, load_next_js_template, NextRuntime},
};

#[turbo_tasks::function]
pub async fn create_page_ssr_entry_module(
    pathname: Vc<RcStr>,
    reference_type: Value<ReferenceType>,
    project_root: Vc<FileSystemPath>,
    ssr_module_context: Vc<Box<dyn AssetContext>>,
    source: Vc<Box<dyn Source>>,
    next_original_name: Vc<RcStr>,
    pages_structure: Vc<PagesStructure>,
    runtime: NextRuntime,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    let definition_page = &*next_original_name.await?;
    let definition_pathname = &*pathname.await?;

    let ssr_module = ssr_module_context
        .process(source, reference_type.clone())
        .module()
        .to_resolved()
        .await?;

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

    let mut replacements = fxindexmap! {
        "VAR_DEFINITION_PAGE" => definition_page.clone(),
        "VAR_DEFINITION_PATHNAME" => definition_pathname.clone(),
        "VAR_USERLAND" => INNER.into(),
    };

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        replacements.insert("VAR_MODULE_DOCUMENT", INNER_DOCUMENT.into());
        replacements.insert("VAR_MODULE_APP", INNER_APP.into());
    }

    // Load the file from the next.js codebase.
    let mut source = load_next_js_template(
        template_file,
        project_root,
        replacements,
        FxIndexMap::default(),
        FxIndexMap::default(),
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

    let mut inner_assets = fxindexmap! {
        INNER.into() => ssr_module,
    };

    if reference_type == ReferenceType::Entry(EntryReferenceSubType::Page) {
        inner_assets.insert(
            INNER_DOCUMENT.into(),
            process_global_item(
                pages_structure.document(),
                Value::new(reference_type.clone()),
                ssr_module_context,
            )
            .to_resolved()
            .await?,
        );
        inner_assets.insert(
            INNER_APP.into(),
            process_global_item(
                pages_structure.app(),
                Value::new(reference_type.clone()),
                ssr_module_context,
            )
            .to_resolved()
            .await?,
        );
    }

    let mut ssr_module = ssr_module_context
        .process(
            source,
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
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
                definition_pathname.clone(),
            );
        }
    }

    Ok(ssr_module)
}

#[turbo_tasks::function]
fn process_global_item(
    item: Vc<PagesStructureItem>,
    reference_type: Value<ReferenceType>,
    module_context: Vc<Box<dyn AssetContext>>,
) -> Vc<Box<dyn Module>> {
    let source = Vc::upcast(FileSource::new(item.project_path()));
    module_context.process(source, reference_type).module()
}

#[turbo_tasks::function]
async fn wrap_edge_page(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_root: Vc<FileSystemPath>,
    entry: ResolvedVc<Box<dyn Module>>,
    page: RcStr,
    pathname: RcStr,
    reference_type: Value<ReferenceType>,
    pages_structure: Vc<PagesStructure>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn Module>>> {
    const INNER: &str = "INNER_PAGE_ENTRY";

    const INNER_DOCUMENT: &str = "INNER_DOCUMENT";
    const INNER_APP: &str = "INNER_APP";
    const INNER_ERROR: &str = "INNER_ERROR";

    let next_config_val = &*next_config.await?;

    // TODO(WEB-1824): add build support
    let dev = true;

    let sri_enabled = !dev
        && next_config
            .experimental_sri()
            .await?
            .as_ref()
            .map(|sri| sri.algorithm.as_ref())
            .is_some();

    let source = load_next_js_template(
        "edge-ssr.js",
        project_root,
        fxindexmap! {
            "VAR_USERLAND" => INNER.into(),
            "VAR_PAGE" => pathname.clone(),
            "VAR_MODULE_DOCUMENT" => INNER_DOCUMENT.into(),
            "VAR_MODULE_APP" => INNER_APP.into(),
            "VAR_MODULE_GLOBAL_ERROR" => INNER_ERROR.into(),
        },
        fxindexmap! {
            "pagesType" => StringifyJs("pages").to_string().into(),
            "sriEnabled" => serde_json::Value::Bool(sri_enabled).to_string().into(),
            // TODO do we really need to pass the entire next config here?
            // This is bad for invalidation as any config change will invalidate this
            "nextConfig" => serde_json::to_string(next_config_val)?.into(),
            "dev" => serde_json::Value::Bool(dev).to_string().into(),
            "pageRouteModuleOptions" => serde_json::to_string(&get_route_module_options(page.clone(), pathname.clone()))?.into(),
            "errorRouteModuleOptions" => serde_json::to_string(&get_route_module_options("/_error".into(), "/_error".into()))?.into(),
            "user500RouteModuleOptions" => serde_json::to_string(&get_route_module_options("/500".into(), "/500".into()))?.into(),
        },
        fxindexmap! {
            // TODO
            "incrementalCacheHandler" => None,
            "userland500Page" => None,
        },
    )
    .await?;

    let inner_assets = fxindexmap! {
        INNER.into() => entry,
        INNER_DOCUMENT.into() => process_global_item(
            pages_structure.document(),
            reference_type.clone(),
            asset_context,
        ).to_resolved().await?,
        INNER_APP.into() => process_global_item(
            pages_structure.app(),
            reference_type.clone(),
            asset_context,
        ).to_resolved().await?,
        INNER_ERROR.into() => process_global_item(
            pages_structure.error(),
            reference_type.clone(),
            asset_context,
        ).to_resolved().await?,
    };

    let wrapped = asset_context
        .process(
            Vc::upcast(source),
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module();

    Ok(wrap_edge_entry(
        asset_context,
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
            kind: "PAGES".into(),
            page,
            pathname,
            // The following aren't used in production.
            bundle_path: "".into(),
            filename: "".into(),
        },
    }
}
