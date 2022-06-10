use std::collections::HashSet;

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::Value;
use turbo_tasks_fs::{FileContent, FileSystemPathVc};

use crate::target::{CompileTarget, CompileTargetVc, Platform};
use turbopack_core::{
    asset::AssetVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        pattern::{Pattern, PatternVc},
        resolve_raw, AffectingResolvingAssetReferenceVc, ResolveResult, ResolveResultVc,
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
    pub compile_target: CompileTargetVc,
}

#[turbo_tasks::value_impl]
impl NodePreGypConfigReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        context: FileSystemPathVc,
        config_file_pattern: PatternVc,
        target: CompileTargetVc,
    ) -> Self {
        Self::slot(NodePreGypConfigReference {
            context,
            config_file_pattern,
            compile_target: target,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodePreGypConfigReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        resolve_node_pre_gyp_files(self.context, self.config_file_pattern, self.compile_target)
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_pre_gyp_files(
    context: FileSystemPathVc,
    config_file_pattern: PatternVc,
    compile_target: CompileTargetVc,
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
    let compile_target = compile_target.await?;
    if let ResolveResult::Single(ref config_path, _) = &*config {
        if let FileContent::Content(ref config_file) = &*config_path.content().await? {
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
                    let platform = compile_target.platform();
                    let native_binding_path =
                        PLATFORM_TEMPLATE.replace(&native_binding_path, platform);
                    let native_binding_path =
                        ARCH_TEMPLATE.replace(&native_binding_path, compile_target.arch());
                    let native_binding_path = LIBC_TEMPLATE.replace(
                        &native_binding_path,
                        // node-pre-gyp only cares about libc on linux
                        if platform == Platform::Linux.to_str() {
                            compile_target.libc()
                        } else {
                            "unknown"
                        },
                    );
                    let resolved_file_vc = config_file_dir.join(
                        format!(
                            "{}/{}.node",
                            native_binding_path, node_pre_gyp_config.binary.module_name
                        )
                        .as_str(),
                    );
                    SourceAssetVc::new(resolved_file_vc.into()).into()
                })
                .collect();
            return Ok(ResolveResult::Alternatives(
                assets,
                vec![AffectingResolvingAssetReferenceVc::new(config_file_path).into()],
            )
            .into());
        };
    }
    Ok(ResolveResult::unresolveable().into())
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Clone, Debug, PartialEq, Eq)]
pub struct NodeGypBuildReference {
    pub context: FileSystemPathVc,
    pub compile_target: CompileTargetVc,
}

#[turbo_tasks::value_impl]
impl NodeGypBuildReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: FileSystemPathVc, target: CompileTargetVc) -> Self {
        Self::slot(NodeGypBuildReference {
            context,
            compile_target: target,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodeGypBuildReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        resolve_node_gyp_build_files(self.context, self.compile_target)
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_gyp_build_files(
    context: FileSystemPathVc,
    compile_target: CompileTargetVc,
) -> Result<ResolveResultVc> {
    lazy_static! {
        static ref GYP_BUILD_TARGET_NAME: Regex =
            Regex::new(r#"['"]target_name['"]\s*:\s*(?:"(.*?)"|'(.*?)')"#)
                .expect("create napi_build_version regex failed");
    }
    let binding_gyp_pat = PatternVc::new(Pattern::Constant("binding.gyp".to_owned()));
    let gyp_file = resolve_raw(context, binding_gyp_pat, true).await?;
    if let ResolveResult::Single(binding_gyp, gyp_file_references) = &*gyp_file {
        let mut merged_references = gyp_file_references.clone();
        if let FileContent::Content(config_file) = &*binding_gyp.content().await? {
            if let Some(captured) =
                GYP_BUILD_TARGET_NAME.captures(std::str::from_utf8(config_file.content())?)
            {
                let mut resolved: HashSet<AssetVc> = HashSet::with_capacity(captured.len());
                for found in captured.iter().skip(1).filter_map(|capture| capture) {
                    let name = found.as_str();
                    let target_path = context.join("build").join("Release");
                    let resolved_prebuilt_file = resolve_raw(
                        target_path,
                        PatternVc::new(Pattern::Constant(format!("{}.node", name))),
                        true,
                    )
                    .await?;
                    if let ResolveResult::Single(file, references) = &*resolved_prebuilt_file {
                        resolved.insert(SourceAssetVc::new(file.path().into()).into());
                        merged_references.extend_from_slice(references);
                    }
                }
                if !resolved.is_empty() {
                    return Ok(ResolveResult::Alternatives(resolved, merged_references).into());
                }
            }
        }
    }
    let compile_target = compile_target.await?;
    let arch = compile_target.arch();
    let platform = compile_target.platform();
    let prebuilt_dir = format!("{}-{}", platform, arch);
    Ok(resolve_raw(
        context,
        Pattern::Concatenation(vec![
            Pattern::Constant(format!("prebuilds/{}/", prebuilt_dir)),
            Pattern::Dynamic,
            Pattern::Constant(".node".to_owned()),
        ])
        .into(),
        true,
    ))
}
