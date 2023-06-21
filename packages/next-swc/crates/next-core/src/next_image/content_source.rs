use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent,
        ident::AssetIdentVc,
        introspect::{Introspectable, IntrospectableVc},
        server_fs::ServerFileSystemVc,
        version::VersionedContent,
    },
    dev_server::source::{
        query::QueryValue,
        route_tree::RouteTreeVc,
        wrapping_source::{
            ContentSourceProcessor, ContentSourceProcessorVc, WrappedGetContentSourceContentVc,
        },
        ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
        ContentSourceDataFilter, ContentSourceDataVary, ContentSourceDataVaryVc, ContentSourceVc,
        GetContentSourceContent, GetContentSourceContentVc, GetContentSourceContentsVc,
        ProxyResult, RewriteBuilder,
    },
    image::process::optimize,
};

/// Serves, resizes, optimizes, and re-encodes images to be used with
/// next/image.
#[turbo_tasks::value(shared)]
pub struct NextImageContentSource {
    asset_source: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl NextImageContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(asset_source: ContentSourceVc) -> NextImageContentSourceVc {
        NextImageContentSource { asset_source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NextImageContentSource {
    #[turbo_tasks::function]
    fn get_routes(self_vc: NextImageContentSourceVc) -> RouteTreeVc {
        RouteTreeVc::new_route(Vec::new(), None, self_vc.into())
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NextImageContentSource {
    #[turbo_tasks::function]
    async fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            query: Some(ContentSourceDataFilter::Subset(
                ["url".to_string(), "w".to_string(), "q".to_string()].into(),
            )),
            ..Default::default()
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get(
        self_vc: NextImageContentSourceVc,
        _path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let this = self_vc.await?;

        let Some(query) = &data.query else {
            bail!("missing query");
        };

        let Some(QueryValue::String(url)) = query.get("url") else {
            bail!("missing url");
        };

        let q = match query.get("q") {
            None => 75,
            Some(QueryValue::String(s)) => {
                let Ok(q) = s.parse::<u8>() else {
                    bail!("invalid q query argument")
                };
                q
            }
            _ => bail!("missing q query argument"),
        };

        let w = match query.get("w") {
            Some(QueryValue::String(s)) => {
                let Ok(w) = s.parse::<u32>() else {
                    bail!("invalid w query argument")
                };
                w
            }
            _ => bail!("missing w query argument"),
        };

        // TODO: re-encode into next-gen formats.

        if let Some(path) = url.strip_prefix('/') {
            let sources = this.asset_source.get_routes().get(path).await?;
            let sources = sources
                .iter()
                .map(|s| {
                    WrappedGetContentSourceContentVc::new(
                        *s,
                        NextImageContentSourceProcessorVc::new(path.to_string(), w, q).into(),
                    )
                    .into()
                })
                .collect();
            let sources = GetContentSourceContentsVc::cell(sources);
            return Ok(
                ContentSourceContent::Rewrite(RewriteBuilder::new_sources(sources).build())
                    .cell()
                    .into(),
            );
        }

        // TODO: This should be downloaded by the server, and resized, etc.
        Ok(ContentSourceContent::HttpProxy(
            ProxyResult {
                status: 302,
                headers: vec![("Location".to_string(), url.clone())],
                body: "".into(),
            }
            .cell(),
        )
        .cell()
        .into())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for NextImageContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("next image content source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        StringVc::cell("supports dynamic serving of any statically imported image".to_string())
    }
}

#[turbo_tasks::value]
struct NextImageContentSourceProcessor {
    path: String,
    width: u32,
    quality: u8,
}

#[turbo_tasks::value_impl]
impl NextImageContentSourceProcessorVc {
    #[turbo_tasks::function]
    pub fn new(path: String, width: u32, quality: u8) -> NextImageContentSourceProcessorVc {
        NextImageContentSourceProcessor {
            path,
            width,
            quality,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceProcessor for NextImageContentSourceProcessor {
    #[turbo_tasks::function]
    async fn process(&self, content: ContentSourceContentVc) -> Result<ContentSourceContentVc> {
        let ContentSourceContent::Static(static_content) = *content.await? else {
            return Ok(content);
        };
        let static_content = static_content.await?;
        let asset_content = static_content.content.content().await?;
        let AssetContent::File(file_content) = *asset_content else {
            return Ok(content);
        };
        let optimized_file_content = optimize(
            AssetIdentVc::from_path(ServerFileSystemVc::new().root().join(&self.path)),
            file_content,
            self.width,
            u32::MAX,
            self.quality,
        );
        Ok(ContentSourceContentVc::static_content(
            AssetContent::File(optimized_file_content).into(),
        ))
    }
}
