use std::collections::HashSet;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};
use turbopack_dev_server::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataFilter,
    ContentSourceDataVary, ContentSourceResultVc, ContentSourceVc, NeededData, ProxyResult,
};
use turbopack_node::execution_context::ExecutionContextVc;

use crate::router::{route, RouterRequest, RouterResult};

#[turbo_tasks::value(shared)]
pub struct NextRouterContentSource {
    /// A wrapped content source from which we will fetch assets.
    inner: ContentSourceVc,
    execution_context: ExecutionContextVc,
}

#[turbo_tasks::value_impl]
impl NextRouterContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(
        inner: ContentSourceVc,
        execution_context: ExecutionContextVc,
    ) -> NextRouterContentSourceVc {
        NextRouterContentSource {
            inner,
            execution_context,
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn need_data(source: ContentSourceVc, path: &str) -> ContentSourceResultVc {
    ContentSourceResultVc::need_data(
        NeededData {
            source,
            path: path.to_string(),
            vary: ContentSourceDataVary {
                method: true,
                headers: Some(ContentSourceDataFilter::All),
                query: Some(ContentSourceDataFilter::All),
                ..Default::default()
            },
        }
        .into(),
    )
}

#[turbo_tasks::value_impl]
impl ContentSource for NextRouterContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: NextRouterContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;

        let ContentSourceData {
            method: Some(method),
            headers: Some(headers),
            query: Some(query),
            ..
        } = &*data else {
            return Ok(need_data(self_vc.into(), path))
        };

        let request = RouterRequest {
            pathname: format!("/{path}"),
            method: method.clone(),
            headers: headers.clone(),
            query: query.clone(),
        }
        .cell();

        let res = route(this.execution_context, request);
        let Ok(res) = res.await else {
            return Ok(this
                .inner
                .get(path, Value::new(ContentSourceData::default())));
        };

        Ok(match &*res {
            RouterResult::Error => {
                // TODO: emit error
                this.inner
                    .get(path, Value::new(ContentSourceData::default()))
            }
            RouterResult::Rewrite(data) => {
                let path = data.url.strip_prefix('/').unwrap_or(&data.url);
                // TODO: We can't set response headers and query for a source.
                this.inner
                    .get(path, Value::new(ContentSourceData::default()))
            }
            RouterResult::FullMiddleware(data) => ContentSourceResultVc::exact(
                ContentSourceContent::HttpProxy(
                    ProxyResult {
                        status: data.headers.status_code,
                        headers: data.headers.headers.clone(),
                        body: data.body.clone().into(),
                    }
                    .cell(),
                )
                .cell()
                .into(),
            ),
        })
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for NextRouterContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("next router source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        StringVc::cell("handles routing by letting Next.js handle the routing.".to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let mut children = HashSet::new();
        if let Some(inner) = IntrospectableVc::resolve_from(self.inner).await? {
            children.insert((StringVc::cell("inner".to_string()), inner));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
