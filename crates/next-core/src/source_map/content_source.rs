use std::collections::HashSet;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};
use turbopack_dev_server::source::{
    ContentSource, ContentSourceData, ContentSourceDataVary, ContentSourceResult,
    ContentSourceResultVc, ContentSourceVc,
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
                return Ok(ContentSourceResult::NeedData {
                    source: self_vc.into(),
                    path: path.to_string(),
                    vary: ContentSourceDataVary {
                        url: true,
                        ..Default::default()
                    },
                }
                .cell());
            }
            Some(query) => query,
        };

        // TODO: It'd be nice if the data.query value contained the unparsed query, so I
        // could convert it into my struct.
        let query_idx = match url.find('?') {
            Some(i) => i,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };
        let frame: StackFrame = match serde_qs::from_str(&url[query_idx + 1..]) {
            Ok(f) => f,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };
        let (line, column) = match frame.get_pos() {
            Some((l, c)) => (l, c),
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };

        // The file is some percent encoded `http://localhost:3000/_next/foo/bar.js`
        let file = match Url::parse(&frame.file) {
            Ok(u) => u,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };

        let path = match file.path().strip_prefix('/') {
            Some(p) => p,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };

        // Source maps aren't stored as `foo.js.map`, but instead use a hash of the JS's
        // contents: `foo.js.abc123.map`. In order to find the map, we need to
        // get the JS's version id and then fetch the map.
        let this = self_vc.await?;
        let js_file = this
            .asset_source
            .get(path, Value::new(Default::default()))
            .await?;
        let js_file = match &*js_file {
            ContentSourceResult::Static(f) => f,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };
        let id = js_file.version().id().await?;

        let map = this
            .asset_source
            .get(&format!("{path}.{id}.map"), Value::new(Default::default()))
            .await?;
        let map = match &*map {
            ContentSourceResult::Static(f) => f,
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };

        let traced = SourceMapTraceVc::new(map.content(), line, column, frame.name);

        Ok(ContentSourceResult::Static(traced.content().into()).cell())
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

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        Ok(IntrospectableChildrenVc::cell(HashSet::new()))
    }
}
