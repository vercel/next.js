//! An explicit test route is resolved from the application's real loader tree.
//! The synthetic test page remains the manifest identity, never the request page.

use anyhow::{Context, Result, bail};
use next_core::{
    app_structure::{AppPageLoaderTree, Entrypoint, Entrypoints},
    next_app::{AppPage, AppPath, PageSegment, PageType},
    parse_segment_config_from_loader_tree,
    segment_config::{
        NextRevalidate, NextSegmentConfig, NextSegmentDynamic, NextSegmentFetchCache,
    },
    util::NextRuntime,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    file_source::FileSource,
    virtual_output::VirtualOutputAsset,
};

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub(crate) struct TestRoute {
    pub pathname: RcStr,
    pub page: AppPage,
    pub loader_tree: ResolvedVc<AppPageLoaderTree>,
    pub root_params: Vec<RcStr>,
    pub config: ResolvedVc<NextSegmentConfig>,
}

fn canonical_page<'a>(path: &AppPath, pages: &'a [AppPage]) -> Result<&'a AppPage> {
    if path.contains_interception() {
        bail!("RSC test routes do not yet support interception routing");
    }
    let mut canonical = None;
    for page in pages {
        let page_path = AppPath::from(page.clone());
        if page_path.contains_interception() {
            bail!("RSC test routes do not yet support interception routing");
        }
        if page_path != *path
            || !matches!(page.0.last(), Some(PageSegment::PageType(PageType::Page)))
        {
            bail!("RSC test routes require an unambiguous App Router page");
        }
        if !page
            .0
            .iter()
            .any(|segment| matches!(segment, PageSegment::Parallel(_)))
        {
            if canonical.replace(page).is_some() {
                bail!("RSC test routes require an unambiguous App Router page");
            }
        }
    }
    canonical.context("RSC test routes require an unambiguous App Router page")
}

#[turbo_tasks::function]
pub(crate) async fn resolve_route(
    entrypoints: Vc<Entrypoints>,
    pathname: RcStr,
) -> Result<Vc<TestRoute>> {
    let entrypoints = entrypoints.await?;
    let (app_path, entry) = entrypoints
        .iter()
        .find(|(path, _)| path.to_string() == pathname.as_str())
        .context("The selected RSC test route does not exist in the App Router")?;
    let Entrypoint::AppPage {
        pages,
        loader_tree,
        root_params,
        ..
    } = entry
    else {
        bail!(
            "RSC test routes must select an App Router page, not a route handler or metadata route"
        );
    };
    let page = canonical_page(app_path, pages)?;
    // A direct initial request can render matched same-path named pages from
    // this actual tree. Interception still needs navigation state.
    if loader_tree.await?.is_intercepting() {
        bail!("RSC test routes do not yet support interception routing");
    }
    let config = parse_segment_config_from_loader_tree(**loader_tree)
        .to_resolved()
        .await?;
    if config.await?.runtime.unwrap_or_default() != NextRuntime::NodeJs {
        bail!("RSC test routes require the selected loader tree's effective Node.js runtime");
    }
    if config.await?.dynamic_params == Some(false) {
        bail!("RSC test routes do not yet support dynamicParams=false static-path enforcement");
    }
    Ok(TestRoute {
        pathname,
        page: page.clone(),
        loader_tree: *loader_tree,
        root_params: root_params.await?.as_ref().cloned().unwrap_or_default(),
        config,
    }
    .cell())
}

async fn source_hash(path: FileSystemPath) -> Result<String> {
    let hash = FileSource::new(path)
        .content()
        .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
        .owned()
        .await?
        .context("RSC test route source was not found")?;
    Ok(data_encoding::HEXLOWER.encode(&data_encoding::BASE64.decode(hash.as_bytes())?))
}

#[turbo_tasks::function]
pub(crate) async fn metadata_asset(
    route: ResolvedVc<TestRoute>,
    project_path: FileSystemPath,
    entry_path: FileSystemPath,
    output_path: FileSystemPath,
    base_path: Option<RcStr>,
) -> Result<Vc<VirtualOutputAsset>> {
    let route = route.await?;
    let config = route.config.await?;
    let mut paths = Vec::new();
    let tree = route.loader_tree.await?;
    let mut pending = vec![&*tree];
    while let Some(tree) = pending.pop() {
        if !tree.modules.sources.is_empty() {
            bail!("RSC test routes require filesystem-owned application loader trees");
        }
        let modules = &tree.modules;
        paths.extend(
            [
                &modules.page,
                &modules.layout,
                &modules.default,
                &modules.error,
                &modules.global_error,
                &modules.global_not_found,
                &modules.loading,
                &modules.template,
                &modules.forbidden,
                &modules.unauthorized,
                &modules.not_found,
            ]
            .into_iter()
            .flatten()
            .cloned(),
        );
        pending.extend(tree.parallel_routes.values());
    }
    paths.sort_by(|a, b| a.path.cmp(&b.path));
    paths.dedup();
    let mut sources = Vec::new();
    for path in paths {
        // Built-in boundaries outside the application are compiler assets, not
        // application source claims. Their emitted bytes remain in the closure.
        if let Some(file) = project_path.get_path_to(&path) {
            if !file.split('/').any(|part| part == "node_modules") {
                sources.push(
                    serde_json::json!({ "file": file, "sha256": source_hash(path.clone()).await? }),
                );
            }
        }
    }
    if sources.is_empty() {
        bail!("The selected RSC route has no application source identity");
    }
    let dynamic = match config.dynamic.unwrap_or_default() {
        NextSegmentDynamic::Auto => "auto",
        NextSegmentDynamic::ForceDynamic => "force-dynamic",
        NextSegmentDynamic::ForceStatic => "force-static",
        NextSegmentDynamic::Error => "error",
    };
    let fetch_cache = match config.fetch_cache.unwrap_or_default() {
        NextSegmentFetchCache::Auto => "auto",
        NextSegmentFetchCache::DefaultCache => "default-cache",
        NextSegmentFetchCache::OnlyCache => "only-cache",
        NextSegmentFetchCache::ForceCache => "force-cache",
        NextSegmentFetchCache::DefaultNoStore => "default-no-store",
        NextSegmentFetchCache::OnlyNoStore => "only-no-store",
        NextSegmentFetchCache::ForceNoStore => "force-no-store",
    };
    let revalidate = match config.revalidate.unwrap_or_default() {
        NextRevalidate::Never => serde_json::Value::Bool(false),
        NextRevalidate::ForceCache => serde_json::json!("force-cache"),
        NextRevalidate::Frequency { seconds } => serde_json::json!(seconds),
    };
    let metadata = serde_json::json!({
        "version": 1, "pathname": route.pathname, "page": route.page.to_string(),
        "runtime": "nodejs", "basePath": base_path.unwrap_or_default(),
        "rootParamNames": route.root_params,
        "config": { "dynamic": dynamic, "dynamicParams": config.dynamic_params.unwrap_or(true),
            "fetchCache": fetch_cache, "revalidate": revalidate },
        "entry": { "file": project_path.get_path_to(&entry_path).context("RSC test entry must be inside the application")?,
            "sha256": source_hash(entry_path).await? },
        "sources": sources,
    });
    Ok(VirtualOutputAsset::new(
        output_path,
        AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string(&metadata)?)).cell(),
        ),
    ))
}

#[cfg(test)]
mod tests {
    use next_core::next_app::{AppPage, AppPath};

    use super::canonical_page;

    fn pages(values: &[&str]) -> Vec<AppPage> {
        values
            .iter()
            .map(|value| AppPage::parse(value).unwrap())
            .collect()
    }

    fn path(value: &str) -> AppPath {
        AppPath::from(AppPage::parse(value).unwrap())
    }

    #[test]
    fn canonical_ordinary_page_is_selected_from_the_actual_same_path_pages() {
        for (pathname, candidates, expected) in [
            ("/", vec!["/page"], "/page"),
            (
                "/[tenant]/panel",
                vec!["/[tenant]/panel/page"],
                "/[tenant]/panel/page",
            ),
            (
                "/[tenant]/panel",
                vec!["/(app)/[tenant]/panel/page"],
                "/(app)/[tenant]/panel/page",
            ),
            (
                "/[tenant]/panel",
                vec![
                    "/[tenant]/panel/@activity/page",
                    "/[tenant]/panel/page",
                    "/[tenant]/panel/@metrics/page",
                ],
                "/[tenant]/panel/page",
            ),
            (
                "/[tenant]/panel/[item]",
                vec![
                    "/[tenant]/panel/@metrics/[item]/page",
                    "/[tenant]/panel/@activity/[item]/page",
                    "/[tenant]/panel/[item]/page",
                ],
                "/[tenant]/panel/[item]/page",
            ),
            (
                "/",
                vec!["/@metrics/page", "/page", "/@activity/page"],
                "/page",
            ),
        ] {
            let candidates = pages(&candidates);
            let selected = canonical_page(&path(pathname), &candidates).unwrap();
            assert_eq!(selected.to_string(), expected);
            let reversed = candidates.into_iter().rev().collect::<Vec<_>>();
            assert_eq!(
                canonical_page(&path(pathname), &reversed)
                    .unwrap()
                    .to_string(),
                expected
            );
        }
    }

    #[test]
    fn canonical_page_rejects_absent_ambiguous_foreign_or_nonpage_candidates() {
        for candidates in [
            vec![],
            vec!["/[tenant]/panel/@activity/page"],
            vec!["/[tenant]/panel/page", "/[tenant]/panel/page"],
            vec!["/(one)/[tenant]/panel/page", "/(two)/[tenant]/panel/page"],
            vec!["/[tenant]/panel/page", "/[tenant]/other/@activity/page"],
            vec!["/[tenant]/other/page"],
            vec!["/[tenant]/panel/route"],
            vec!["/[tenant]/panel"],
            vec!["/[tenant]/panel/page", "/[tenant]/panel/@activity/route"],
        ] {
            assert!(
                canonical_page(&path("/[tenant]/panel"), &pages(&candidates)).is_err(),
                "{candidates:?}"
            );
        }
    }

    #[test]
    fn canonical_page_rejects_interception_and_descendants() {
        for (pathname, candidates) in [
            (
                "/[tenant]/panel",
                vec![
                    "/[tenant]/panel/page",
                    "/[tenant]/panel/@activity/(.)report/page",
                ],
            ),
            (
                "/[tenant]/panel",
                vec![
                    "/[tenant]/panel/page",
                    "/[tenant]/panel/@activity/(..)report/detail/page",
                ],
            ),
            ("/[tenant]/(..)panel", vec!["/[tenant]/(..)panel/page"]),
            (
                "/[tenant]/(...)panel/detail",
                vec!["/[tenant]/(...)panel/detail/page"],
            ),
        ] {
            let error = canonical_page(&path(pathname), &pages(&candidates)).unwrap_err();
            assert!(error.to_string().contains("interception"));
        }
    }
}
