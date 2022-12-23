use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    introspect::{Introspectable, IntrospectableVc},
    source_map::GenerateSourceMapVc,
};
use turbopack_dev_server::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
    ContentSourceResultVc, ContentSourceVc, ContentSourcesVc, NeededData,
};
use url::Url;

use super::{SourceMapTraceVc, StackFrame};

/// Responsible for performinmg source map tracging for individual error stack
/// frames. This is the API end of the client's Overlay stack-frame.ts.
#[turbo_tasks::value(shared)]
pub struct NextSourceMapTraceContentSource {
    asset_source: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl NextSourceMapTraceContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(asset_source: ContentSourceVc) -> NextSourceMapTraceContentSourceVc {
        NextSourceMapTraceContentSource { asset_source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NextSourceMapTraceContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: NextSourceMapTraceContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let url = match &data.url {
            None => {
                return Ok(ContentSourceResultVc::exact(
                    ContentSourceContent::NeedData(NeededData {
                        source: self_vc.into(),
                        path: path.to_string(),
                        vary: ContentSourceDataVary {
                            url: true,
                            ..Default::default()
                        },
                    })
                    .cell(),
                ));
            }
            Some(query) => query,
        };

        // TODO: It'd be nice if the data.query value contained the unparsed query, so I
        // could convert it into my struct.
        let query_idx = match url.find('?') {
            Some(i) => i,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };
        let frame: StackFrame = match serde_qs::from_str(&url[query_idx + 1..]) {
            Ok(f) => f,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };
        let (line, column) = match frame.get_pos() {
            Some((l, c)) => (l, c),
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        // The file is some percent encoded `http://localhost:3000/_next/foo/bar.js`
        let file = match Url::parse(&frame.file) {
            Ok(u) => u,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let path = match file.path().strip_prefix('/') {
            Some(p) => p,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };
        let id = file
            .query_pairs()
            .find_map(|(k, v)| if k == "id" { Some(v) } else { None });

        let this = self_vc.await?;
        let result = this.asset_source.get(path, Default::default()).await?;
        let file = match &*result.content.await? {
            ContentSourceContent::Static(f) => *f,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let gen = match GenerateSourceMapVc::resolve_from(file).await? {
            Some(f) => f,
            _ => return Ok(ContentSourceResultVc::not_found()),
        };

        let sm = if let Some(id) = id {
            let section = gen.by_section(&id).await?;
            match &*section {
                Some(sm) => *sm,
                None => return Ok(ContentSourceResultVc::not_found()),
            }
        } else {
            gen.generate_source_map()
        };

        let traced = SourceMapTraceVc::new(sm, line, column, frame.name);
        Ok(ContentSourceResultVc::exact(
            ContentSourceContent::Static(traced.content().into()).cell(),
        ))
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::cell(vec![self.asset_source])
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for NextSourceMapTraceContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("next source map trace content source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        StringVc::cell(
            "supports tracing an error stack frame to its original source location".to_string(),
        )
    }
}
