use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{
    primitives::{JsonValueVc, StringVc},
    Value,
};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetsSetVc},
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    issue::IssueContextExt,
    reference::AssetReference,
    resolve::PrimaryResolveResult,
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        asset_graph::AssetGraphContentSourceVc,
        conditional::ConditionalContentSourceVc,
        lazy_instantiated::{GetContentSource, GetContentSourceVc, LazyInstantiatedContentSource},
        route_tree::{BaseSegment, RouteTreeVc, RouteType},
        ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
        ContentSourceDataVary, ContentSourceDataVaryVc, ContentSourceVc, GetContentSourceContent,
        GetContentSourceContentVc, ProxyResult,
    },
};

use super::{
    render_static::{render_static, StaticResult},
    RenderData,
};
use crate::{
    external_asset_entrypoints, get_intermediate_asset,
    node_entry::{NodeEntry, NodeEntryVc},
    route_matcher::{RouteMatcher, RouteMatcherVc},
};

/// Creates a content source that renders something in Node.js with the passed
/// `entry` when it matches a `path_regex`. Once rendered it serves
/// all assets referenced by the `entry` that are within the `server_root`.
/// It needs a temporary directory (`intermediate_output_path`) to place file
/// for Node.js execution during rendering. The `chunking_context` should emit
/// to this directory.
#[turbo_tasks::function]
pub fn create_node_rendered_source(
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: FileSystemPathVc,
    route_match: RouteMatcherVc,
    pathname: StringVc,
    entry: NodeEntryVc,
    fallback_page: DevHtmlAssetVc,
    render_data: JsonValueVc,
    debug: bool,
) -> ContentSourceVc {
    let source = NodeRenderContentSource {
        cwd,
        env,
        base_segments,
        route_type,
        server_root,
        route_match,
        pathname,
        entry,
        fallback_page,
        render_data,
        debug,
    }
    .cell();
    ConditionalContentSourceVc::new(
        source.into(),
        LazyInstantiatedContentSource {
            get_source: source.as_get_content_source(),
        }
        .cell()
        .into(),
    )
    .into()
}

/// see [create_node_rendered_source]
#[turbo_tasks::value]
pub struct NodeRenderContentSource {
    cwd: FileSystemPathVc,
    env: ProcessEnvVc,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: FileSystemPathVc,
    route_match: RouteMatcherVc,
    pathname: StringVc,
    entry: NodeEntryVc,
    fallback_page: DevHtmlAssetVc,
    render_data: JsonValueVc,
    debug: bool,
}

#[turbo_tasks::value_impl]
impl NodeRenderContentSourceVc {
    #[turbo_tasks::function]
    pub async fn get_pathname(self) -> Result<StringVc> {
        Ok(self.await?.pathname)
    }
}

#[turbo_tasks::value_impl]
impl GetContentSource for NodeRenderContentSource {
    /// Returns the [ContentSource] that serves all referenced external
    /// assets. This is wrapped into [LazyInstantiatedContentSource].
    #[turbo_tasks::function]
    async fn content_source(&self) -> Result<ContentSourceVc> {
        let entries = self.entry.entries();
        let mut set = IndexSet::new();
        for reference in self.fallback_page.references().await?.iter() {
            set.extend(
                reference
                    .resolve_reference()
                    .await?
                    .primary
                    .iter()
                    .filter_map(|result| {
                        if let PrimaryResolveResult::Asset(asset) = result {
                            Some(asset)
                        } else {
                            None
                        }
                    }),
            )
        }
        for &entry in entries.await?.iter() {
            let entry = entry.await?;
            set.extend(
                external_asset_entrypoints(
                    entry.module,
                    entry.runtime_entries,
                    entry.chunking_context,
                    entry.intermediate_output_path,
                )
                .await?
                .iter()
                .copied(),
            )
        }
        Ok(
            AssetGraphContentSourceVc::new_lazy_multiple(self.server_root, AssetsSetVc::cell(set))
                .into(),
        )
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NodeRenderContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self_vc: NodeRenderContentSourceVc) -> Result<RouteTreeVc> {
        let this = self_vc.await?;
        Ok(RouteTreeVc::new_route(
            this.base_segments.clone(),
            this.route_type.clone(),
            self_vc.into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NodeRenderContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            method: true,
            url: true,
            original_url: true,
            raw_headers: true,
            raw_query: true,
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
            return Err(anyhow!("Non matching path ({}) provided for {}", path, self.pathname.await?));
        };
        let ContentSourceData {
            method: Some(method),
            url: Some(url),
            original_url: Some(original_url),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            ..
        } = &*data else {
            return Err(anyhow!("Missing request data"));
        };
        let entry = self.entry.entry(data.clone()).await?;
        let result = render_static(
            self.cwd,
            self.env,
            self.server_root.join(path),
            entry.module,
            entry.runtime_entries,
            self.fallback_page,
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
                path: self.pathname.await?.clone_value(),
                data: Some(self.render_data.await?),
            }
            .cell(),
            self.debug,
        )
        .issue_context(
            entry.module.ident().path(),
            format!("server-side rendering {}", self.pathname.await?),
        )
        .await?;
        Ok(match *result.await? {
            StaticResult::Content {
                content,
                status_code,
                headers,
            } => ContentSourceContentVc::static_with_headers(content.into(), status_code, headers),
            StaticResult::StreamedContent {
                status,
                headers,
                ref body,
            } => ContentSourceContent::HttpProxy(
                ProxyResult {
                    status,
                    headers: headers.await?.clone_value(),
                    body: body.clone(),
                }
                .cell(),
            )
            .cell(),
            StaticResult::Rewrite(rewrite) => ContentSourceContent::Rewrite(rewrite).cell(),
        })
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("node render content source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for NodeRenderContentSource {
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
