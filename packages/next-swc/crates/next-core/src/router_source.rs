use anyhow::{anyhow, bail, Context, Result};
use futures::{Stream, TryStreamExt};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, CompletionVc, CompletionsVc, Value};
use turbopack_binding::turbopack::{
    core::{
        environment::ServerAddrVc,
        introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    },
    dev_server::source::{
        route_tree::{RouteTreeVc, RouteType},
        Body, ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
        ContentSourceDataVary, ContentSourceDataVaryVc, ContentSourceVc, GetContentSourceContent,
        GetContentSourceContentVc, HeaderListVc, ProxyResult, RewriteBuilder,
    },
    node::execution_context::ExecutionContextVc,
};

use crate::{
    app_structure::OptionAppDirVc,
    next_config::NextConfigVc,
    pages_structure::PagesStructureVc,
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
    pages_structure: PagesStructureVc,
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
        pages_structure: PagesStructureVc,
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
fn routes_changed(
    app_dir: OptionAppDirVc,
    pages_structure: PagesStructureVc,
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
    async fn get_routes(self_vc: NextRouterContentSourceVc) -> Result<RouteTreeVc> {
        let this = self_vc.await?;
        // The next-dev server can currently run against projects as simple as
        // `index.js`. If this isn't a Next.js project, don't try to use the Next.js
        // router.
        if this.app_dir.await?.is_none() && this.pages_structure.await?.pages.is_none() {
            return Ok(this.inner.get_routes());
        }

        // Prefetch get_routes from inner
        let _ = this.inner.get_routes();

        Ok(RouteTreeVc::new_route(
            Vec::new(),
            RouteType::CatchAll,
            self_vc.into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NextRouterContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            method: true,
            raw_headers: true,
            raw_query: true,
            body: true,
            ..Default::default()
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get(
        self_vc: NextRouterContentSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let this = self_vc.await?;

        let ContentSourceData {
            method: Some(method),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            body: Some(body),
            ..
        } = &*data else {
            bail!("missing data for router");
        };

        // TODO: change router so we can stream the request body to it
        let mut body_stream = body.await?.read();

        let mut body = Vec::with_capacity(body_stream.size_hint().0);
        while let Some(data) = body_stream.try_next().await? {
            body.push(data);
        }

        let request = RouterRequest {
            pathname: format!("/{path}"),
            method: method.clone(),
            raw_headers: raw_headers.clone(),
            raw_query: raw_query.clone(),
            body,
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
            RouterResult::None => {
                let rewrite =
                    RewriteBuilder::new_source_with_path_and_query(this.inner, format!("/{path}"));
                ContentSourceContent::Rewrite(rewrite.build()).cell()
            }
            RouterResult::Rewrite(data) => {
                let mut rewrite =
                    RewriteBuilder::new_source_with_path_and_query(this.inner, data.url.clone());
                if !data.headers.is_empty() {
                    rewrite = rewrite.response_headers(HeaderListVc::new(data.headers.clone()));
                }
                ContentSourceContent::Rewrite(rewrite.build()).cell()
            }
            RouterResult::Middleware(data) => ContentSourceContent::HttpProxy(
                ProxyResult {
                    status: data.status_code,
                    headers: data.headers.clone(),
                    body: Body::from_stream(data.body.read()),
                }
                .cell(),
            )
            .cell(),
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
