use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    primitives::{JsonValueVc, StringVc},
    Value,
};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::introspect::{
    asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
};
use turbopack_dev_server::source::{
    route_tree::{BaseSegment, RouteTreeVc, RouteType},
    ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
    ContentSourceDataVary, ContentSourceDataVaryVc, ContentSourceVc, GetContentSourceContent,
    GetContentSourceContentVc,
};

use super::{render_proxy::render_proxy, RenderData};
use crate::{
    get_intermediate_asset,
    node_entry::{NodeEntry, NodeEntryVc},
    route_matcher::{RouteMatcher, RouteMatcherVc},
};

/// Creates a [NodeApiContentSource].
#[turbo_tasks::function]
pub fn create_node_api_source(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: FileSystemPathVc,
    route_match: RouteMatcherVc,
    pathname: StringVc,
    entry: NodeEntryVc,
    render_data: JsonValueVc,
    debug: bool,
) -> ContentSourceVc {
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
    .cell()
    .into()
}

/// A content source that proxies API requests to one-off Node.js
/// servers running the passed `entry` when it matches a `path_regex`.
///
/// It needs a temporary directory (`intermediate_output_path`) to place file
/// for Node.js execution during rendering. The `chunking_context` should emit
/// to this directory.
#[turbo_tasks::value]
pub struct NodeApiContentSource {
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: FileSystemPathVc,
    pathname: StringVc,
    route_match: RouteMatcherVc,
    entry: NodeEntryVc,
    render_data: JsonValueVc,
    debug: bool,
}

#[turbo_tasks::value_impl]
impl NodeApiContentSourceVc {
    #[turbo_tasks::function]
    pub async fn get_pathname(self) -> Result<StringVc> {
        Ok(self.await?.pathname)
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NodeApiContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self_vc: NodeApiContentSourceVc) -> Result<RouteTreeVc> {
        let this = self_vc.await?;
        Ok(RouteTreeVc::new_route(
            this.base_segments.clone(),
            this.route_type.clone(),
            self_vc.into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NodeApiContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
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
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let Some(params) = &*self.route_match.params(path).await? else {
            return Err(anyhow!("Non matching path provided"));
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
            return Err(anyhow!("Missing request data"));
        };
        let entry = self.entry.entry(data.clone()).await?;
        Ok(ContentSourceContent::HttpProxy(render_proxy(
            self.cwd,
            self.env,
            self.server_root.join(path),
            entry.module,
            entry.runtime_entries,
            entry.chunking_context,
            entry.intermediate_output_path,
            entry.output_root,
            entry.project_dir,
            RenderData {
                params: params.clone(),
                method: method.clone(),
                url: url.clone(),
                original_url: original_url.clone(),
                raw_query: raw_query.clone(),
                raw_headers: raw_headers.clone(),
                path: format!("/{}", path),
                data: Some(self.render_data.await?),
            }
            .cell(),
            *body,
            self.debug,
        ))
        .cell())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("node api content source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for NodeApiContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.pathname
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "base: {:?}\ntype: {:?}",
            self.base_segments, self.route_type
        )))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let mut set = IndexSet::new();
        for &entry in self.entry.entries().await?.iter() {
            let entry = entry.await?;
            set.insert((
                StringVc::cell("module".to_string()),
                IntrospectableAssetVc::new(entry.module.into()),
            ));
            set.insert((
                StringVc::cell("intermediate asset".to_string()),
                IntrospectableAssetVc::new(get_intermediate_asset(
                    entry.chunking_context,
                    entry.module,
                    entry.runtime_entries,
                )),
            ));
        }
        Ok(IntrospectableChildrenVc::cell(set))
    }
}
