use std::collections::HashSet;

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::introspect::{
    asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
};
use turbopack_dev_server::source::{
    ContentSource, ContentSourceData, ContentSourceDataFilter, ContentSourceDataVary,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use super::{get_intermediate_asset, render_proxy, NodeEntryVc, RenderData};
use crate::path_regex::PathRegexVc;

/// Creates a [NodeApiContentSource].
#[turbo_tasks::function]
pub fn create_node_api_source(
    server_root: FileSystemPathVc,
    path_regex: PathRegexVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
) -> ContentSourceVc {
    NodeApiContentSource {
        server_root,
        path_regex,
        entry,
        runtime_entries,
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
struct NodeApiContentSource {
    server_root: FileSystemPathVc,
    path_regex: PathRegexVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
}

impl NodeApiContentSource {
    /// Checks if a path matches the regular expression
    async fn is_matching_path(&self, path: &str) -> Result<bool> {
        Ok(self.path_regex.await?.is_match(path))
    }

    /// Matches a path with the regular expression and returns a JSON object
    /// with the named captures
    async fn get_matches(&self, path: &str) -> Result<Option<IndexMap<String, String>>> {
        Ok(self.path_regex.await?.get_matches(path))
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for NodeApiContentSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: NodeApiContentSourceVc,
        path: &str,
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        if this.is_matching_path(path).await? {
            if let Some(params) = this.get_matches(path).await? {
                if let ContentSourceData {
                    headers: Some(headers),
                    method: Some(method),
                    url: Some(url),
                    query: Some(query),
                    body: Some(body),
                    ..
                } = &*data
                {
                    let entry = this.entry.entry(data.clone()).await?;
                    return Ok(ContentSourceResult::HttpProxy(render_proxy(
                        this.server_root.join(path),
                        entry.module,
                        this.runtime_entries,
                        entry.chunking_context,
                        entry.intermediate_output_path,
                        RenderData {
                            params,
                            method: method.clone(),
                            url: url.clone(),
                            query: query.clone(),
                            headers: headers.clone(),
                            path: format!("/{path}"),
                        }
                        .cell(),
                        *body,
                    ))
                    .cell());
                } else {
                    return Ok(ContentSourceResult::NeedData {
                        source: self_vc.into(),
                        path: path.to_string(),
                        vary: ContentSourceDataVary {
                            method: true,
                            url: true,
                            headers: Some(ContentSourceDataFilter::All),
                            query: Some(ContentSourceDataFilter::All),
                            body: true,
                            cache_buster: true,
                            ..Default::default()
                        },
                    }
                    .cell());
                }
            }
        }
        Ok(ContentSourceResult::NotFound.cell())
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
        self.path_regex.to_string()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let mut set = HashSet::new();
        for &entry in self.entry.entries().await?.iter() {
            let entry = entry.await?;
            set.insert((
                StringVc::cell("module".to_string()),
                IntrospectableAssetVc::new(entry.module.into()),
            ));
            set.insert((
                StringVc::cell("intermediate asset".to_string()),
                IntrospectableAssetVc::new(get_intermediate_asset(
                    entry.module,
                    self.runtime_entries,
                    entry.chunking_context,
                    entry.intermediate_output_path,
                )),
            ));
        }
        Ok(IntrospectableChildrenVc::cell(set))
    }
}
