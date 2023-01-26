use std::collections::HashSet;

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetsSetVc},
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{
        asset_graph::AssetGraphContentSourceVc,
        conditional::ConditionalContentSourceVc,
        lazy_instatiated::{GetContentSource, GetContentSourceVc, LazyInstantiatedContentSource},
        specificity::SpecificityVc,
        ContentSource, ContentSourceContent, ContentSourceContentVc, ContentSourceData,
        ContentSourceDataFilter, ContentSourceDataVary, ContentSourceDataVaryVc,
        ContentSourceResult, ContentSourceResultVc, ContentSourceVc, GetContentSourceContent,
        GetContentSourceContentVc,
    },
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use super::{render_static::render_static, RenderData};
use crate::{
    external_asset_entrypoints, get_intermediate_asset, match_params::MatchParamsVc,
    node_entry::NodeEntryVc,
};

/// Creates a content source that renders something in Node.js with the passed
/// `entry` when it matches a `path_regex`. Once rendered it serves
/// all assets referenced by the `entry` that are within the `server_root`.
/// It needs a temporary directory (`intermediate_output_path`) to place file
/// for Node.js execution during rendering. The `chunking_context` should emit
/// to this directory.
#[turbo_tasks::function]
pub fn create_node_rendered_source(
    specificity: SpecificityVc,
    server_root: FileSystemPathVc,
    pathname: StringVc,
    match_params: MatchParamsVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
) -> ContentSourceVc {
    let source = NodeRenderContentSource {
        specificity,
        server_root,
        pathname,
        match_params,
        entry,
        runtime_entries,
        fallback_page,
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
    specificity: SpecificityVc,
    server_root: FileSystemPathVc,
    pathname: StringVc,
    match_params: MatchParamsVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
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
                    .primary_assets()
                    .await?
                    .iter()
                    .copied(),
            )
        }
        for &entry in entries.await?.iter() {
            let entry = entry.await?;
            set.extend(
                external_asset_entrypoints(
                    entry.module,
                    self.runtime_entries,
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
    async fn get(
        self_vc: NodeRenderContentSourceVc,
        path: &str,
        _data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        if *this.match_params.is_match(path).await? {
            return Ok(ContentSourceResult::Result {
                specificity: this.specificity,
                get_content: NodeRenderGetContentResult {
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
struct NodeRenderGetContentResult {
    source: NodeRenderContentSourceVc,
    path: String,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for NodeRenderGetContentResult {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        ContentSourceDataVary {
            method: true,
            url: true,
            headers: Some(ContentSourceDataFilter::All),
            query: Some(ContentSourceDataFilter::All),
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
            ..
        } = &*data else {
            return Err(anyhow!("Missing request data"));
        };
        let entry = this.entry.entry(data.clone()).await?;
        let asset = render_static(
            this.server_root.join(&self.path),
            entry.module,
            this.runtime_entries,
            this.fallback_page,
            entry.chunking_context,
            entry.intermediate_output_path,
            entry.output_root,
            RenderData {
                params: params.clone(),
                method: method.clone(),
                url: url.clone(),
                query: query.clone(),
                headers: headers.clone(),
                path: format!("/{}", this.pathname.await?),
            }
            .cell(),
        );
        Ok(ContentSourceContent::Static(asset.into()).cell())
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
