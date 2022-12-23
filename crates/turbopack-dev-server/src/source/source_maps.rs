use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContentVc,
    introspect::{Introspectable, IntrospectableVc},
    source_map::GenerateSourceMapVc,
};

use super::{
    query::QueryValue, ContentSource, ContentSourceContent, ContentSourceData,
    ContentSourceDataFilter, ContentSourceDataVary, ContentSourceResultVc, ContentSourceVc,
    NeededData,
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
    async fn get(
        self_vc: SourceMapContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let pathname = match path.strip_suffix(".map") {
            Some(p) => p,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let query = match &data.query {
            Some(q) => q,
            None => {
                return Ok(ContentSourceResultVc::exact(
                    ContentSourceContent::NeedData(NeededData {
                        source: self_vc.into(),
                        path: path.to_string(),
                        vary: ContentSourceDataVary {
                            query: Some(ContentSourceDataFilter::Subset(["id".to_string()].into())),
                            ..Default::default()
                        },
                    })
                    .cell(),
                ))
            }
        };

        let id = match query.get("id") {
            Some(QueryValue::String(s)) => Some(s),
            _ => None,
        };

        let this = self_vc.await?;
        let result = this.asset_source.get(pathname, Default::default()).await?;
        let file = match &*result.content.await? {
            ContentSourceContent::Static(f) => *f,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let gen = match GenerateSourceMapVc::resolve_from(file).await? {
            Some(f) => f,
            None => return Ok(ContentSourceResultVc::not_found()),
        };

        let sm = if let Some(id) = id {
            let section = gen.by_section(id).await?;
            match &*section {
                Some(sm) => *sm,
                None => return Ok(ContentSourceResultVc::not_found()),
            }
        } else {
            gen.generate_source_map()
        };
        let content = sm.to_rope().await?;

        let asset = AssetContentVc::from(File::from(content));
        Ok(ContentSourceResultVc::exact(
            ContentSourceContent::Static(asset.into()).cell(),
        ))
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
