use anyhow::Result;
use mime::APPLICATION_JSON;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContentVc,
    introspect::{Introspectable, IntrospectableVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc},
};

use super::{
    query::QueryValue,
    route_tree::{BaseSegment, RouteTreeVc, RouteType},
    wrapping_source::{
        ContentSourceProcessor, ContentSourceProcessorVc, WrappedGetContentSourceContentVc,
    },
    ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
    ContentSourceDataFilter, ContentSourceDataVary, ContentSourceDataVaryVc, ContentSourceVc,
    GetContentSourceContent, GetContentSourceContentVc, GetContentSourceContentsVc, RewriteBuilder,
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
    asset_source: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl SourceMapContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(asset_source: ContentSourceVc) -> SourceMapContentSourceVc {
        SourceMapContentSource { asset_source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for SourceMapContentSource {
    #[turbo_tasks::function]
    fn get_routes(self_vc: SourceMapContentSourceVc) -> RouteTreeVc {
        RouteTreeVc::new_route(vec![BaseSegment::Dynamic], RouteType::Exact, self_vc.into())
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for SourceMapContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            query: Some(ContentSourceDataFilter::Subset(["id".to_string()].into())),
            ..Default::default()
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get(
        self_vc: SourceMapContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let pathname = match path.strip_suffix(".map") {
            Some(p) => p,
            _ => return Ok(ContentSourceContentVc::not_found()),
        };

        let query = match &data.query {
            Some(q) => q,
            _ => return Ok(ContentSourceContentVc::not_found()),
        };

        let id = match query.get("id") {
            Some(QueryValue::String(s)) => Some(s.clone()),
            _ => None,
        };

        let sources = self_vc.await?.asset_source.get_routes().get(pathname);
        let processor = SourceMapContentProcessorVc::new(id).into();
        let sources = sources
            .await?
            .iter()
            .map(|s| WrappedGetContentSourceContentVc::new(*s, processor).into())
            .collect();
        Ok(ContentSourceContent::Rewrite(
            RewriteBuilder::new_sources(GetContentSourceContentsVc::cell(sources)).build(),
        )
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for SourceMapContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("source map content source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        StringVc::cell("serves chunk and chunk item source maps".to_string())
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
impl SourceMapContentProcessorVc {
    #[turbo_tasks::function]
    fn new(id: Option<String>) -> Self {
        SourceMapContentProcessor { id }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceProcessor for SourceMapContentProcessor {
    #[turbo_tasks::function]
    async fn process(&self, content: ContentSourceContentVc) -> Result<ContentSourceContentVc> {
        let file = match &*content.await? {
            ContentSourceContent::Static(static_content) => static_content.await?.content,
            _ => return Ok(ContentSourceContentVc::not_found()),
        };

        let gen = match GenerateSourceMapVc::resolve_from(file).await? {
            Some(f) => f,
            None => return Ok(ContentSourceContentVc::not_found()),
        };

        let sm = if let Some(id) = &self.id {
            gen.by_section(id).await?
        } else {
            gen.generate_source_map().await?
        };
        let sm = match &*sm {
            Some(sm) => *sm,
            None => return Ok(ContentSourceContentVc::not_found()),
        };

        let content = sm.to_rope().await?;
        let asset = AssetContentVc::from(File::from(content).with_content_type(APPLICATION_JSON));
        Ok(ContentSourceContentVc::static_content(asset.into()))
    }
}
