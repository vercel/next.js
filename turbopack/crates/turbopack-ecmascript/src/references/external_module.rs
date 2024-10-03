use std::{fmt::Display, io::Write};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, RcStr, TaskInput, Vc};
use turbo_tasks_fs::{
    glob::Glob, rope::RopeBuilder, FileContent, FileSystem, FileSystemPath, VirtualFileSystem,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::{Module, OptionModule},
    output::{OutputAsset, OutputAssets},
    reference::{
        referenced_modules_and_affecting_sources, ModuleReferences, SingleOutputAssetReference,
    },
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    references::async_module::{AsyncModule, OptionAsyncModule},
    utils::StringifyJs,
    EcmascriptModuleContent, EcmascriptOptions,
};

#[turbo_tasks::function]
fn layer() -> Vc<RcStr> {
    Vc::cell("external".into())
}

#[derive(
    Copy, Clone, Debug, Eq, PartialEq, Serialize, Deserialize, TraceRawVcs, TaskInput, Hash,
)]
pub enum CachedExternalType {
    CommonJs,
    EcmaScriptViaRequire,
    EcmaScriptViaImport,
}

impl Display for CachedExternalType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CachedExternalType::CommonJs => write!(f, "cjs"),
            CachedExternalType::EcmaScriptViaRequire => write!(f, "esm_require"),
            CachedExternalType::EcmaScriptViaImport => write!(f, "esm_import"),
        }
    }
}

#[turbo_tasks::value]
pub struct CachedExternalModule {
    pub request: RcStr,
    pub external_type: CachedExternalType,
    pub module: Vc<OptionModule>,
}

#[turbo_tasks::value_impl]
impl CachedExternalModule {
    #[turbo_tasks::function]
    pub fn new(
        request: RcStr,
        external_type: CachedExternalType,
        module: Vc<OptionModule>,
    ) -> Vc<Self> {
        Self::cell(CachedExternalModule {
            request,
            external_type,
            module,
        })
    }

    #[turbo_tasks::function]
    pub fn content(&self) -> Result<Vc<EcmascriptModuleContent>> {
        let mut code = RopeBuilder::default();

        if self.external_type == CachedExternalType::EcmaScriptViaImport {
            writeln!(
                code,
                "const mod = await __turbopack_external_import__({});",
                StringifyJs(&self.request)
            )?;
        } else {
            writeln!(
                code,
                "const mod = __turbopack_external_require__({});",
                StringifyJs(&self.request)
            )?;
        }

        writeln!(code)?;

        if self.external_type == CachedExternalType::CommonJs {
            writeln!(code, "module.exports = mod;")?;
        } else {
            writeln!(code, "__turbopack_export_namespace__(mod);")?;
        }

        Ok(EcmascriptModuleContent {
            inner_code: code.build(),
            source_map: None,
            is_esm: self.external_type != CachedExternalType::CommonJs,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Module for CachedExternalModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let fs = VirtualFileSystem::new_with_name("externals".into());

        AssetIdent::from_path(fs.root().join(self.request.clone()))
            .with_layer(layer())
            .with_modifier(Vc::cell(self.request.clone()))
            .with_modifier(Vc::cell(self.external_type.to_string().into()))
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
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
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
            if self.external_type == CachedExternalType::EcmaScriptViaImport {
                Some(
                    AsyncModule {
                        has_top_level_await: true,
                        import_externals: true,
                    }
                    .cell(),
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
    module: Vc<CachedExternalModule>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for CachedExternalModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        if let Some(module) = &*self.module.await?.module.await? {
            // println!(
            //     "CachedExternalModuleChunkItem::references() {}",
            //     module.ident().to_string().await?
            // );
            let mut module_references = self.module.references().await?.clone_value();
            module_references.push(Vc::upcast(SingleOutputAssetReference::new(
                Vc::upcast(MyRebasedAsset::new_external(*module)),
                Vc::cell("module".into()),
            )));
            Ok(Vc::cell(module_references))
        } else {
            // println!("CachedExternalModuleChunkItem::references() none",);
            Ok(self.module.references())
        }
    }

    #[turbo_tasks::function]
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn is_self_async(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.module.await?.external_type == CachedExternalType::EcmaScriptViaImport,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for CachedExternalModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

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
            self.chunking_context,
            EcmascriptOptions::default().cell(),
            async_module_options,
        )
    }
}

/// A module that only has an ident and no content nor references.
///
/// It is used to include a module's ident in the module graph before the module
/// itself is resolved, as is the case with NextServerComponentModule's
/// "client modules" and "client modules ssr".
#[turbo_tasks::value]
pub struct IncludeIdentModule {
    ident: Vc<AssetIdent>,
}

#[turbo_tasks::value_impl]
impl IncludeIdentModule {
    #[turbo_tasks::function]
    pub fn new(ident: Vc<AssetIdent>) -> Vc<Self> {
        Self { ident }.cell()
    }
}

impl Asset for IncludeIdentModule {
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        todo!("IncludeIdentModule doesn't implement content()")
    }
}

#[turbo_tasks::value_impl]
impl Module for IncludeIdentModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.ident
    }
}

// TODO put this someplace better

/// Converts a [Module] graph into an [OutputAsset] graph by placing it into a
/// different directory.
#[turbo_tasks::value]
#[derive(Hash)]
pub struct MyRebasedAsset {
    source: Vc<Box<dyn Module>>,
    input_dir: Vc<FileSystemPath>,
    output_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::function]
fn external_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name("externals".into())
}

#[turbo_tasks::value_impl]
impl MyRebasedAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Module>>,
        input_dir: Vc<FileSystemPath>,
        output_dir: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(MyRebasedAsset {
            source,
            input_dir,
            output_dir,
        })
    }
    #[turbo_tasks::function]
    pub fn new_external(source: Vc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(MyRebasedAsset {
            source,
            input_dir: source.ident().path().root(),
            output_dir: external_fs().root(),
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for MyRebasedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(FileSystemPath::rebase(
            self.source.ident().path(),
            self.input_dir,
            self.output_dir,
        ))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let mut references = Vec::new();
        for &module in referenced_modules_and_affecting_sources(self.source, true)
            .await?
            .iter()
        {
            references.push(Vc::upcast(MyRebasedAsset::new(
                module,
                self.input_dir,
                self.output_dir,
            )));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for MyRebasedAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
