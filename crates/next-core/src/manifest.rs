use anyhow::Result;
use indexmap::IndexSet;
use mime::APPLICATION_JSON;
use turbo_tasks::primitives::StringsVc;
use turbo_tasks_fs::File;
use turbopack_core::asset::AssetContentVc;
use turbopack_dev_server::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceResultVc, ContentSourceVc,
};
use turbopack_node::render::{
    node_api_source::NodeApiContentSourceVc, rendered_source::NodeRenderContentSourceVc,
};

/// A content source which creates the next.js `_devPagesManifest.json` and
/// `_devMiddlewareManifest.json` which are used for client side navigation.
#[turbo_tasks::value(shared)]
pub struct DevManifestContentSource {
    pub page_roots: Vec<ContentSourceVc>,
}

#[turbo_tasks::value_impl]
impl DevManifestContentSourceVc {
    #[turbo_tasks::function]
    async fn find_routes(self) -> Result<StringsVc> {
        let this = &*self.await?;
        let mut queue = this.page_roots.clone();
        let mut routes = IndexSet::new();

        while let Some(content_source) = queue.pop() {
            queue.extend(content_source.get_children().await?.iter());

            // TODO This shouldn't use casts but an public api instead
            if let Some(api_source) = NodeApiContentSourceVc::resolve_from(content_source).await? {
                routes.insert(format!("/{}", api_source.get_pathname().await?));

                continue;
            }

            if let Some(page_source) =
                NodeRenderContentSourceVc::resolve_from(content_source).await?
            {
                routes.insert(format!("/{}", page_source.get_pathname().await?));

                continue;
            }
        }

        routes.sort();

        Ok(StringsVc::cell(routes.into_iter().collect()))
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for DevManifestContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: DevManifestContentSourceVc,
        path: &str,
        _data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let manifest_content = match path {
            "_next/static/development/_devPagesManifest.json" => {
                let pages = &*self_vc.find_routes().await?;

                serde_json::to_string(&serde_json::json!({
                    "pages": pages,
                }))?
            }
            "_next/static/development/_devMiddlewareManifest.json" => {
                // empty middleware manifest
                "[]".to_string()
            }
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let file = File::from(manifest_content).with_content_type(APPLICATION_JSON);

        Ok(ContentSourceResultVc::exact(
            ContentSourceContent::Static(AssetContentVc::from(file).into()).cell(),
        ))
    }
}
