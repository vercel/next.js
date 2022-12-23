use std::collections::HashSet;

use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use turbo_tasks::{primitives::StringVc, ValueToString};
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
        ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataFilter,
        ContentSourceDataVary, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
        NeededData,
    },
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceablesVc;

use super::{render_static::render_static, RenderData};
use crate::{
    external_asset_entrypoints, get_intermediate_asset, node_entry::NodeEntryVc,
    path_regex::PathRegexVc,
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
    path_regex: PathRegexVc,
    entry: NodeEntryVc,
    runtime_entries: EcmascriptChunkPlaceablesVc,
    fallback_page: DevHtmlAssetVc,
) -> ContentSourceVc {
    let source = NodeRenderContentSource {
        specificity,
        server_root,
        pathname,
        path_regex,
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
    path_regex: PathRegexVc,
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

impl NodeRenderContentSource {
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
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        if this.is_matching_path(path).await? {
            if let Some(params) = this.get_matches(path).await? {
                let content = if let ContentSourceData {
                    method: Some(method),
                    url: Some(url),
                    headers: Some(headers),
                    query: Some(query),
                    ..
                } = &*data
                {
                    let entry = this.entry.entry(data.clone()).await?;
                    let asset = render_static(
                        this.server_root.join(path),
                        entry.module,
                        this.runtime_entries,
                        this.fallback_page,
                        entry.chunking_context,
                        entry.intermediate_output_path,
                        RenderData {
                            params,
                            method: method.clone(),
                            url: url.clone(),
                            query: query.clone(),
                            headers: headers.clone(),
                            path: format!("/{}", this.pathname.await?),
                        }
                        .cell(),
                    );
                    ContentSourceContent::Static(asset.into()).cell()
                } else {
                    ContentSourceContent::NeedData(NeededData {
                        source: self_vc.into(),
                        path: path.to_string(),
                        vary: ContentSourceDataVary {
                            method: true,
                            url: true,
                            headers: Some(ContentSourceDataFilter::All),
                            query: Some(ContentSourceDataFilter::All),
                            ..Default::default()
                        },
                    })
                    .cell()
                };
                return Ok(ContentSourceResult {
                    specificity: this.specificity,
                    content,
                }
                .cell());
            }
        }
        Ok(ContentSourceResultVc::not_found())
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
        self.path_regex.to_string()
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
