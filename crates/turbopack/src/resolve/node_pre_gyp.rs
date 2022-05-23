use std::ops::Deref;

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks_fs::{FileContent, FileSystemPathVc};

use crate::{
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        pattern::PatternVc, resolve_raw, AffectingResolvingAssetReferenceVc, ResolveResult,
        ResolveResultVc,
    },
    source_asset::SourceAssetVc,
};

#[derive(Serialize, Deserialize, Debug)]
struct NodePreGypConfigJson {
    binary: NodePreGypConfig,
}

#[derive(Serialize, Deserialize, Debug)]
struct NodePreGypConfig {
    module_name: String,
    module_path: String,
    napi_versions: Vec<u8>,
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct NodePreGypConfigReference {
    pub context: FileSystemPathVc,
    pub config_file_pattern: PatternVc,
}

#[turbo_tasks::value_impl]
impl NodePreGypConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: FileSystemPathVc, config_file_pattern: PatternVc) -> Self {
        Self::slot(NodePreGypConfigReference {
            context,
            config_file_pattern,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodePreGypConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        resolve_node_pre_gyp_files(self.context, self.config_file_pattern)
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_pre_gyp_files(
    context: FileSystemPathVc,
    config_file_pattern: PatternVc,
) -> Result<ResolveResultVc> {
    lazy_static! {
        static ref NODE_GYP_CONFIG_TEMPLATE: Regex =
            Regex::new(r"\{(napi_build_version|node_napi_label)\}")
                .expect("create napi_build_version regex failed");
    }
    let config = resolve_raw(context, config_file_pattern, true).await?;
    if let crate::resolve::ResolveResult::Single(ref config_path, _) = config.deref() {
        if let FileContent::Content(ref config_file) = config_path.content().await?.deref() {
            let node_pre_gyp_config: NodePreGypConfigJson =
                serde_json::from_slice(config_file.content())?;
            let assets = node_pre_gyp_config
                .binary
                .napi_versions
                .iter()
                .map(|version| {
                    let native_binding_path = NODE_GYP_CONFIG_TEMPLATE.replace(
                        node_pre_gyp_config.binary.module_path.as_str(),
                        format!("{}", version),
                    );
                    let resolved_file_vc = context.join(
                        format!(
                            "{}/{}.node",
                            native_binding_path, node_pre_gyp_config.binary.module_name
                        )
                        .as_str(),
                    );
                    AffectingResolvingAssetReferenceVc::new(resolved_file_vc).into()
                })
                .collect();
            return Ok(ResolveResult::Single(SourceAssetVc::new(context).into(), assets).into());
        };
    }
    Ok(ResolveResult::Unresolveable(vec![]).into())
}
