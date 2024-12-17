use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::introspect::{
    module::IntrospectableModule, output_asset::IntrospectableOutputAsset, Introspectable,
    IntrospectableChildren,
};
use turbopack_dev_server::source::{
    route_tree::{BaseSegment, RouteTree, RouteType},
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
    GetContentSourceContent,
};

use super::{render_proxy::render_proxy, RenderData};
use crate::{get_intermediate_asset, node_entry::NodeEntry, route_matcher::RouteMatcher};

/// Creates a [NodeApiContentSource].
#[turbo_tasks::function]
pub fn create_node_api_source(
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: ResolvedVc<FileSystemPath>,
    route_match: ResolvedVc<Box<dyn RouteMatcher>>,
    pathname: ResolvedVc<RcStr>,
    entry: ResolvedVc<Box<dyn NodeEntry>>,
    render_data: ResolvedVc<JsonValue>,
    debug: bool,
) -> Vc<Box<dyn ContentSource>> {
    Vc::upcast(
        NodeApiContentSource {
            cwd,
            env,
            base_segments,
            route_type,
            server_root,
            pathname,
            route_match,
            entry,
            render_data,
            debug,
        }
        .cell(),
    )
}

/// A content source that proxies API requests to one-off Node.js
/// servers running the passed `entry` when it matches a `path_regex`.
///
/// It needs a temporary directory (`intermediate_output_path`) to place file
/// for Node.js execution during rendering. The `chunking_context` should emit
/// to this directory.
#[turbo_tasks::value]
pub struct NodeApiContentSource {
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: ResolvedVc<FileSystemPath>,
    pathname: ResolvedVc<RcStr>,
    route_match: ResolvedVc<Box<dyn RouteMatcher>>,
    entry: ResolvedVc<Box<dyn NodeEntry>>,
    render_data: ResolvedVc<JsonValue>,
    debug: bool,
}

#[turbo_tasks::value_impl]
impl NodeApiContentSource {
    #[turbo_tasks::function]
    pub fn get_pathname(&self) -> Vc<RcStr> {
        *self.pathname
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NodeApiContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: Vc<Self>) -> Result<Vc<RouteTree>> {
        let this = self.await?;
        Ok(RouteTree::new_route(
            this.base_segments.clone(),
            this.route_type.clone(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NodeApiContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        ContentSourceDataVary {
            method: true,
            url: true,
            original_url: true,
            raw_headers: true,
            raw_query: true,
            body: true,
            cache_buster: true,
            ..Default::default()
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get(
        &self,
        path: RcStr,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let Some(params) = &*self.route_match.params(path.clone()).await? else {
            anyhow::bail!("Non matching path provided")
        };
        let ContentSourceData {
            method: Some(method),
            url: Some(url),
            original_url: Some(original_url),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            body: Some(body),
            ..
        } = &*data
        else {
            anyhow::bail!("Missing request data")
        };
        let entry = (*self.entry).entry(data.clone()).await?;
        Ok(ContentSourceContent::HttpProxy(
            render_proxy(
                *self.cwd,
                *self.env,
                self.server_root.join(path.clone()),
                *entry.module,
                *entry.runtime_entries,
                *entry.chunking_context,
                *entry.intermediate_output_path,
                *entry.output_root,
                *entry.project_dir,
                RenderData {
                    params: params.clone(),
                    method: method.clone(),
                    url: url.clone(),
                    original_url: original_url.clone(),
                    raw_query: raw_query.clone(),
                    raw_headers: raw_headers.clone(),
                    path: format!("/{}", path).into(),
                    data: Some(self.render_data.await?),
                }
                .cell(),
                **body,
                self.debug,
            )
            .to_resolved()
            .await?,
        )
        .cell())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("node api content source".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for NodeApiContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<RcStr> {
        *self.pathname
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Vc<RcStr> {
        Vc::cell(
            format!(
                "base: {:?}\ntype: {:?}",
                self.base_segments, self.route_type
            )
            .into(),
        )
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut set = FxIndexSet::default();
        for &entry in self.entry.entries().await?.iter() {
            let entry = entry.await?;
            set.insert((
                ResolvedVc::cell("module".into()),
                IntrospectableModule::new(Vc::upcast(*entry.module)),
            ));
            set.insert((
                ResolvedVc::cell("intermediate asset".into()),
                IntrospectableOutputAsset::new(get_intermediate_asset(
                    *entry.chunking_context,
                    Vc::upcast(*entry.module),
                    *entry.runtime_entries,
                )),
            ));
        }
        Ok(Vc::cell(set))
    }
}
