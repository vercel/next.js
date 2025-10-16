use std::{fmt::Display, io::Write};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileSystem, VirtualFileSystem, glob::Glob, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::{AssetIdent, Layer},
    module::Module,
    module_graph::ModuleGraph,
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
)]
pub enum CachedExternalType {
    CommonJs,
    EcmaScriptViaRequire,
    EcmaScriptViaImport,
    Global,
    Script,
}

#[derive(
    Clone, Debug, Eq, PartialEq, Serialize, Deserialize, TraceRawVcs, TaskInput, Hash, NonLocalValue,
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
    external_type: CachedExternalType,
    analyze_mode: CachedExternalTracingMode,
}

#[turbo_tasks::value_impl]
impl CachedExternalModule {
    #[turbo_tasks::function]
    pub fn new(
        request: RcStr,
        external_type: CachedExternalType,
        analyze_mode: CachedExternalTracingMode,
    ) -> Vc<Self> {
        Self::cell(CachedExternalModule {
            request,
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
                    StringifyJs(&self.request)
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
            CachedExternalType::EcmaScriptViaRequire | CachedExternalType::CommonJs => {
                writeln!(
                    code,
                    "const mod = {TURBOPACK_EXTERNAL_REQUIRE}({}, () => require({}));",
                    StringifyJs(&self.request),
                    StringifyJs(&self.request)
                )?;
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

#[turbo_tasks::value_impl]
impl Module for CachedExternalModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let fs = VirtualFileSystem::new_with_name(rcstr!("externals"));

        Ok(AssetIdent::from_path(fs.root().await?.join(&self.request)?)
            .with_layer(Layer::new(rcstr!("external")))
            .with_modifier(self.request.clone())
            .with_modifier(self.external_type.to_string().into()))
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
                                origin.resolve_options(ReferenceType::Undefined).await?,
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
                            .map(|m| Vc::upcast(ModuleWithoutSelfAsync::new(*m))),
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

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        _side_effect_free_packages: Vc<Glob>,
    ) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value]
pub struct CachedExternalModuleChunkItem {
    module: ResolvedVc<CachedExternalModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
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

/// A wrapper "passthrough" module type that always returns `false` for `is_self_async`. Be careful
/// when using it, as it may hide async dependencies.
#[turbo_tasks::value]
pub struct ModuleWithoutSelfAsync {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl ModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(ModuleWithoutSelfAsync { module })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.module.content()
    }
}

#[turbo_tasks::value_impl]
impl Module for ModuleWithoutSelfAsync {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    // Don't override and use default is_self_async that always returns false
}
