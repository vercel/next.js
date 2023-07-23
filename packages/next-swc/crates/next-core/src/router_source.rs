use anyhow::{anyhow, bail, Context, Result};
use futures::{Stream, TryStreamExt};
use indexmap::IndexSet;
use turbo_tasks::{Completion, Completions, Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        environment::ServerAddr,
        introspect::{Introspectable, IntrospectableChildren},
    },
    dev_server::source::{
        route_tree::{RouteTree, RouteType},
        Body, ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
        GetContentSourceContent, HeaderList, ProxyResult, RewriteBuilder,
    },
    node::execution_context::ExecutionContext,
};

use crate::{
    app_structure::OptionAppDir,
    next_config::NextConfig,
    pages_structure::PagesStructure,
    router::{route, RouterRequest, RouterResult},
};

#[turbo_tasks::value(shared)]
pub struct NextRouterContentSource {
    /// A wrapped content source from which we will fetch assets.
    inner: Vc<Box<dyn ContentSource>>,
    execution_context: Vc<ExecutionContext>,
    next_config: Vc<NextConfig>,
    server_addr: Vc<ServerAddr>,
    app_dir: Vc<OptionAppDir>,
    pages_structure: Vc<PagesStructure>,
}

#[turbo_tasks::value_impl]
impl NextRouterContentSource {
    #[turbo_tasks::function]
    pub fn new(
        inner: Vc<Box<dyn ContentSource>>,
        execution_context: Vc<ExecutionContext>,
        next_config: Vc<NextConfig>,
        server_addr: Vc<ServerAddr>,
        app_dir: Vc<OptionAppDir>,
        pages_structure: Vc<PagesStructure>,
    ) -> Vc<NextRouterContentSource> {
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
    app_dir: Vc<OptionAppDir>,
    pages_structure: Vc<PagesStructure>,
    next_config: Vc<NextConfig>,
) -> Vc<Completion> {
    Completions::all(vec![
        app_dir.routes_changed(next_config),
        pages_structure.routes_changed(),
    ])
}

#[turbo_tasks::value_impl]
impl ContentSource for NextRouterContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: Vc<Self>) -> Result<Vc<RouteTree>> {
        let this = self.await?;
        // The next-dev server can currently run against projects as simple as
        // `index.js`. If this isn't a Next.js project, don't try to use the Next.js
        // router.
        if this.app_dir.await?.is_none() && this.pages_structure.await?.pages.is_none() {
            return Ok(this.inner.get_routes());
        }

        // Prefetch get_routes from inner
        let _ = this.inner.get_routes();

        Ok(RouteTree::new_route(
            Vec::new(),
            RouteType::CatchAll,
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NextRouterContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
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
        self: Vc<Self>,
        path: String,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let this = self.await?;

        let ContentSourceData {
            method: Some(method),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            body: Some(body),
            ..
        } = &*data
        else {
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
                    rewrite = rewrite.response_headers(HeaderList::new(data.headers.clone()));
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
    fn ty(&self) -> Vc<String> {
        Vc::cell("next router source".to_string())
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        Vc::cell("handles routing by letting Next.js handle the routing.".to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = IndexSet::new();
        if let Some(inner) = Vc::try_resolve_sidecast::<Box<dyn Introspectable>>(self.inner).await?
        {
            children.insert((Vc::cell("inner".to_string()), inner));
        }
        Ok(Vc::cell(children))
    }
}
