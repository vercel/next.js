use std::ops::Deref;

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::Value;
use turbo_tasks_fs::{FileContent, FileSystemPathVc};

use crate::{
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        pattern::PatternVc, resolve_raw, AffectingResolvingAssetReferenceVc, ResolveResult,
        ResolveResultVc,
    },
    source_asset::SourceAssetVc,
    target::CompileTarget,
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
    pub compile_target: CompileTarget,
}

#[turbo_tasks::value_impl]
impl NodePreGypConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        context: FileSystemPathVc,
        config_file_pattern: PatternVc,
        target: Value<CompileTarget>,
    ) -> Self {
        Self::slot(NodePreGypConfigReference {
            context,
            config_file_pattern,
            compile_target: target.into_value(),
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodePreGypConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        resolve_node_pre_gyp_files(
            self.context,
            self.config_file_pattern,
            Value::new(self.compile_target),
        )
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_pre_gyp_files(
    context: FileSystemPathVc,
    config_file_pattern: PatternVc,
    compile_target: Value<CompileTarget>,
) -> Result<ResolveResultVc> {
    lazy_static! {
        static ref NAPI_VERSION_TEMPLATE: Regex =
            Regex::new(r"\{(napi_build_version|node_napi_label)\}")
                .expect("create napi_build_version regex failed");
        static ref PLATFORM_TEMPLATE: Regex =
            Regex::new(r"\{platform\}").expect("create node_platform regex failed");
        static ref ARCH_TEMPLATE: Regex =
            Regex::new(r"\{arch\}").expect("create node_arch regex failed");
        static ref LIBC_TEMPLATE: Regex =
            Regex::new(r"\{libc\}").expect("create node_libc regex failed");
    }
    let config = resolve_raw(context, config_file_pattern, true).await?;
    if let crate::resolve::ResolveResult::Single(ref config_path, _) = config.deref() {
        if let FileContent::Content(ref config_file) = config_path.content().await?.deref() {
            let config_file_path = config_path.path();
            let config_file_dir = config_file_path.parent();
            let node_pre_gyp_config: NodePreGypConfigJson =
                serde_json::from_slice(config_file.content())?;
            let assets = node_pre_gyp_config
                .binary
                .napi_versions
                .iter()
                .map(|version| {
                    let native_binding_path = NAPI_VERSION_TEMPLATE.replace(
                        node_pre_gyp_config.binary.module_path.as_str(),
                        format!("{}", version),
                    );
                    let native_binding_path =
                        PLATFORM_TEMPLATE.replace(&native_binding_path, compile_target.platform());
                    let native_binding_path =
                        ARCH_TEMPLATE.replace(&native_binding_path, compile_target.arch());
                    let native_binding_path =
                        LIBC_TEMPLATE.replace(&native_binding_path, compile_target.libc());
                    let resolved_file_vc = config_file_dir.join(
                        format!(
                            "{}/{}.node",
                            native_binding_path, node_pre_gyp_config.binary.module_name
                        )
                        .as_str(),
                    );
                    AffectingResolvingAssetReferenceVc::new(resolved_file_vc).into()
                })
                .collect();
            return Ok(
                ResolveResult::Single(SourceAssetVc::new(config_file_path).into(), assets).into(),
            );
        };
    }
    Ok(ResolveResult::Unresolveable(vec![]).into())
}
