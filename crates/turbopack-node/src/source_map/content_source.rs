use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    introspect::{Introspectable, IntrospectableVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc},
};
use turbopack_dev_server::source::{
    wrapping_source::{ContentSourceProcessor, ContentSourceProcessorVc, WrappedContentSourceVc},
    ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
    ContentSourceDataVary, ContentSourceResultVc, ContentSourceVc, ContentSourcesVc, NeededData,
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
        let raw_query = match &data.raw_query {
            None => {
                return Ok(ContentSourceResultVc::need_data(Value::new(NeededData {
                    source: self_vc.into(),
                    path: path.to_string(),
                    vary: ContentSourceDataVary {
                        raw_query: true,
                        ..Default::default()
                    },
                })));
            }
            Some(query) => query,
        };

        let frame: StackFrame = match serde_qs::from_str(raw_query) {
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
        let id = file.query_pairs().find_map(|(k, v)| {
            if k == "id" {
                Some(v.into_owned())
            } else {
                None
            }
        });

        let wrapped = WrappedContentSourceVc::new(
            self_vc.await?.asset_source,
            NextSourceMapTraceContentProcessorVc::new(id, line, column, frame.name).into(),
        );
        Ok(wrapped.as_content_source().get(path, Default::default()))
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

/// Processes the eventual [ContentSourceContent] to transform it into a source
/// map trace's JSON content.
#[turbo_tasks::value]
pub struct NextSourceMapTraceContentProcessor {
    /// An optional section id to use when tracing the map. Specifying a
    /// section id trace starting at that section. Otherwise, it traces starting
    /// at the full source map.
    id: Option<String>,

    /// The generated line we are trying to trace.
    line: usize,

    /// The generated column we are trying to trace.
    column: usize,

    /// An optional name originally assigned to the stack frame, used as a
    /// default if the trace finds an unnamed source map segment.
    name: Option<String>,
}

#[turbo_tasks::value_impl]
impl NextSourceMapTraceContentProcessorVc {
    #[turbo_tasks::function]
    fn new(id: Option<String>, line: usize, column: usize, name: Option<String>) -> Self {
        NextSourceMapTraceContentProcessor {
            id,
            line,
            column,
            name,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSourceProcessor for NextSourceMapTraceContentProcessor {
    #[turbo_tasks::function]
    async fn process(&self, content: ContentSourceContentVc) -> Result<ContentSourceContentVc> {
        let file = match &*content.await? {
            ContentSourceContent::Static(static_content) => static_content.await?.content,
            _ => return Ok(ContentSourceContentVc::not_found()),
        };

        let gen = match GenerateSourceMapVc::resolve_from(file).await? {
            Some(f) => f,
            _ => return Ok(ContentSourceContentVc::not_found()),
        };

        let sm = if let Some(id) = &self.id {
            let section = gen.by_section(id).await?;
            match &*section {
                Some(sm) => *sm,
                None => return Ok(ContentSourceContentVc::not_found()),
            }
        } else {
            gen.generate_source_map()
        };

        let traced = SourceMapTraceVc::new(sm, self.line, self.column, self.name.clone());
        Ok(ContentSourceContentVc::static_content(
            traced.content().into(),
        ))
    }
}
