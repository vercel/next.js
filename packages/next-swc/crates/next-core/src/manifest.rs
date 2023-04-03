use anyhow::{Context, Result};
use indexmap::IndexMap;
use mime::{APPLICATION_JAVASCRIPT_UTF_8, APPLICATION_JSON};
use serde::Serialize;
use turbo_binding::{
    turbo::{tasks::TryJoinIterExt, tasks_fs::File},
    turbopack::{
        core::asset::AssetContentVc,
        dev_server::source::{
            ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceResultVc,
            ContentSourceVc,
        },
        node::render::{
            node_api_source::NodeApiContentSourceVc, rendered_source::NodeRenderContentSourceVc,
        },
    },
};
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    primitives::{StringVc, StringsVc},
};

use crate::{
    embed_js::next_js_file,
    next_config::{NextConfigVc, RewritesReadRef},
    util::get_asset_path_from_route,
};

/// A content source which creates the next.js `_devPagesManifest.json` and
/// `_devMiddlewareManifest.json` which are used for client side navigation.
#[turbo_tasks::value(shared)]
pub struct DevManifestContentSource {
    pub page_roots: Vec<ContentSourceVc>,
    pub next_config: NextConfigVc,
}

#[turbo_tasks::value_impl]
impl DevManifestContentSourceVc {
    /// Recursively find all routes in the `page_roots` content sources.
    #[turbo_tasks::function]
    async fn find_routes(self) -> Result<StringsVc> {
        let this = &*self.await?;

        async fn content_source_to_pathname(
            content_source: ContentSourceVc,
        ) -> Result<Option<String>> {
            // TODO This shouldn't use casts but an public api instead
            if let Some(api_source) = NodeApiContentSourceVc::resolve_from(content_source).await? {
                return Ok(Some(format!("/{}", api_source.get_pathname().await?)));
            }

            if let Some(page_source) =
                NodeRenderContentSourceVc::resolve_from(content_source).await?
            {
                return Ok(Some(format!("/{}", page_source.get_pathname().await?)));
            }

            Ok(None)
        }

        async fn get_content_source_children(
            content_source: ContentSourceVc,
        ) -> Result<Vec<ContentSourceVc>> {
            Ok(content_source.get_children().await?.clone_value())
        }

        let mut routes = GraphTraversal::<NonDeterministic<_>>::visit(
            this.page_roots.iter().copied(),
            get_content_source_children,
        )
        .await
        .completed()?
        .into_iter()
        .map(content_source_to_pathname)
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

        routes.sort_by_cached_key(|s| s.split('/').map(PageSortKey::from).collect::<Vec<_>>());

        Ok(StringsVc::cell(routes))
    }

    /// Recursively find all pages in the `page_roots` content sources
    /// (excluding api routes).
    #[turbo_tasks::function]
    async fn find_pages(self) -> Result<StringsVc> {
        let routes = &*self.find_routes().await?;

        // we don't need to sort as it's already sorted by `find_routes`
        let pages = routes
            .iter()
            .filter(|s| !s.starts_with("/api"))
            .cloned()
            .collect();

        Ok(StringsVc::cell(pages))
    }

    /// Create a build manifest with all pages.
    #[turbo_tasks::function]
    async fn create_build_manifest(self) -> Result<StringVc> {
        let this = &*self.await?;

        let sorted_pages = &*self.find_pages().await?;
        let routes = sorted_pages
            .iter()
            .map(|p| {
                (
                    p,
                    vec![format!(
                        "_next/static/chunks/pages/{}",
                        get_asset_path_from_route(p.split_at(1).1, ".js")
                    )],
                )
            })
            .collect();

        let manifest = BuildManifest {
            rewrites: this.next_config.rewrites().await?,
            sorted_pages,
            routes,
        };

        let manifest = next_js_file("entry/manifest/buildManifest.js")
            .await?
            .as_content()
            .context("embedded buildManifest file missing")?
            .content()
            .to_str()?
            .replace("$$MANIFEST$$", &serde_json::to_string(&manifest)?);

        Ok(StringVc::cell(manifest))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildManifest<'a> {
    #[serde(rename = "__rewrites")]
    rewrites: RewritesReadRef,
    sorted_pages: &'a Vec<String>,

    #[serde(flatten)]
    routes: IndexMap<&'a String, Vec<String>>,
}

#[turbo_tasks::value_impl]
impl ContentSource for DevManifestContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: DevManifestContentSourceVc,
        path: &str,
        _data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let manifest_file = match path {
            "_next/static/development/_devPagesManifest.json" => {
                let pages = &*self_vc.find_routes().await?;

                File::from(serde_json::to_string(&serde_json::json!({
                    "pages": pages,
                }))?)
                .with_content_type(APPLICATION_JSON)
            }
            "_next/static/development/_buildManifest.js" => {
                let build_manifest = &*self_vc.create_build_manifest().await?;

                File::from(build_manifest.as_str()).with_content_type(APPLICATION_JAVASCRIPT_UTF_8)
            }
            "_next/static/development/_devMiddlewareManifest.json" => {
                // empty middleware manifest
                File::from("[]").with_content_type(APPLICATION_JSON)
            }
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        Ok(ContentSourceResultVc::exact(
            ContentSourceContentVc::static_content(AssetContentVc::from(manifest_file).into())
                .into(),
        ))
    }
}

/// PageSortKey is necessary because the next.js client code looks for matches
/// in the order the pages are sent in the manifest,if they're sorted
/// alphabetically this means \[slug] and \[\[catchall]] routes are prioritized
/// over fixed paths, so we have to override the ordering with this.
#[derive(Ord, PartialOrd, Eq, PartialEq)]
enum PageSortKey {
    Static(String),
    Slug,
    CatchAll,
}

impl From<&str> for PageSortKey {
    fn from(value: &str) -> Self {
        if value.starts_with("[[") && value.ends_with("]]") {
            PageSortKey::CatchAll
        } else if value.starts_with('[') && value.ends_with(']') {
            PageSortKey::Slug
        } else {
            PageSortKey::Static(value.to_string())
        }
    }
}
