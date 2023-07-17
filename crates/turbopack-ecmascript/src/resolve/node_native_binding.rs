use anyhow::Result;
use indexmap::IndexSet;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{
    glob::Glob, json::parse_json_rope_with_source_context, DirectoryEntry, FileContent,
    FileSystemPath,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    file_source::FileSource,
    module::{convert_asset_to_module, Module},
    reference::AssetReference,
    resolve::{
        pattern::Pattern, resolve_raw, AffectingResolvingAssetReference, PrimaryResolveResult,
        ResolveResult,
    },
    target::{CompileTarget, Platform},
};

use crate::references::raw::FileSourceReference;

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
    pub context: Vc<FileSystemPath>,
    pub config_file_pattern: Vc<Pattern>,
    pub compile_target: Vc<CompileTarget>,
}

#[turbo_tasks::value_impl]
impl NodePreGypConfigReference {
    #[turbo_tasks::function]
    pub fn new(
        context: Vc<FileSystemPath>,
        config_file_pattern: Vc<Pattern>,
        compile_target: Vc<CompileTarget>,
    ) -> Vc<Self> {
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
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        resolve_node_pre_gyp_files(self.context, self.config_file_pattern, self.compile_target)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodePreGypConfigReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "node-gyp in {} with {} for {}",
            self.context.to_string().await?,
            self.config_file_pattern.to_string().await?,
            self.compile_target.await?
        )))
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_pre_gyp_files(
    context: Vc<FileSystemPath>,
    config_file_pattern: Vc<Pattern>,
    compile_target: Vc<CompileTarget>,
) -> Result<Vc<ResolveResult>> {
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
    let config = resolve_raw(context, config_file_pattern, true)
        .first_asset()
        .await?;
    let compile_target = compile_target.await?;
    if let Some(config_asset) = *config {
        let config_asset = convert_asset_to_module(config_asset);
        if let AssetContent::File(file) = &*config_asset.content().await? {
            if let FileContent::Content(ref config_file) = &*file.await? {
                let config_file_path = config_asset.ident().path();
                let config_file_dir = config_file_path.parent();
                let node_pre_gyp_config: NodePreGypConfigJson =
                    parse_json_rope_with_source_context(config_file.content())?;
                let mut assets: IndexSet<Vc<Box<dyn Asset>>> = IndexSet::new();
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
                    let resolved_file_vc = config_file_dir.join(format!(
                        "{}/{}.node",
                        native_binding_path, node_pre_gyp_config.binary.module_name
                    ));
                    for (_, entry) in config_file_dir
                        .join(native_binding_path.to_string())
                        .read_glob(
                            Glob::new(format!("*.{}", compile_target.dylib_ext())),
                            false,
                        )
                        .await?
                        .results
                        .iter()
                    {
                        if let &DirectoryEntry::File(dylib) | &DirectoryEntry::Symlink(dylib) =
                            entry
                        {
                            assets.insert(Vc::upcast(FileSource::new(dylib)));
                        }
                    }
                    assets.insert(Vc::upcast(FileSource::new(resolved_file_vc)));
                }
                for entry in config_asset
                    .ident()
                    .path()
                    .parent()
                    // TODO
                    // read the dependencies path from `bindings.gyp`
                    .join("deps/lib".to_string())
                    .read_glob(Glob::new("*".to_string()), false)
                    .await?
                    .results
                    .values()
                {
                    match *entry {
                        DirectoryEntry::File(dylib) => {
                            assets.insert(Vc::upcast(FileSource::new(dylib)));
                        }
                        DirectoryEntry::Symlink(dylib) => {
                            let realpath_with_links = dylib.realpath_with_links().await?;
                            for symlink in realpath_with_links.symlinks.iter() {
                                assets.insert(Vc::upcast(FileSource::new(*symlink)));
                            }
                            assets.insert(Vc::upcast(FileSource::new(dylib)));
                        }
                        _ => {}
                    }
                }
                return Ok(ResolveResult::assets_with_references(
                    assets.into_iter().collect(),
                    vec![Vc::upcast(AffectingResolvingAssetReference::new(
                        config_file_path,
                    ))],
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
    pub context: Vc<FileSystemPath>,
    pub compile_target: Vc<CompileTarget>,
}

#[turbo_tasks::value_impl]
impl NodeGypBuildReference {
    #[turbo_tasks::function]
    pub fn new(context: Vc<FileSystemPath>, target: Vc<CompileTarget>) -> Vc<Self> {
        Self::cell(NodeGypBuildReference {
            context,
            compile_target: target,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodeGypBuildReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        resolve_node_gyp_build_files(self.context, self.compile_target)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodeGypBuildReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "node-gyp in {} for {}",
            self.context.to_string().await?,
            self.compile_target.await?
        )))
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_gyp_build_files(
    context: Vc<FileSystemPath>,
    compile_target: Vc<CompileTarget>,
) -> Result<Vc<ResolveResult>> {
    lazy_static! {
        static ref GYP_BUILD_TARGET_NAME: Regex =
            Regex::new(r#"['"]target_name['"]\s*:\s*(?:"(.*?)"|'(.*?)')"#)
                .expect("create napi_build_version regex failed");
    }
    let binding_gyp_pat = Pattern::new(Pattern::Constant("binding.gyp".to_owned()));
    let gyp_file = resolve_raw(context, binding_gyp_pat, true).await?;
    if let [PrimaryResolveResult::Asset(binding_gyp)] = &gyp_file.primary[..] {
        let mut merged_references = gyp_file.references.clone();
        if let AssetContent::File(file) = &*binding_gyp.content().await? {
            if let FileContent::Content(config_file) = &*file.await? {
                if let Some(captured) =
                    GYP_BUILD_TARGET_NAME.captures(&config_file.content().to_str()?)
                {
                    let mut resolved: IndexSet<Vc<Box<dyn Asset>>> =
                        IndexSet::with_capacity(captured.len());
                    for found in captured.iter().skip(1).flatten() {
                        let name = found.as_str();
                        let target_path = context.join("build/Release".to_string());
                        let resolved_prebuilt_file = resolve_raw(
                            target_path,
                            Pattern::new(Pattern::Constant(format!("{}.node", name))),
                            true,
                        )
                        .await?;
                        if let [PrimaryResolveResult::Asset(asset)] =
                            &resolved_prebuilt_file.primary[..]
                        {
                            resolved.insert(asset.resolve().await?);
                            merged_references.extend_from_slice(&resolved_prebuilt_file.references);
                        }
                    }
                    if !resolved.is_empty() {
                        return Ok(ResolveResult::assets_with_references(
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
    pub context: Vc<FileSystemPath>,
    pub file_name: String,
}

#[turbo_tasks::value_impl]
impl NodeBindingsReference {
    #[turbo_tasks::function]
    pub fn new(context: Vc<FileSystemPath>, file_name: String) -> Vc<Self> {
        Self::cell(NodeBindingsReference { context, file_name })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for NodeBindingsReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        resolve_node_bindings_files(self.context, self.file_name.clone())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodeBindingsReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "bindings in {}",
            self.context.to_string().await?,
        )))
    }
}

#[turbo_tasks::function]
pub async fn resolve_node_bindings_files(
    context: Vc<FileSystemPath>,
    file_name: String,
) -> Result<Vc<ResolveResult>> {
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
        let resolved = resolve_raw(
            root_context,
            Pattern::Constant("package.json".to_owned()).into(),
            true,
        )
        .first_asset()
        .await?;
        if let Some(asset) = *resolved {
            if let AssetContent::File(file) = &*asset.content().await? {
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
    let bindings_try: Vec<Vc<Box<dyn Asset>>> = BINDINGS_TRY
        .iter()
        .map(|try_dir| {
            Vc::upcast(FileSource::new(
                root_context.join(format!("{}/{}", try_dir, &file_name)),
            ))
        })
        .collect();

    Ok(ResolveResult::assets_with_references(
        bindings_try,
        vec![Vc::upcast(FileSourceReference::new(
            Vc::upcast(FileSource::new(root_context)),
            Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(file_name)]).into(),
        ))],
    )
    .into())
}
