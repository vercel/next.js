use anyhow::{Context, Result};
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::{
    context::AssetContext,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
};

use crate::{
    app_structure::{AppDirModules, AppPageLoaderTree, GlobalMetadata, Metadata, MetadataItem},
    mode::NextMode,
    next_app::{AppPage, AppPath, app_entry::AppEntry},
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_config::NextConfig,
    next_import_map::get_next_package,
    next_server_component::NextServerComponentTransition,
    parse_segment_config_from_loader_tree, parse_segment_config_from_source,
    segment_config::ParseSegmentMode,
    util::{NextRuntime, load_next_js_template_no_imports},
};

/// Computes the entry for a page on the native RSC runtime (`experimental_nativeRscRuntime =
/// true`). Unlike [`get_app_page_entry`](super::get_app_page_entry), the entry imports nothing
/// from App Router: only the renderer's precompiled bundles, the root layout, and the page.
///
/// Only a page directly inside the root layout is supported so far. Any other file structure or
/// segment export the route uses is a build error, never a fallback to App Router.
#[turbo_tasks::function]
pub async fn get_app_page_native_rsc_runtime_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
    project_root: FileSystemPath,
    next_config: Vc<NextConfig>,
    next_mode: Vc<NextMode>,
) -> Result<Vc<AppEntry>> {
    let config = parse_segment_config_from_loader_tree(loader_tree);
    let tree = loader_tree.await?;

    // The route's segments, from the root to the page, following `children`.
    let mut segments = vec![&*tree];
    while let Some(child) = segments.last().unwrap().parallel_routes.get("children") {
        segments.push(child);
    }
    let root = segments.first().unwrap();
    // A route whose page is only in a parallel route slot has none at the end of `children`; it's
    // reported below as a parallel route.
    let page_path = find_page(&tree)
        .or_else(|| tree.modules.layout.clone())
        .context("the loader tree of an app page must have a page or a root layout")?;
    // The root layout is the first one from the root. It's in the root segment unless it's inside
    // a route group.
    let root_layout_path = segments
        .iter()
        .find_map(|segment| segment.modules.layout.clone())
        .context("the loader tree of an app page must have a root layout")?;

    let mut unsupported: Vec<(FileSystemPath, RcStr)> = Vec::new();
    if !*next_config.enable_native_rsc_runtime().await? {
        unsupported.push((
            page_path.clone(),
            rcstr!("It requires `experimental.nativeRscRuntime`."),
        ));
    }
    if *next_mode.await? == NextMode::Development {
        unsupported.push((
            page_path.clone(),
            rcstr!("`next dev` isn't supported yet. Use `next build` and `next start`."),
        ));
    }
    if config.await?.runtime == Some(NextRuntime::Edge) {
        unsupported.push((
            page_path.clone(),
            rcstr!("It can't be combined with `runtime = 'edge'`."),
        ));
    }
    if root.modules.layout.is_none() {
        unsupported.push((
            root_layout_path.clone(),
            rcstr!("A root layout inside a route group isn't supported yet."),
        ));
    }
    if segments.len() > 2 {
        unsupported.push((
            page_path.clone(),
            rcstr!(
                "Only a page directly inside the root layout is supported so far, with no \
                 segments between them."
            ),
        ));
    }
    let builtin_dir = get_next_package(project_root.clone())
        .await?
        .join("dist/client/components/builtin")?;
    for segment in &segments {
        collect_unsupported_modules(&segment.modules, &builtin_dir, &mut unsupported);
        if segment
            .parallel_routes
            .keys()
            .any(|slot| slot != "children")
        {
            unsupported.push((
                page_path.clone(),
                rcstr!("Parallel routes aren't supported yet."),
            ));
        }
    }
    // A `"use client"` root layout or page is a client reference, reported with the others by
    // `report_app_page_native_rsc_runtime_client_references`.
    for path in [&root_layout_path, &page_path] {
        let source = Vc::upcast(FileSource::new(path.clone()));
        let config = parse_segment_config_from_source(source, ParseSegmentMode::App).await?;
        if config.metadata.is_some() {
            unsupported.push((
                path.clone(),
                rcstr!(
                    "`metadata`, `viewport`, and their `generate…` functions aren't supported yet."
                ),
            ));
        }
        if config.ensure_static.is_some() {
            unsupported.push((path.clone(), rcstr!("`ensureStatic` isn't supported yet.")));
        }
        if config.instant.is_some() {
            unsupported.push((path.clone(), rcstr!("`instant` isn't supported yet.")));
        }
    }
    let GlobalMetadata {
        favicon,
        // Routes of their own, not part of the page.
        robots: _,
        manifest: _,
    } = &*tree.global_metadata.await?;
    if let Some(favicon) = favicon {
        unsupported.push((
            favicon.clone().into_path(),
            rcstr!("Metadata files (`favicon`) aren't supported yet."),
        ));
    }
    for (file_path, reason) in unsupported {
        NativeRscRuntimeUnsupportedIssue {
            file_path,
            page: page.clone(),
            reason,
        }
        .resolved_cell()
        .emit();
    }

    // The precompiled bundles of the renderer. `next start` runs on Node, in production.
    let renderer_rsc = "next/dist/native-rsc-runtime/rsc.node.prod.js";
    let renderer_ssr = "next/dist/native-rsc-runtime/ssr.node.prod.js";
    let inner_root_layout = rcstr!("INNER_ROOT_LAYOUT");
    let inner_page = rcstr!("INNER_PAGE");
    let source = load_next_js_template_no_imports(
        "app-page-native-rsc-runtime.js",
        project_root,
        &[
            ("VAR_RENDERER_RSC", renderer_rsc),
            ("VAR_RENDERER_SSR", renderer_ssr),
            ("VAR_ROOT_LAYOUT", &inner_root_layout),
            ("VAR_PAGE", &inner_page),
        ],
        &[],
        &[],
    )
    .await?;

    // The root layout and the page go through the server component transition, as in App Router's
    // loader tree.
    let server_component_transition: Vc<Box<dyn Transition>> =
        Vc::upcast(NextServerComponentTransition::new());
    let process = |path: FileSystemPath| {
        server_component_transition
            .process(
                Vc::upcast(FileSource::new(path)),
                nodejs_context,
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
    };
    let inner_assets = fxindexmap! {
        inner_root_layout => process(root_layout_path).await?,
        inner_page => process(page_path).await?,
    };
    let rsc_entry = nodejs_context
        .process(
            source,
            ReferenceType::Internal(ResolvedVc::cell(inner_assets.into())),
        )
        .module()
        .to_resolved()
        .await?;

    Ok(AppEntry {
        pathname: AppPath::from(page.clone()).to_string().into(),
        original_name: page.to_string().into(),
        rsc_entry,
        config: config.to_resolved().await?,
    }
    .cell())
}

/// Reports the client references of a page on the native RSC runtime, which has no client
/// components or CSS yet. Each kind is one issue at the page, naming the first module.
pub async fn report_app_page_native_rsc_runtime_client_references(
    client_references: Vc<ClientReferenceGraphResult>,
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
) -> Result<()> {
    let client_references = client_references.await?;
    if client_references.client_references.is_empty() {
        return Ok(());
    }
    let tree = loader_tree.await?;
    let Some(page_path) = find_page(&tree).or_else(|| tree.modules.layout.clone()) else {
        return Ok(());
    };
    let mut components = Vec::new();
    let mut css = Vec::new();
    for reference in &client_references.client_references {
        match reference.ty {
            ClientReferenceType::EcmascriptClientReference(module) => {
                components.push(module.ident().await?.path.clone())
            }
            ClientReferenceType::CssClientReference(module) => {
                css.push(module.ident().await?.path.clone())
            }
        }
    }
    for (paths, what) in [(components, "Client components"), (css, "CSS imports")] {
        let Some(first) = paths.first() else {
            continue;
        };
        let more = match paths.len() - 1 {
            0 => String::new(),
            1 => " and 1 other".to_string(),
            n => format!(" and {n} others"),
        };
        NativeRscRuntimeUnsupportedIssue {
            file_path: page_path.clone(),
            page: page.clone(),
            reason: format!(
                "{what} aren't supported yet. The route imports `{}`{more}.",
                first.path
            )
            .into(),
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

/// Reports a `not-found` or `global-not-found` file that sets `experimental_nativeRscRuntime`
/// itself, for the built-in `/_not-found` page. Built-in pages don't inherit the export from the
/// root layout, so only the files that make up the page count: its leaf, and a
/// `global-not-found` file, which takes the root layout's place.
pub async fn report_app_builtin_page_native_rsc_runtime(
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
) -> Result<()> {
    let tree = loader_tree.await?;
    let global_not_found = tree
        .modules
        .layout
        .clone()
        .filter(|layout| layout.file_stem() == Some("global-not-found"));
    for path in find_page(&tree).into_iter().chain(global_not_found) {
        let config = parse_segment_config_from_source(
            Vc::upcast(FileSource::new(path.clone())),
            ParseSegmentMode::App,
        )
        .await?;
        if config.native_rsc_runtime != Some(true) {
            continue;
        }
        let name = path.file_stem().unwrap_or_default();
        NativeRscRuntimeUnsupportedIssue {
            page: page.clone(),
            reason: format!("`{name}` files aren't supported yet.").into(),
            file_path: path,
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

/// Collects the special files of a segment that the native RSC runtime doesn't support yet.
/// The builtin defaults Turbopack fills in for a missing `not-found`, `global-error`, and so on
/// aren't the user's, and are ignored.
fn collect_unsupported_modules(
    modules: &AppDirModules,
    builtin_dir: &FileSystemPath,
    unsupported: &mut Vec<(FileSystemPath, RcStr)>,
) {
    let AppDirModules {
        page: _,
        layout: _,
        error,
        global_error,
        global_not_found,
        loading,
        template,
        forbidden,
        unauthorized,
        not_found,
        // Only rendered in parallel route slots, which are unsupported.
        default: _,
        // Not part of a page's loader tree.
        route: _,
        metadata,
    } = modules;
    for (name, path) in [
        ("error", error),
        ("global-error", global_error),
        ("global-not-found", global_not_found),
        ("loading", loading),
        ("template", template),
        ("forbidden", forbidden),
        ("unauthorized", unauthorized),
        ("not-found", not_found),
    ] {
        if let Some(path) = path
            && !path.is_inside_ref(builtin_dir)
        {
            unsupported.push((
                path.clone(),
                format!("`{name}` files aren't supported yet.").into(),
            ));
        }
    }
    let Metadata {
        icon,
        apple,
        twitter,
        open_graph,
        sitemap,
        base_page: _,
    } = metadata;
    let items = [
        ("icon", icon),
        ("apple-icon", apple),
        ("twitter-image", twitter),
        ("opengraph-image", open_graph),
    ]
    .into_iter()
    .flat_map(|(name, items)| {
        items
            .iter()
            .map(move |item| (name, MetadataItem::from(item.clone())))
    })
    .chain(sitemap.iter().map(|item| ("sitemap", item.clone())));
    for (name, item) in items {
        unsupported.push((
            item.into_path(),
            format!("Metadata files (`{name}`) aren't supported yet.").into(),
        ));
    }
}

/// The page of a loader tree: the one `children` leads to, or else the first one in another slot,
/// for a route whose page is only in a parallel route slot.
pub(crate) fn find_page(tree: &AppPageLoaderTree) -> Option<FileSystemPath> {
    if let Some(page) = &tree.modules.page {
        return Some(page.clone());
    }
    let children = tree.parallel_routes.get("children");
    children
        .into_iter()
        .chain(
            tree.parallel_routes
                .iter()
                .filter(|(slot, _)| *slot != "children")
                .map(|(_, tree)| tree),
        )
        .find_map(|tree| find_page(tree))
}

/// A page on the native RSC runtime uses something the native RSC runtime doesn't
/// support yet.
#[turbo_tasks::value(shared)]
pub(crate) struct NativeRscRuntimeUnsupportedIssue {
    pub file_path: FileSystemPath,
    pub page: AppPage,
    pub reason: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NativeRscRuntimeUnsupportedIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::AppStructure
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            format!(
                "\"{}\" can't use the native RSC runtime",
                AppPath::from(self.page.clone())
            )
            .into(),
        ))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.reason.clone())))
    }
}
