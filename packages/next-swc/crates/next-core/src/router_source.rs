use anyhow::{anyhow, Context, Result};
use indexmap::IndexSet;
use turbo_binding::turbopack::{
    core::{
        environment::ServerAddrVc,
        introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    },
    dev_server::source::{
        Body, ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
        ContentSourceResultVc, ContentSourceVc, HeaderListVc, NeededData, ProxyResult,
        RewriteBuilder,
    },
    node::execution_context::ExecutionContextVc,
};
use turbo_tasks::{primitives::StringVc, CompletionVc, CompletionsVc, Value};

use crate::{
    app_structure::OptionAppDirVc,
    next_config::NextConfigVc,
    pages_structure::OptionPagesStructureVc,
    router::{route, RouterRequest, RouterResult},
};

#[turbo_tasks::value(shared)]
pub struct NextRouterContentSource {
    /// A wrapped content source from which we will fetch assets.
    inner: ContentSourceVc,
    execution_context: ExecutionContextVc,
    next_config: NextConfigVc,
    server_addr: ServerAddrVc,
    app_dir: OptionAppDirVc,
    pages_structure: OptionPagesStructureVc,
}

#[turbo_tasks::value_impl]
impl NextRouterContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(
        inner: ContentSourceVc,
        execution_context: ExecutionContextVc,
        next_config: NextConfigVc,
        server_addr: ServerAddrVc,
        app_dir: OptionAppDirVc,
        pages_structure: OptionPagesStructureVc,
    ) -> NextRouterContentSourceVc {
        NextRouterContentSource {
            inner,
            execution_context,
            next_config,
            server_addr,
            app_dir,
            pages_structure,
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
                raw_headers: true,
                raw_query: true,
                ..Default::default()
            },
        }
        .into(),
    )
}

#[turbo_tasks::function]
fn routes_changed(
    app_dir: OptionAppDirVc,
    pages_structure: OptionPagesStructureVc,
    next_config: NextConfigVc,
) -> CompletionVc {
    CompletionsVc::all(vec![
        app_dir.routes_changed(next_config),
        pages_structure.routes_changed(),
    ])
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

        // The next-dev server can currently run against projects as simple as
        // `index.js`. If this isn't a Next.js project, don't try to use the Next.js
        // router.
        if this.app_dir.await?.is_none() && this.pages_structure.await?.is_none() {
            return Ok(this
                .inner
                .get(path, Value::new(ContentSourceData::default())));
        }

        let ContentSourceData {
            method: Some(method),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            ..
        } = &*data else {
            return Ok(need_data(self_vc.into(), path))
        };

        let request = RouterRequest {
            pathname: format!("/{path}"),
            method: method.clone(),
            raw_headers: raw_headers.clone(),
            raw_query: raw_query.clone(),
        }
        .cell();

        let res = route(
            this.execution_context,
            request,
            this.next_config,
            this.server_addr,
            routes_changed(this.app_dir, this.pages_structure, this.next_config),
        );

        let res = res
            .await
            .with_context(|| format!("failed to fetch /{path}{}", formated_query(raw_query)))?;

        Ok(match &*res {
            RouterResult::Error(e) => {
                return Err(anyhow!(e.clone()).context(format!(
                    "error during Next.js routing for /{path}{}",
                    formated_query(raw_query)
                )))
            }
            RouterResult::None => this
                .inner
                .get(path, Value::new(ContentSourceData::default())),
            RouterResult::Rewrite(data) => {
                let mut rewrite = RewriteBuilder::new(data.url.clone()).content_source(this.inner);
                if !data.headers.is_empty() {
                    rewrite = rewrite.response_headers(HeaderListVc::new(data.headers.clone()));
                }
                ContentSourceResultVc::exact(
                    ContentSourceContent::Rewrite(rewrite.build()).cell().into(),
                )
            }
            RouterResult::Middleware(data) => ContentSourceResultVc::exact(
                ContentSourceContent::HttpProxy(
                    ProxyResult {
                        status: data.status_code,
                        headers: data.headers.clone(),
                        body: Body::from_stream(data.body.read()),
                    }
                    .cell(),
                )
                .cell()
                .into(),
            ),
        })
    }
}

fn formated_query(query: &str) -> String {
    if query.is_empty() {
        "".to_string()
    } else {
        format!("?{query}")
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
        let mut children = IndexSet::new();
        if let Some(inner) = IntrospectableVc::resolve_from(self.inner).await? {
            children.insert((StringVc::cell("inner".to_string()), inner));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
