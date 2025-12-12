use std::{borrow::Cow, fmt::Display, io::Write};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    FileContent, FileSystem, FileSystemPath, LinkType, VirtualFileSystem, rope::RopeBuilder,
};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::{AssetIdent, Layer},
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    output::{
        OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsReferences,
        OutputAssetsWithReferenced,
    },
    raw_module::RawModule,
    reference::{ModuleReference, ModuleReferences, TracedModuleReference},
    reference_type::ReferenceType,
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::{cjs_resolve, esm_resolve};

use crate::{
    EcmascriptModuleContent,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    references::async_module::{AsyncModule, OptionAsyncModule},
    runtime_functions::{
        TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_EXPORT_VALUE, TURBOPACK_EXTERNAL_IMPORT,
        TURBOPACK_EXTERNAL_REQUIRE, TURBOPACK_LOAD_BY_URL,
    },
    utils::StringifyJs,
};

#[derive(
    Copy,
    Clone,
    Debug,
    Eq,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
    Hash,
    NonLocalValue,
    Encode,
    Decode,
)]
pub enum CachedExternalType {
    CommonJs,
    EcmaScriptViaRequire,
    EcmaScriptViaImport,
    Global,
    Script,
}

#[derive(
    Clone,
    Debug,
    Eq,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
    Hash,
    NonLocalValue,
    Encode,
    Decode,
)]
/// Whether to add a traced reference to the external module using the given context and resolve
/// origin.
pub enum CachedExternalTracingMode {
    Untraced,
    Traced {
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    },
}

impl Display for CachedExternalType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CachedExternalType::CommonJs => write!(f, "cjs"),
            CachedExternalType::EcmaScriptViaRequire => write!(f, "esm_require"),
            CachedExternalType::EcmaScriptViaImport => write!(f, "esm_import"),
            CachedExternalType::Global => write!(f, "global"),
            CachedExternalType::Script => write!(f, "script"),
        }
    }
}

#[turbo_tasks::value]
pub struct CachedExternalModule {
    request: RcStr,
    target: Option<FileSystemPath>,
    external_type: CachedExternalType,
    analyze_mode: CachedExternalTracingMode,
}

/// For a given package folder inside of node_modules, generate a unique hashed package name.
///
/// E.g. `/path/to/node_modules/@swc/core` becomes `@swc/core-1149fa2b3c4d5e6f`
fn hashed_package_name(folder: &FileSystemPath) -> String {
    let hash = encode_hex(hash_xxh3_hash64(&folder.path));

    let parent = folder.parent();
    let parent = parent.file_name();
    let pkg = folder.file_name();
    if parent.starts_with('@') {
        format!("{parent}/{pkg}-{hash}")
    } else {
        format!("{pkg}-{hash}")
    }
}

impl CachedExternalModule {
    /// Rewrites `self.request` to include the hashed package name if `self.target` is set.
    pub fn request(&self) -> Cow<'_, str> {
        if let Some(target) = &self.target {
            let hashed_package = hashed_package_name(target);

            let request = if self.request.starts_with('@') {
                // Potentially strip off `@org/...`
                self.request.split_once('/').unwrap().1
            } else {
                &*self.request
            };

            if let Some((_, subpath)) = request.split_once('/') {
                // `pkg/subpath` case
                Cow::Owned(format!("{hashed_package}/{subpath}"))
            } else {
                // `pkg` case
                Cow::Owned(hashed_package)
            }
        } else {
            Cow::Borrowed(&*self.request)
        }
    }
}

#[turbo_tasks::value_impl]
impl CachedExternalModule {
    #[turbo_tasks::function]
    pub fn new(
        request: RcStr,
        target: Option<FileSystemPath>,
        external_type: CachedExternalType,
        analyze_mode: CachedExternalTracingMode,
    ) -> Vc<Self> {
        Self::cell(CachedExternalModule {
            request,
            target,
            external_type,
            analyze_mode,
        })
    }

    #[turbo_tasks::function]
    pub fn content(&self) -> Result<Vc<EcmascriptModuleContent>> {
        let mut code = RopeBuilder::default();

        match self.external_type {
            CachedExternalType::EcmaScriptViaImport => {
                writeln!(
                    code,
                    "const mod = await {TURBOPACK_EXTERNAL_IMPORT}({});",
                    StringifyJs(&self.request())
                )?;
            }
            CachedExternalType::EcmaScriptViaRequire | CachedExternalType::CommonJs => {
                let request = self.request();
                writeln!(
                    code,
                    "const mod = {TURBOPACK_EXTERNAL_REQUIRE}({}, () => require({}));",
                    StringifyJs(&request),
                    StringifyJs(&request)
                )?;
            }
            CachedExternalType::Global => {
                if self.request.is_empty() {
                    writeln!(code, "const mod = {{}};")?;
                } else {
                    writeln!(
                        code,
                        "const mod = globalThis[{}];",
                        StringifyJs(&self.request)
                    )?;
                }
            }
            CachedExternalType::Script => {
                // Parse the request format: "variableName@url"
                // e.g., "foo@https://test.test.com"
                if let Some(at_index) = self.request.find('@') {
                    let variable_name = &self.request[..at_index];
                    let url = &self.request[at_index + 1..];

                    // Wrap the loading and variable access in a try-catch block
                    writeln!(code, "let mod;")?;
                    writeln!(code, "try {{")?;

                    // First load the URL
                    writeln!(
                        code,
                        "  await {TURBOPACK_LOAD_BY_URL}({});",
                        StringifyJs(url)
                    )?;

                    // Then get the variable from global with existence check
                    writeln!(
                        code,
                        "  if (typeof global[{}] === 'undefined') {{",
                        StringifyJs(variable_name)
                    )?;
                    writeln!(
                        code,
                        "    throw new Error('Variable {} is not available on global object after \
                         loading {}');",
                        StringifyJs(variable_name),
                        StringifyJs(url)
                    )?;
                    writeln!(code, "  }}")?;
                    writeln!(code, "  mod = global[{}];", StringifyJs(variable_name))?;

                    // Catch and re-throw errors with more context
                    writeln!(code, "}} catch (error) {{")?;
                    writeln!(
                        code,
                        "  throw new Error('Failed to load external URL module {}: ' + \
                         (error.message || error));",
                        StringifyJs(&self.request)
                    )?;
                    writeln!(code, "}}")?;
                } else {
                    // Invalid format - throw error
                    writeln!(
                        code,
                        "throw new Error('Invalid URL external format. Expected \"variable@url\", \
                         got: {}');",
                        StringifyJs(&self.request)
                    )?;
                    writeln!(code, "const mod = undefined;")?;
                }
            }
        }

        writeln!(code)?;

        if self.external_type == CachedExternalType::CommonJs {
            writeln!(code, "module.exports = mod;")?;
        } else if self.external_type == CachedExternalType::EcmaScriptViaImport
            || self.external_type == CachedExternalType::EcmaScriptViaRequire
        {
            writeln!(code, "{TURBOPACK_EXPORT_NAMESPACE}(mod);")?;
        } else {
            writeln!(code, "{TURBOPACK_EXPORT_VALUE}(mod);")?;
        }

        Ok(EcmascriptModuleContent {
            inner_code: code.build(),
            source_map: None,
            is_esm: self.external_type != CachedExternalType::CommonJs,
            strict: false,
            additional_ids: Default::default(),
        }
        .cell())
    }
}

/// A separate turbotask to create only a single VirtualFileSystem
#[turbo_tasks::function]
fn externals_fs_root() -> Vc<FileSystemPath> {
    VirtualFileSystem::new_with_name(rcstr!("externals")).root()
}

#[turbo_tasks::value_impl]
impl Module for CachedExternalModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = AssetIdent::from_path(externals_fs_root().await?.join(&self.request)?)
            .with_layer(Layer::new(rcstr!("external")))
            .with_modifier(self.request.clone())
            .with_modifier(self.external_type.to_string().into());

        if let Some(target) = &self.target {
            ident = ident.with_modifier(target.value_to_string().owned().await?);
        }

        Ok(ident)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(match &self.analyze_mode {
            CachedExternalTracingMode::Untraced => ModuleReferences::empty(),
            CachedExternalTracingMode::Traced { origin } => {
                let external_result = match self.external_type {
                    CachedExternalType::EcmaScriptViaImport => {
                        esm_resolve(
                            **origin,
                            Request::parse_string(self.request.clone()),
                            Default::default(),
                            false,
                            None,
                        )
                        .await?
                        .await?
                    }
                    CachedExternalType::CommonJs | CachedExternalType::EcmaScriptViaRequire => {
                        cjs_resolve(
                            **origin,
                            Request::parse_string(self.request.clone()),
                            Default::default(),
                            None,
                            false,
                        )
                        .await?
                    }
                    CachedExternalType::Global | CachedExternalType::Script => {
                        origin
                            .resolve_asset(
                                Request::parse_string(self.request.clone()),
                                origin.resolve_options(ReferenceType::Undefined),
                                ReferenceType::Undefined,
                            )
                            .await?
                            .await?
                    }
                };

                let references = external_result
                    .affecting_sources
                    .iter()
                    .map(|s| Vc::upcast::<Box<dyn Module>>(RawModule::new(**s)))
                    .chain(
                        external_result
                            .primary_modules_raw_iter()
                            // These modules aren't bundled but still need to be part of the module
                            // graph for chunking. `compute_async_module_info` computes
                            // `is_self_async` for every module, but at least for traced modules,
                            // that value is never used as `ChunkingType::Traced.is_inherit_async()
                            // == false`. Optimize this case by using `ModuleWithoutSelfAsync` to
                            // short circuit that computation and thus defer parsing traced modules
                            // to emitting to not block all of chunking on this.
                            .map(|m| Vc::upcast(SideEffectfulModuleWithoutSelfAsync::new(*m))),
                    )
                    .map(|s| {
                        Vc::upcast::<Box<dyn ModuleReference>>(TracedModuleReference::new(s))
                            .to_resolved()
                    })
                    .try_join()
                    .await?;
                Vc::cell(references)
            }
        })
    }

    #[turbo_tasks::function]
    fn is_self_async(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.external_type == CachedExternalType::EcmaScriptViaImport
                || self.external_type == CachedExternalType::Script,
        ))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for CachedExternalModule {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        // should be `NotFound` as this function gets called to detect source changes
        AssetContent::file(FileContent::NotFound.cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CachedExternalModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        Vc::upcast(
            CachedExternalModuleChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for CachedExternalModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        if self.external_type == CachedExternalType::CommonJs {
            EcmascriptExports::CommonJs.cell()
        } else {
            EcmascriptExports::DynamicNamespace.cell()
        }
    }

    #[turbo_tasks::function]
    fn get_async_module(&self) -> Vc<OptionAsyncModule> {
        Vc::cell(
            if self.external_type == CachedExternalType::EcmaScriptViaImport
                || self.external_type == CachedExternalType::Script
            {
                Some(
                    AsyncModule {
                        has_top_level_await: true,
                        import_externals: self.external_type
                            == CachedExternalType::EcmaScriptViaImport,
                    }
                    .resolved_cell(),
                )
            } else {
                None
            },
        )
    }
}

#[turbo_tasks::value]
pub struct CachedExternalModuleChunkItem {
    module: ResolvedVc<CachedExternalModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for CachedExternalModuleChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;
        let assets = if let Some(target) = &module.target {
            ResolvedVc::cell(vec![ResolvedVc::upcast(
                ExternalsSymlinkAsset::new(
                    *self.chunking_context,
                    hashed_package_name(target).into(),
                    module.target.clone().unwrap(),
                )
                .to_resolved()
                .await?,
            )])
        } else {
            OutputAssets::empty_resolved()
        };
        Ok(OutputAssetsWithReferenced {
            assets,
            referenced_assets: OutputAssets::empty_resolved(),
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for CachedExternalModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for CachedExternalModuleChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should not be called");
    }

    #[turbo_tasks::function]
    fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Vc<EcmascriptChunkItemContent> {
        let async_module_options = self
            .module
            .get_async_module()
            .module_options(async_module_info);

        EcmascriptChunkItemContent::new(
            self.module.content(),
            *self.chunking_context,
            async_module_options,
        )
    }
}

/// A wrapper "passthrough" module type that always returns `false` for `is_self_async` and
/// `SideEffects` for `side_effects`.Be careful when using it, as it may hide async dependencies.
#[turbo_tasks::value]
struct SideEffectfulModuleWithoutSelfAsync {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl SideEffectfulModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(SideEffectfulModuleWithoutSelfAsync { module })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SideEffectfulModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.module.content()
    }
}

#[turbo_tasks::value_impl]
impl Module for SideEffectfulModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
    // Don't override and use default is_self_async that always returns false
}

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub struct ExternalsSymlinkAsset {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    hashed_package: RcStr,
    target: FileSystemPath,
}
#[turbo_tasks::value_impl]
impl ExternalsSymlinkAsset {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        hashed_package: RcStr,
        target: FileSystemPath,
    ) -> Vc<Self> {
        ExternalsSymlinkAsset {
            chunking_context,
            hashed_package,
            target,
        }
        .cell()
    }
}
#[turbo_tasks::value_impl]
impl OutputAssetsReference for ExternalsSymlinkAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for ExternalsSymlinkAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .chunking_context
            .output_root()
            .await?
            .join("node_modules")?
            .join(&self.hashed_package)?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ExternalsSymlinkAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        // path: [output]/bench/app-router-server/.next/node_modules/lodash-ee4fa714b6d81ca3
        // target: [project]/node_modules/.pnpm/lodash@3.10.1/node_modules/lodash

        let output_root_to_project_root = this.chunking_context.output_root_to_root_path().await?;
        let project_root_to_target = &this.target.path;

        let path = self.path().await?;
        let path_to_output_root = path
            .parent()
            .get_relative_path_to(&*this.chunking_context.output_root().await?)
            .context("path must be inside output root")?;

        let target = format!(
            "{path_to_output_root}/{output_root_to_project_root}/{project_root_to_target}",
        )
        .into();

        Ok(AssetContent::Redirect {
            target,
            link_type: LinkType::DIRECTORY,
        }
        .cell())
    }
}
