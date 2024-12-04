use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    introspect::{
        module::IntrospectableModule, output_asset::IntrospectableOutputAsset, Introspectable,
        IntrospectableChildren,
    },
    issue::IssueDescriptionExt,
    module::Module,
    output::OutputAsset,
    version::VersionedContentExt,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{
        asset_graph::AssetGraphContentSource,
        conditional::ConditionalContentSource,
        lazy_instantiated::{GetContentSource, LazyInstantiatedContentSource},
        route_tree::{BaseSegment, RouteTree, RouteType},
        ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
        GetContentSourceContent, ProxyResult,
    },
};

use super::{
    render_static::{render_static, StaticResult},
    RenderData,
};
use crate::{
    external_asset_entrypoints, get_intermediate_asset, node_entry::NodeEntry,
    route_matcher::RouteMatcher,
};

/// Creates a content source that renders something in Node.js with the passed
/// `entry` when it matches a `path_regex`. Once rendered it serves
/// all assets referenced by the `entry` that are within the `server_root`.
/// It needs a temporary directory (`intermediate_output_path`) to place file
/// for Node.js execution during rendering. The `chunking_context` should emit
/// to this directory.
#[turbo_tasks::function]
pub fn create_node_rendered_source(
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: ResolvedVc<FileSystemPath>,
    route_match: ResolvedVc<Box<dyn RouteMatcher>>,
    pathname: ResolvedVc<RcStr>,
    entry: ResolvedVc<Box<dyn NodeEntry>>,
    fallback_page: ResolvedVc<DevHtmlAsset>,
    render_data: ResolvedVc<JsonValue>,
    debug: bool,
) -> Vc<Box<dyn ContentSource>> {
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
    .resolved_cell();
    Vc::upcast(ConditionalContentSource::new(
        Vc::upcast(*source),
        Vc::upcast(
            LazyInstantiatedContentSource {
                get_source: ResolvedVc::upcast(source),
            }
            .cell(),
        ),
    ))
}

/// see [create_node_rendered_source]
#[turbo_tasks::value]
pub struct NodeRenderContentSource {
    cwd: ResolvedVc<FileSystemPath>,
    env: ResolvedVc<Box<dyn ProcessEnv>>,
    base_segments: Vec<BaseSegment>,
    route_type: RouteType,
    server_root: ResolvedVc<FileSystemPath>,
    route_match: ResolvedVc<Box<dyn RouteMatcher>>,
    pathname: ResolvedVc<RcStr>,
    entry: ResolvedVc<Box<dyn NodeEntry>>,
    fallback_page: ResolvedVc<DevHtmlAsset>,
    render_data: ResolvedVc<JsonValue>,
    debug: bool,
}

#[turbo_tasks::value_impl]
impl NodeRenderContentSource {
    #[turbo_tasks::function]
    pub fn get_pathname(&self) -> Vc<RcStr> {
        *self.pathname
    }
}

#[turbo_tasks::value_impl]
impl GetContentSource for NodeRenderContentSource {
    /// Returns the [ContentSource] that serves all referenced external
    /// assets. This is wrapped into [LazyInstantiatedContentSource].
    #[turbo_tasks::function]
    async fn content_source(&self) -> Result<Vc<Box<dyn ContentSource>>> {
        let entries = self.entry.entries();
        let mut set = FxIndexSet::default();
        for &reference in self.fallback_page.references().await?.iter() {
            set.insert(reference);
        }
        for &entry in entries.await?.iter() {
            let entry = entry.await?;
            set.extend(
                external_asset_entrypoints(
                    *entry.module,
                    *entry.runtime_entries,
                    *entry.chunking_context,
                    *entry.intermediate_output_path,
                )
                .await?
                .iter()
                .copied(),
            )
        }
        Ok(Vc::upcast(AssetGraphContentSource::new_lazy_multiple(
            *self.server_root,
            Vc::cell(set),
        )))
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NodeRenderContentSource {
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
impl GetContentSourceContent for NodeRenderContentSource {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
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
        path: RcStr,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let pathname = self.pathname.await?;
        let Some(params) = &*self.route_match.params(path.clone()).await? else {
            anyhow::bail!("Non matching path ({}) provided for {}", path, pathname)
        };
        let ContentSourceData {
            method: Some(method),
            url: Some(url),
            original_url: Some(original_url),
            raw_headers: Some(raw_headers),
            raw_query: Some(raw_query),
            ..
        } = &*data
        else {
            anyhow::bail!("Missing request data")
        };
        let entry = (*self.entry).entry(data.clone()).await?;
        let result = render_static(
            *self.cwd,
            *self.env,
            self.server_root.join(path.clone()),
            *entry.module,
            *entry.runtime_entries,
            *self.fallback_page,
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
                path: pathname.as_str().into(),
                data: Some(self.render_data.await?),
            }
            .cell(),
            self.debug,
        )
        .issue_file_path(
            entry.module.ident().path(),
            format!("server-side rendering {}", pathname),
        )
        .await?;
        Ok(match *result.await? {
            StaticResult::Content {
                content,
                status_code,
                headers,
            } => ContentSourceContent::static_with_headers(
                content.versioned(),
                status_code,
                *headers,
            ),
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
                .resolved_cell(),
            )
            .cell(),
            StaticResult::Rewrite(rewrite) => ContentSourceContent::Rewrite(rewrite).cell(),
        })
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("node render content source".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for NodeRenderContentSource {
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
                Vc::cell("module".into()),
                IntrospectableModule::new(Vc::upcast(*entry.module)),
            ));
            set.insert((
                Vc::cell("intermediate asset".into()),
                IntrospectableOutputAsset::new(get_intermediate_asset(
                    *entry.chunking_context,
                    *entry.module,
                    *entry.runtime_entries,
                )),
            ));
        }
        Ok(Vc::cell(set))
    }
}
