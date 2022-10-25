use anyhow::Result;
use indexmap::IndexSet;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{glob::GlobVc, DirectoryEntry, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{AssetContent, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        pattern::{Pattern, PatternVc},
        resolve_raw, AffectingResolvingAssetReferenceVc, ResolveResult, ResolveResultVc,
    },
    source_asset::SourceAssetVc,
    target::{CompileTargetVc, Platform},
};

use crate::references::raw::SourceAssetReferenceVc;

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

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
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
        compile_target: CompileTargetVc,
    ) -> Self {
        Self::cell(NodePreGypConfigReference {
            context,
            config_file_pattern,
            compile_target,
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

#[turbo_tasks::value_impl]
impl ValueToString for NodePreGypConfigReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "node-gyp in {} with {} for {}",
            self.context.to_string().await?,
            self.config_file_pattern.to_string().await?,
            self.compile_target.await?
        )))
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
        if let AssetContent::File(file) = &*config_path.content().await? {
            if let FileContent::Content(ref config_file) = &*file.await? {
                let config_file_path = config_path.path();
                let config_file_dir = config_file_path.parent();
                let node_pre_gyp_config: NodePreGypConfigJson =
                    serde_json::from_slice(config_file.content())?;
                let mut assets: IndexSet<AssetVc> = IndexSet::new();
                for version in node_pre_gyp_config.binary.napi_versions.iter() {
                    let native_binding_path = NAPI_VERSION_TEMPLATE.replace(
                        node_pre_gyp_config.binary.module_path.as_str(),
                        format!("{}", version),
                    );
                    let platform = compile_target.platform;
                    let native_binding_path =
                        PLATFORM_TEMPLATE.replace(&native_binding_path, platform.as_str());
                    let native_binding_path =
                        ARCH_TEMPLATE.replace(&native_binding_path, compile_target.arch.as_str());
                    let native_binding_path = LIBC_TEMPLATE.replace(
                        &native_binding_path,
                        // node-pre-gyp only cares about libc on linux
                        if platform == Platform::Linux {
                            compile_target.libc.as_str()
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
                    for (_, entry) in config_file_dir
                        .join(native_binding_path.as_ref())
                        .read_glob(
                            GlobVc::new(format!("*.{}", compile_target.dylib_ext()).as_str()),
                            false,
                        )
                        .await?
                        .results
                        .iter()
                    {
                        if let DirectoryEntry::File(dylib) | DirectoryEntry::Symlink(dylib) = entry
                        {
                            assets.insert(SourceAssetVc::new(*dylib).into());
                        }
                    }
                    assets.insert(SourceAssetVc::new(resolved_file_vc).into());
                }
                for entry in config_path
                    .path()
                    .parent()
                    // TODO
                    // read the dependencies path from `bindings.gyp`
                    .join("deps/lib")
                    .read_glob(GlobVc::new("*".to_string().as_str()), false)
                    .await?
                    .results
                    .values()
                {
                    match entry {
                        DirectoryEntry::File(dylib) => {
                            assets.insert(SourceAssetVc::new(*dylib).into());
                        }
                        DirectoryEntry::Symlink(dylib) => {
                            let realpath_with_links = dylib.realpath_with_links().await?;
                            for symlink in realpath_with_links.symlinks.iter() {
                                assets.insert(SourceAssetVc::new(*symlink).into());
                            }
                            assets.insert(SourceAssetVc::new(*dylib).into());
                        }
                        _ => {}
                    }
                }
                return Ok(ResolveResult::Alternatives(
                    assets.into_iter().collect(),
                    vec![AffectingResolvingAssetReferenceVc::new(config_file_path).into()],
                )
                .into());
            }
        };
    }
    Ok(ResolveResult::unresolveable().into())
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct NodeGypBuildReference {
    pub context: FileSystemPathVc,
    pub compile_target: CompileTargetVc,
}

#[turbo_tasks::value_impl]
impl NodeGypBuildReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: FileSystemPathVc, target: CompileTargetVc) -> Self {
        Self::cell(NodeGypBuildReference {
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

#[turbo_tasks::value_impl]
impl ValueToString for NodeGypBuildReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "node-gyp in {} for {}",
            self.context.to_string().await?,
            self.compile_target.await?
        )))
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
        if let AssetContent::File(file) = &*binding_gyp.content().await? {
            if let FileContent::Content(config_file) = &*file.await? {
                if let Some(captured) =
                    GYP_BUILD_TARGET_NAME.captures(std::str::from_utf8(config_file.content())?)
                {
                    let mut resolved: IndexSet<AssetVc> = IndexSet::with_capacity(captured.len());
                    for found in captured.iter().skip(1).flatten() {
                        let name = found.as_str();
                        let target_path = context.join("build").join("Release");
                        let resolved_prebuilt_file = resolve_raw(
                            target_path,
                            PatternVc::new(Pattern::Constant(format!("{}.node", name))),
                            true,
                        )
                        .await?;
                        if let ResolveResult::Single(file, references) = &*resolved_prebuilt_file {
                            resolved.insert(SourceAssetVc::new(file.path()).into());
                            merged_references.extend_from_slice(references);
                        }
                    }
                    if !resolved.is_empty() {
                        return Ok(ResolveResult::Alternatives(
                            resolved.into_iter().collect(),
                            merged_references,
                        )
                        .into());
                    }
                }
            }
        }
    }
    let compile_target = compile_target.await?;
    let arch = compile_target.arch;
    let platform = compile_target.platform;
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

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct NodeBindingsReference {
    pub context: FileSystemPathVc,
    pub file_name: String,
}

#[turbo_tasks::value_impl]
impl NodeBindingsReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: FileSystemPathVc, file_name: String) -> Self {
        Self::cell(NodeBindingsReference { context, file_name })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodeBindingsReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        resolve_node_bindings_files(self.context, self.file_name.clone())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodeBindingsReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "bindings in {}",
            self.context.to_string().await?,
        )))
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_bindings_files(
    context: FileSystemPathVc,
    file_name: String,
) -> Result<ResolveResultVc> {
    lazy_static! {
        static ref BINDINGS_TRY: [&'static str; 5] = [
            "build/bindings",
            "build/Release",
            "build/Release/bindings",
            "out/Release/bindings",
            "Release/bindings",
        ];
    }
    let mut root_context = context;
    loop {
        if let ResolveResult::Single(file, _) = &*resolve_raw(
            root_context,
            Pattern::Constant("package.json".to_owned()).into(),
            true,
        )
        .await?
        {
            if let AssetContent::File(file) = &*file.content().await? {
                if let FileContent::Content(_) = &*file.await? {
                    break;
                }
            }
        };
        let current_context = root_context.await?;
        let parent = root_context.parent();
        let parent_context = parent.await?;
        if parent_context.path == current_context.path {
            break;
        }
        root_context = parent;
    }
    let bindings_try: Vec<AssetVc> = BINDINGS_TRY
        .iter()
        .map(|try_dir| {
            SourceAssetVc::new(root_context.join(&format!("{}/{}", try_dir, &file_name))).into()
        })
        .collect();

    Ok(ResolveResult::Alternatives(
        bindings_try,
        vec![SourceAssetReferenceVc::new(
            SourceAssetVc::new(root_context).into(),
            Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(file_name)]).into(),
        )
        .into()],
    )
    .into())
}
