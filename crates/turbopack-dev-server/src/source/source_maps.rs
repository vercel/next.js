use anyhow::Result;
use mime::APPLICATION_JSON;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent, introspect::Introspectable, source_map::GenerateSourceMap,
    version::VersionedContentExt,
};

use super::{
    query::QueryValue,
    route_tree::{BaseSegment, RouteTree, RouteType},
    wrapping_source::{ContentSourceProcessor, WrappedGetContentSourceContent},
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataFilter,
    ContentSourceDataVary, GetContentSourceContent, RewriteBuilder,
};

/// SourceMapContentSource allows us to serve full source maps, and individual
/// sections of source maps, of any found asset in the graph without adding
/// the maps themselves to that graph.
///
/// Any path ending with `.map` is acceptable, and the stripped path will be
/// used to fetch from our wrapped ContentSource. Any found asset should
/// implement the [GenerateSourceMap] trait to generate full maps.
///
/// Optionally, if an `?id={ID}` query param is present, we will instead fetch
/// an individual section from the asset via [GenerateSourceMap::by_section].
#[turbo_tasks::value(shared)]
pub struct SourceMapContentSource {
    /// A wrapped content source from which we will fetch assets.
    asset_source: Vc<Box<dyn ContentSource>>,
}

#[turbo_tasks::value_impl]
impl SourceMapContentSource {
    #[turbo_tasks::function]
    pub fn new(asset_source: Vc<Box<dyn ContentSource>>) -> Vc<SourceMapContentSource> {
        SourceMapContentSource { asset_source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for SourceMapContentSource {
    #[turbo_tasks::function]
    fn get_routes(self: Vc<Self>) -> Vc<RouteTree> {
        RouteTree::new_route(
            vec![BaseSegment::Dynamic],
            RouteType::Exact,
            Vc::upcast(self),
        )
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for SourceMapContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        ContentSourceDataVary {
            query: Some(ContentSourceDataFilter::Subset(["id".to_string()].into())),
            ..Default::default()
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get(
        self: Vc<Self>,
        path: String,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let pathname = match path.strip_suffix(".map") {
            Some(p) => p,
            _ => return Ok(ContentSourceContent::not_found()),
        };

        let query = match &data.query {
            Some(q) => q,
            _ => return Ok(ContentSourceContent::not_found()),
        };

        let id = match query.get("id") {
            Some(QueryValue::String(s)) => Some(s.clone()),
            _ => None,
        };

        let sources = self
            .await?
            .asset_source
            .get_routes()
            .get(pathname.to_string());
        let processor = Vc::upcast(SourceMapContentProcessor::new(id));
        let sources = sources
            .await?
            .iter()
            .map(|s| Vc::upcast(WrappedGetContentSourceContent::new(*s, processor)))
            .collect();
        Ok(
            ContentSourceContent::Rewrite(RewriteBuilder::new_sources(Vc::cell(sources)).build())
                .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for SourceMapContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        Vc::cell("source map content source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        Vc::cell("serves chunk and chunk item source maps".to_string())
    }
}

/// Processes the eventual [ContentSourceContent] to transform it into a source
/// map JSON content.
#[turbo_tasks::value]
pub struct SourceMapContentProcessor {
    /// An optional section id to use when generating the map. Specifying a
    /// section id will only output that section. Otherwise, it prints the
    /// full source map.
    id: Option<String>,
}

#[turbo_tasks::value_impl]
impl SourceMapContentProcessor {
    #[turbo_tasks::function]
    fn new(id: Option<String>) -> Vc<Self> {
        SourceMapContentProcessor { id }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceProcessor for SourceMapContentProcessor {
    #[turbo_tasks::function]
    async fn process(&self, content: Vc<ContentSourceContent>) -> Result<Vc<ContentSourceContent>> {
        let file = match &*content.await? {
            ContentSourceContent::Static(static_content) => static_content.await?.content,
            _ => return Ok(ContentSourceContent::not_found()),
        };

        let gen = match Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(file).await? {
            Some(f) => f,
            None => return Ok(ContentSourceContent::not_found()),
        };

        let sm = if let Some(id) = &self.id {
            gen.by_section(id.clone()).await?
        } else {
            gen.generate_source_map().await?
        };
        let sm = match &*sm {
            Some(sm) => *sm,
            None => return Ok(ContentSourceContent::not_found()),
        };

        let content = sm.to_rope().await?;
        let asset = AssetContent::file(
            File::from(content)
                .with_content_type(APPLICATION_JSON)
                .into(),
        );
        Ok(ContentSourceContent::static_content(asset.versioned()))
    }
}
