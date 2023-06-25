use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent, ident::AssetIdent, introspect::Introspectable,
        server_fs::ServerFileSystem, version::VersionedContent,
    },
    dev_server::source::{
        query::QueryValue,
        route_tree::{RouteTree, RouteType},
        wrapping_source::{ContentSourceProcessor, WrappedGetContentSourceContent},
        ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataFilter,
        ContentSourceDataVary, GetContentSourceContent, ProxyResult, RewriteBuilder,
    },
    image::process::optimize,
};

/// Serves, resizes, optimizes, and re-encodes images to be used with
/// next/image.
#[turbo_tasks::value(shared)]
pub struct NextImageContentSource {
    asset_source: Vc<Box<dyn ContentSource>>,
}

#[turbo_tasks::value_impl]
impl NextImageContentSource {
    #[turbo_tasks::function]
    pub fn new(asset_source: Vc<Box<dyn ContentSource>>) -> Vc<NextImageContentSource> {
        NextImageContentSource { asset_source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NextImageContentSource {
    #[turbo_tasks::function]
    fn get_routes(self: Vc<Self>) -> Vc<RouteTree> {
        RouteTree::new_route(Vec::new(), RouteType::Exact, Vc::upcast(self))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NextImageContentSource {
    #[turbo_tasks::function]
    async fn vary(&self) -> Vc<ContentSourceDataVary> {
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
        self: Vc<Self>,
        _path: String,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let this = self.await?;

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
            let sources = this.asset_source.get_routes().get(path.to_string()).await?;
            let sources = sources
                .iter()
                .map(|s| {
                    Vc::upcast(WrappedGetContentSourceContent::new(
                        *s,
                        Vc::upcast(NextImageContentSourceProcessor::new(path.to_string(), w, q)),
                    ))
                })
                .collect();
            let sources = Vc::cell(sources);
            return Ok(
                ContentSourceContent::Rewrite(RewriteBuilder::new_sources(sources).build()).cell(),
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
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for NextImageContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        Vc::cell("next image content source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        Vc::cell("supports dynamic serving of any statically imported image".to_string())
    }
}

#[turbo_tasks::value]
struct NextImageContentSourceProcessor {
    path: String,
    width: u32,
    quality: u8,
}

#[turbo_tasks::value_impl]
impl NextImageContentSourceProcessor {
    #[turbo_tasks::function]
    pub fn new(path: String, width: u32, quality: u8) -> Vc<NextImageContentSourceProcessor> {
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
    async fn process(&self, content: Vc<ContentSourceContent>) -> Result<Vc<ContentSourceContent>> {
        let ContentSourceContent::Static(static_content) = *content.await? else {
            return Ok(content);
        };
        let static_content = static_content.await?;
        let asset_content = static_content.content.content().await?;
        let AssetContent::File(file_content) = *asset_content else {
            return Ok(content);
        };
        let optimized_file_content = optimize(
            AssetIdent::from_path(ServerFileSystem::new().root().join(self.path.clone())),
            file_content,
            self.width,
            u32::MAX,
            self.quality,
        );
        Ok(ContentSourceContent::static_content(
            AssetContent::File(optimized_file_content).into(),
        ))
    }
}
