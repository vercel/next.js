//! A Browser importMock loader value backed by the actual asynchronous chunk loader.

use anyhow::{Context, Result};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystemPath};
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType},
    context::{AssetContext, ProcessResult},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    reference_type::ReferenceType,
    resolve::{BindingUsage, ExportUsage, ImportUsage, ModuleResolveResult},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, ecmascript_chunk_item,
    },
    references::esm::encode_path,
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::{StringifyJs, StringifyModuleId},
};

pub(crate) const TRANSITION_NAME: &str = "next-test-browser-import-mock";

/// Applied only to the generated adapter import, not its ordinary dependencies.
#[turbo_tasks::value]
pub(crate) struct BrowserMockOriginalTransition;

#[turbo_tasks::value_impl]
impl BrowserMockOriginalTransition {
    #[turbo_tasks::function]
    pub(crate) fn new() -> Vc<Self> {
        Self.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for BrowserMockOriginalTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        // Reconstruct the normal context before processing the root, so the
        // selected named transition does not propagate to its dependencies.
        let context = self.process_context(module_asset_context);
        let source = source.to_resolved().await?;
        let path = source.ident().await?.path.clone();
        let module = context
            .process(*source, reference_type)
            .module()
            .to_resolved()
            .await?;
        let target = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
            .context("Browser importMock original must be compiled ESM")?;
        Ok(ProcessResult::Module(ResolvedVc::upcast(
            BrowserMockOriginalImportModule::new(*target, path)
                .to_resolved()
                .await?,
        ))
        .cell())
    }
}

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("Browser importMock asynchronous original")]
struct BrowserOriginalReference {
    target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl ModuleReference for BrowserOriginalReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.target))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Async)
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: ImportUsage::TopLevel,
            export: ExportUsage::All,
        }
    }
}

#[turbo_tasks::value]
struct BrowserMockOriginalImportModule {
    target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl BrowserMockOriginalImportModule {
    #[turbo_tasks::function]
    fn new(
        target: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        path: FileSystemPath,
    ) -> Vc<Self> {
        Self { target, path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for BrowserMockOriginalImportModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .target
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("Browser importMock original loader"))
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            BrowserOriginalReference {
                target: self.target,
            }
            .cell()
            .to_resolved()
            .await?,
        )]))
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        // Evaluating this adapter only creates its stable loader function.
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for BrowserMockOriginalImportModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for BrowserMockOriginalImportModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let options = EcmascriptChunkItemOptions {
            strict: true,
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };
        if estimated {
            return Ok(EcmascriptChunkItemContent {
                inner_code: format!("{TURBOPACK_EXPORT_VALUE}(function(evaluate) {{}});").into(),
                options,
                ..Default::default()
            }
            .cell());
        }
        let loader_ident = chunking_context.async_loader_chunk_item_ident(Vc::upcast(*self.target));
        let loader_id = chunking_context
            .chunk_item_id_strategy()
            .await?
            .get_id_from_ident(loader_ident)
            .await?;
        // Match ImportMetaBinding's exact F arguments, including named roots.
        let root_path = chunking_context.root_path().await?;
        let (root, relative) = if self.path.fs != root_path.fs
            && let Some(fs) = ResolvedVc::try_downcast_type::<DiskFileSystem>(self.path.fs)
        {
            (Some(fs.await?.name().clone()), Some(self.path.path.clone()))
        } else {
            (None, root_path.get_relative_path_to(&self.path))
        };
        let relative = relative.context("Browser importMock original has no import.meta path")?;
        let path = encode_path(relative.trim_start_matches("./"));
        let root_arg = root
            .as_ref()
            .map(|root| format!(", {}", StringifyJs(root)))
            .unwrap_or_default();
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "{TURBOPACK_EXPORT_VALUE}(function(evaluate) {{ return \
                 {TURBOPACK_REQUIRE}({loader_id})(function(targetId) {{ return \
                 evaluate(__turbopack_context__, targetId, {path}{root_arg}); }}); }});",
                loader_id = StringifyModuleId(&loader_id),
                path = StringifyJs(&path),
            )
            .into(),
            options,
            ..Default::default()
        }
        .cell())
    }
}
