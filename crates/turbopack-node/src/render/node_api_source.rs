use std::collections::HashSet;

use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::introspect::{
    asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
};
use turbopack_dev_server::source::{
    specificity::SpecificityVc, ContentSource, ContentSourceContent, ContentSourceContentVc,
    ContentSourceData, ContentSourceDataFilter, ContentSourceDataVary, ContentSourceDataVaryVc,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc, GetContentSourceContent,
    GetContentSourceContentVc,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use super::{render_proxy::render_proxy, RenderData};
use crate::{get_intermediate_asset, match_params::MatchParamsVc, node_entry::NodeEntryVc};

/// Creates a [NodeApiContentSource].
#[turbo_tasks::function]
pub fn create_node_api_source(
    specificity: SpecificityVc,
    server_root: FileSystemPathVc,
    pathname: StringVc,
    match_params: MatchParamsVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
) -> ContentSourceVc {
    NodeApiContentSource {
        specificity,
        server_root,
        pathname,
        match_params,
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
pub struct NodeApiContentSource {
    specificity: SpecificityVc,
    server_root: FileSystemPathVc,
    pathname: StringVc,
    match_params: MatchParamsVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
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
    async fn get(
        self_vc: NodeApiContentSourceVc,
        path: &str,
        _data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        if *this.match_params.is_match(path).await? {
            return Ok(ContentSourceResult::Result {
                specificity: this.specificity,
                get_content: NodeApiGetContentResult {
                    source: self_vc,
                    path: path.to_string(),
                }
                .cell()
                .into(),
            }
            .cell());
        }
        Ok(ContentSourceResultVc::not_found())
    }
}

#[turbo_tasks::value]
struct NodeApiGetContentResult {
    source: NodeApiContentSourceVc,
    path: String,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NodeApiGetContentResult {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            method: true,
            url: true,
            headers: Some(ContentSourceDataFilter::All),
            query: Some(ContentSourceDataFilter::All),
            body: true,
            cache_buster: true,
            ..Default::default()
        }
        .cell()
    }
    #[turbo_tasks::function]
    async fn get(&self, data: Value<ContentSourceData>) -> Result<ContentSourceContentVc> {
        let this = self.source.await?;
        let Some(params) = &*this.match_params.get_matches(&self.path).await? else {
            return Err(anyhow!("Non matching path provided"));
        };
        let ContentSourceData {
            method: Some(method),
            url: Some(url),
            headers: Some(headers),
            query: Some(query),
            body: Some(body),
            ..
        } = &*data else {
            return Err(anyhow!("Missing request data"));
        };
        let entry = this.entry.entry(data.clone()).await?;
        Ok(ContentSourceContent::HttpProxy(render_proxy(
            this.server_root.join(&self.path),
            entry.module,
            this.runtime_entries,
            entry.chunking_context,
            entry.intermediate_output_path,
            entry.output_root,
            RenderData {
                params: params.clone(),
                method: method.clone(),
                url: url.clone(),
                query: query.clone(),
                headers: headers.clone(),
                path: format!("/{}", self.path),
            }
            .cell(),
            *body,
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
        self.match_params.to_string()
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "Specificity: {}",
            self.specificity.await?
        )))
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
                    entry
                        .module
                        .as_evaluated_chunk(entry.chunking_context, Some(self.runtime_entries)),
                    entry.intermediate_output_path,
                )),
            ));
        }
        Ok(IntrospectableChildrenVc::cell(set))
    }
}
