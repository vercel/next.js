use std::sync::LazyLock;

use anyhow::{Result, bail};
use regex::Regex;
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileContent, FileSystemEntryType, FileSystemPath,
    json::parse_json_rope_with_source_context,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingType, TracedMode},
    file_source::FileSource,
    module::Module,
    raw_module::RawModule,
    reference::ModuleReference,
    resolve::{ModuleResolveResult, RequestKey, ResolveResultItem, pattern::Pattern, resolve_raw},
    source::Source,
    target::{CompileTarget, Platform},
};

#[derive(Deserialize, Debug)]
struct NodePreGypConfigJson {
    binary: NodePreGypConfig,
}

#[derive(Deserialize, Debug)]
struct NodePreGypConfig {
    module_name: String,
    module_path: String,
    napi_versions: Vec<u32>,
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug, ValueToString)]
#[value_to_string("node-gyp in {context_dir} with {config_file_pattern} for {compile_target}")]
pub struct NodePreGypConfigReference {
    pub context_dir: FileSystemPath,
    pub config_file_pattern: ResolvedVc<Pattern>,
    pub compile_target: ResolvedVc<CompileTarget>,
    pub collect_affecting_sources: bool,
}

#[turbo_tasks::value_impl]
impl NodePreGypConfigReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        config_file_pattern: ResolvedVc<Pattern>,
        compile_target: ResolvedVc<CompileTarget>,
        collect_affecting_sources: bool,
    ) -> Vc<Self> {
        Self::cell(NodePreGypConfigReference {
            context_dir,
            config_file_pattern,
            compile_target,
            collect_affecting_sources,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for NodePreGypConfigReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        turbo_tasks::read!(resolve_node_pre_gyp_files(
            self.context_dir.clone(),
            *self.config_file_pattern,
            *self.compile_target,
            self.collect_affecting_sources,
        ))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Transitive,
        })
    }
}

turbo_tasks::dual_fn! {
fn resolve_node_pre_gyp_files(
    context_dir: FileSystemPath,
    config_file_pattern: Vc<Pattern>,
    compile_target: Vc<CompileTarget>,
    collect_affecting_sources: bool,
) -> Result<Vc<ModuleResolveResult>> {
    static NAPI_VERSION_TEMPLATE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\{(napi_build_version|node_napi_label)\}")
            .expect("create napi_build_version regex failed")
    });
    static PLATFORM_TEMPLATE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\{platform\}").expect("create node_platform regex failed"));
    static ARCH_TEMPLATE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\{arch\}").expect("create node_arch regex failed"));
    static LIBC_TEMPLATE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\{libc\}").expect("create node_libc regex failed"));
    let config = turbo_tasks::read!(resolve_raw(
        context_dir,
        config_file_pattern,
        collect_affecting_sources,
        true,
    ))
    ?;
    let compile_target = turbo_tasks::read!(compile_target)?;
    if let Some(config_asset) = config.first_source()
        && let AssetContent::File(file) = &*turbo_tasks::read!(config_asset.content())?
        && let FileContent::Content(config_file) = &*turbo_tasks::read!(file)?
    {
        let config_asset_ident = turbo_tasks::read!(config_asset.ident())?;
        let config_file_path = &config_asset_ident.path;
        let mut affecting_paths = vec![config_file_path.clone()];
        let config_file_dir = config_file_path.parent();
        let node_pre_gyp_config: NodePreGypConfigJson =
            parse_json_rope_with_source_context(config_file.content())?;
        let mut sources: FxIndexMap<RcStr, Vc<Box<dyn Source>>> = FxIndexMap::default();
        for version in node_pre_gyp_config.binary.napi_versions.iter() {
            let native_binding_path = NAPI_VERSION_TEMPLATE.replace(
                node_pre_gyp_config.binary.module_path.as_str(),
                version.to_string(),
            );
            let platform = compile_target.platform;
            let native_binding_path =
                PLATFORM_TEMPLATE.replace(&native_binding_path, platform.as_str());
            let native_binding_path =
                ARCH_TEMPLATE.replace(&native_binding_path, compile_target.arch.as_str());
            let native_binding_path: RcStr = LIBC_TEMPLATE
                .replace(
                    &native_binding_path,
                    // node-pre-gyp only cares about libc on linux
                    if platform == Platform::Linux {
                        compile_target.libc.as_str()
                    } else {
                        "unknown"
                    },
                )
                .into();

            // Find all dynamic libraries in the given directory.
            if let DirectoryContent::Entries(entries) = &*turbo_tasks::read!(config_file_dir
                .join(&native_binding_path)?
                .read_dir())
                ?
            {
                let extension = compile_target.dylib_ext();
                for (key, entry) in entries.iter().filter(|(k, _)| k.ends_with(extension)) {
                    if let DirectoryEntry::File(dylib) | DirectoryEntry::Symlink(dylib) = entry {
                        sources.insert(
                            format!("{native_binding_path}/{key}").into(),
                            Vc::upcast(FileSource::new(dylib.clone())),
                        );
                    }
                }
            }

            let node_file_path: RcStr = format!(
                "{}/{}.node",
                native_binding_path, node_pre_gyp_config.binary.module_name
            )
            .into();
            let resolved_file_vc = config_file_dir.join(&node_file_path)?;
            if *turbo_tasks::read!(resolved_file_vc.get_type())? == FileSystemEntryType::File {
                sources.insert(
                    node_file_path,
                    Vc::upcast(FileSource::new(resolved_file_vc)),
                );
            }
        }
        if let DirectoryContent::Entries(entries) = &*turbo_tasks::read!(config_file_dir
            // TODO
            // read the dependencies path from `bindings.gyp`
            .join("deps/lib")?
            .read_dir())
            ?
        {
            for (key, entry) in entries.iter() {
                match entry {
                    DirectoryEntry::File(dylib) => {
                        sources.insert(
                            format!("deps/lib/{key}").into(),
                            Vc::upcast(FileSource::new(dylib.clone())),
                        );
                    }
                    DirectoryEntry::Symlink(dylib) => {
                        let realpath_with_links = turbo_tasks::read!(dylib.realpath_with_links())?;
                        for symlink in realpath_with_links.symlinks.iter() {
                            affecting_paths.push(symlink.clone());
                        }
                        sources.insert(
                            format!("deps/lib/{key}").into(),
                            Vc::upcast(FileSource::new(match &realpath_with_links.path_result {
                                Ok(path) => path.clone(),
                                Err(e) => {
                                    bail!(turbo_tasks::read!(e.as_error_message(dylib, &realpath_with_links))?)
                                }
                            })),
                        );
                    }
                    _ => {}
                }
            }
        }
        let mut modules: Vec<(RequestKey, ResolvedVc<Box<dyn Module>>)> =
            Vec::with_capacity(sources.len());
        for (key, source) in sources {
            modules.push((
                RequestKey::new(key),
                ResolvedVc::upcast(turbo_tasks::read!(RawModule::new(source).to_resolved())?),
            ));
        }
        let mut affecting_sources: Vec<ResolvedVc<Box<dyn Source>>> =
            Vec::with_capacity(affecting_paths.len());
        for p in affecting_paths {
            affecting_sources.push(ResolvedVc::upcast(
                turbo_tasks::read!(FileSource::new(p).to_resolved())?,
            ));
        }
        return Ok(*ModuleResolveResult::modules_with_affecting_sources(
            modules,
            affecting_sources,
        ));
    };
    Ok(*ModuleResolveResult::unresolvable())
}
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug, ValueToString)]
#[value_to_string("node-gyp in {context_dir} for {compile_target}")]
pub struct NodeGypBuildReference {
    pub context_dir: FileSystemPath,
    collect_affecting_sources: bool,
    pub compile_target: ResolvedVc<CompileTarget>,
}

#[turbo_tasks::value_impl]
impl NodeGypBuildReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        collect_affecting_sources: bool,
        compile_target: ResolvedVc<CompileTarget>,
    ) -> Vc<Self> {
        Self::cell(NodeGypBuildReference {
            context_dir,
            collect_affecting_sources,
            compile_target,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for NodeGypBuildReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        turbo_tasks::read!(resolve_node_gyp_build_files(
            self.context_dir.clone(),
            self.collect_affecting_sources,
            self.compile_target,
        ))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Transitive,
        })
    }
}

turbo_tasks::dual_fn! {
fn resolve_node_gyp_build_files(
    context_dir: FileSystemPath,
    collect_affecting_sources: bool,
    compile_target: ResolvedVc<CompileTarget>,
) -> Result<Vc<ModuleResolveResult>> {
    // TODO Proper parser
    static GYP_BUILD_TARGET_NAME: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"['"]target_name['"]\s*:\s*(?:"(.*?)"|'(.*?)')"#)
            .expect("create napi_build_version regex failed")
    });
    let binding_gyp_pat = Pattern::new(Pattern::Constant(rcstr!("binding.gyp")));
    let gyp_file = resolve_raw(
        context_dir.clone(),
        binding_gyp_pat,
        collect_affecting_sources,
        true,
    );
    let gyp_file = turbo_tasks::read!(gyp_file)?;
    let mut primary_sources = gyp_file.primary_sources();
    if let (Some(binding_gyp), None) = (primary_sources.next(), primary_sources.next()) {
        let mut merged_affecting_sources = if collect_affecting_sources {
            gyp_file.get_affecting_sources().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        if let AssetContent::File(file) = &*turbo_tasks::read!(binding_gyp.content())?
            && let FileContent::Content(config_file) = &*turbo_tasks::read!(file)?
            && let Some(captured) = GYP_BUILD_TARGET_NAME.captures(&config_file.content().to_str()?)
        {
            let mut resolved: FxIndexMap<RcStr, ResolvedVc<Box<dyn Source>>> =
                FxIndexMap::with_capacity_and_hasher(captured.len(), Default::default());
            for found in captured.iter().skip(1).flatten() {
                let name = found.as_str();
                let target_path = context_dir.join("build/Release")?;
                let resolved_prebuilt_file = turbo_tasks::read!(resolve_raw(
                    target_path,
                    Pattern::new(Pattern::Constant(format!("{name}.node").into())),
                    collect_affecting_sources,
                    true,
                ))
                ?;
                if let Some((_, ResolveResultItem::Source(source))) =
                    resolved_prebuilt_file.primary.first()
                {
                    resolved.insert(format!("build/Release/{name}.node").into(), *source);
                    if collect_affecting_sources {
                        merged_affecting_sources
                            .extend(resolved_prebuilt_file.affecting_sources.iter().copied());
                    }
                }
            }
            if !resolved.is_empty() {
                let mut modules: Vec<(RequestKey, ResolvedVc<Box<dyn Module>>)> =
                    Vec::with_capacity(resolved.len());
                for (key, source) in resolved {
                    modules.push((
                        RequestKey::new(key),
                        ResolvedVc::upcast(
                            turbo_tasks::read!(RawModule::new(*source).to_resolved())?,
                        ),
                    ));
                }
                return Ok(*ModuleResolveResult::modules_with_affecting_sources(
                    modules,
                    merged_affecting_sources,
                ));
            }
        }
    }
    let compile_target = turbo_tasks::read!(compile_target)?;
    let arch = compile_target.arch;
    let platform = compile_target.platform;
    let prebuilt_dir = format!("{platform}-{arch}");
    Ok(resolve_raw(
        context_dir,
        Pattern::new(Pattern::Concatenation(vec![
            Pattern::Constant(format!("prebuilds/{prebuilt_dir}/").into()),
            Pattern::Dynamic,
            Pattern::Constant(rcstr!(".node")),
        ])),
        collect_affecting_sources,
        true,
    )
    .as_raw_module_result())
}
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug, ValueToString)]
#[value_to_string("bindings in {context_dir}")]
pub struct NodeBindingsReference {
    pub context_dir: FileSystemPath,
    pub file_name: RcStr,
    pub collect_affecting_sources: bool,
}

#[turbo_tasks::value_impl]
impl NodeBindingsReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        file_name: RcStr,
        collect_affecting_sources: bool,
    ) -> Vc<Self> {
        Self::cell(NodeBindingsReference {
            context_dir,
            file_name,
            collect_affecting_sources,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for NodeBindingsReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        turbo_tasks::read!(resolve_node_bindings_files(
            self.context_dir.clone(),
            self.file_name.clone(),
            self.collect_affecting_sources,
        ))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Transitive,
        })
    }
}

turbo_tasks::dual_fn! {
fn resolve_node_bindings_files(
    context_dir: FileSystemPath,
    file_name: RcStr,
    collect_affecting_sources: bool,
) -> Result<Vc<ModuleResolveResult>> {
    static BINDINGS_TRY: LazyLock<[&'static str; 5]> = LazyLock::new(|| {
        [
            "build/bindings",
            "build/Release",
            "build/Release/bindings",
            "out/Release/bindings",
            "Release/bindings",
        ]
    });
    let mut root_context_dir = context_dir;
    loop {
        let resolved = turbo_tasks::read!(resolve_raw(
            root_context_dir.clone(),
            Pattern::new(Pattern::Constant(rcstr!("package.json"))),
            collect_affecting_sources,
            true,
        ))
        ?;
        if let Some(asset) = resolved.first_source()
            && let AssetContent::File(file) = &*turbo_tasks::read!(asset.content())?
            && let FileContent::Content(_) = &*turbo_tasks::read!(file)?
        {
            break;
        };
        let current_context = root_context_dir.clone();
        let parent = root_context_dir.parent();
        if parent.path == current_context.path {
            break;
        }
        root_context_dir = parent;
    }

    let mut modules: Vec<(RequestKey, ResolvedVc<Box<dyn Module>>)> = Vec::new();
    for try_dir in BINDINGS_TRY.iter() {
        if let Some(module) = turbo_tasks::read!(try_bindings_path(
            root_context_dir.clone(),
            format!("{}/{}", try_dir, file_name).into(),
        ))? {
            modules.push(module);
        }
    }
    Ok(*ModuleResolveResult::modules(modules))
}
}

turbo_tasks::dual_fn! {
fn try_bindings_path(
    root_context_dir: FileSystemPath,
    sub_path: RcStr,
) -> Result<Option<(RequestKey, ResolvedVc<Box<dyn Module>>)>> {
    let path = root_context_dir.join(&sub_path)?;
    Ok(
        if matches!(*turbo_tasks::read!(path.get_type())?, FileSystemEntryType::File) {
            Some((
                RequestKey::new(sub_path),
                ResolvedVc::upcast(
                    turbo_tasks::read!(RawModule::new(Vc::upcast(FileSource::new(path.clone())))
                        .to_resolved())
                        ?,
                ),
            ))
        } else {
            None
        },
    )
}
}
