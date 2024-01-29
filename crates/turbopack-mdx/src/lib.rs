#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

use anyhow::{anyhow, Context, Result};
use mdxjs::{compile, Options};
use turbo_tasks::{Value, ValueDefault, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
    resolve::origin::ResolveOrigin,
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptChunkingContext, EcmascriptExports,
    },
    AnalyzeEcmascriptModuleResult, EcmascriptInputTransforms, EcmascriptModuleAsset,
    EcmascriptModuleAssetType,
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("mdx".to_string())
}

/// Subset of mdxjs::Options to allow to inherit turbopack's jsx-related configs
/// into mdxjs.
#[turbo_tasks::value(shared)]
#[derive(PartialOrd, Ord, Hash, Debug, Clone)]
pub struct MdxTransformOptions {
    pub development: bool,
    pub preserve_jsx: bool,
    pub jsx_runtime: Option<String>,
    pub jsx_import_source: Option<String>,
    pub provider_import_source: Option<String>,
}

impl Default for MdxTransformOptions {
    fn default() -> Self {
        Self {
            development: true,
            preserve_jsx: false,
            jsx_runtime: None,
            jsx_import_source: None,
            provider_import_source: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl MdxTransformOptions {
    #[turbo_tasks::function]
    fn default_private() -> Vc<Self> {
        Self::cell(Default::default())
    }
}

impl ValueDefault for MdxTransformOptions {
    fn value_default() -> Vc<Self> {
        Self::default_private()
    }
}

#[turbo_tasks::value]
#[derive(Clone, Copy)]
pub struct MdxModuleAsset {
    source: Vc<Box<dyn Source>>,
    asset_context: Vc<Box<dyn AssetContext>>,
    transforms: Vc<EcmascriptInputTransforms>,
    options: Vc<MdxTransformOptions>,
}

/// MDX components should be treated as normal j|tsx components to analyze
/// its imports or run ecma transforms,
/// only difference is it is not a valid ecmascript AST we
/// can't pass it forward directly. Internally creates an jsx from mdx
/// via mdxrs, then pass it through existing ecmascript analyzer.
///
/// To make mdx as a variant of ecmascript and use its `source_transforms`
/// instead, there should be a way to get a valid SWC ast from mdx source input
/// - which we don't have yet.
async fn into_ecmascript_module_asset(
    current_context: &Vc<MdxModuleAsset>,
) -> Result<Vc<EcmascriptModuleAsset>> {
    let content = current_context.content();
    let this = current_context.await?;
    let transform_options = this.options.await?;

    let AssetContent::File(file) = &*content.await? else {
        anyhow::bail!("Unexpected mdx asset content");
    };

    let FileContent::Content(file) = &*file.await? else {
        anyhow::bail!("Not able to read mdx file content");
    };

    let jsx_runtime = if let Some(runtime) = &transform_options.jsx_runtime {
        match runtime.as_str() {
            "automatic" => Some(mdxjs::JsxRuntime::Automatic),
            "classic" => Some(mdxjs::JsxRuntime::Classic),
            _ => None,
        }
    } else {
        None
    };

    let options = Options {
        development: transform_options.development,
        provider_import_source: transform_options.provider_import_source.clone(),
        jsx: transform_options.preserve_jsx, // true means 'preserve' jsx syntax.
        jsx_runtime,
        jsx_import_source: transform_options
            .jsx_import_source
            .as_ref()
            .map(|s| s.into()),
        filepath: Some(this.source.ident().path().await?.to_string()),
        ..Default::default()
    };
    // TODO: upstream mdx currently bubbles error as string
    let mdx_jsx_component =
        compile(&file.content().to_str()?, &options).map_err(|e| anyhow!("{}", e))?;

    let source = VirtualSource::new_with_ident(
        this.source.ident(),
        AssetContent::file(File::from(Rope::from(mdx_jsx_component)).into()),
    );
    Ok(EcmascriptModuleAsset::new(
        Vc::upcast(source),
        this.asset_context,
        Value::new(EcmascriptModuleAssetType::Typescript {
            tsx: true,
            analyze_types: false,
        }),
        this.transforms,
        Value::new(Default::default()),
        this.asset_context.compile_time_info(),
    ))
}

#[turbo_tasks::value_impl]
impl MdxModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Source>>,
        asset_context: Vc<Box<dyn AssetContext>>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Vc<MdxTransformOptions>,
    ) -> Vc<Self> {
        Self::cell(MdxModuleAsset {
            source,
            asset_context,
            transforms,
            options,
        })
    }

    #[turbo_tasks::function]
    async fn failsafe_analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        Ok(into_ecmascript_module_asset(&self)
            .await?
            .failsafe_analyze())
    }
}

#[turbo_tasks::value_impl]
impl Module for MdxModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let analyze = self.failsafe_analyze().await?;
        Ok(analyze.references)
    }
}

#[turbo_tasks::value_impl]
impl Asset for MdxModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for MdxModuleAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let chunking_context =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkingContext>>(chunking_context)
                .await?
                .context(
                    "chunking context must impl EcmascriptChunkingContext to use MdxModuleAsset",
                )?;
        Ok(Vc::upcast(MdxChunkItem::cell(MdxChunkItem {
            module: self,
            chunking_context,
        })))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for MdxModuleAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for MdxModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        self.asset_context
    }
}

#[turbo_tasks::value]
struct MdxChunkItem {
    module: Vc<MdxModuleAsset>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("MdxChunkItem::content should never be called");
    }

    /// Once we have mdx contents, we should treat it as j|tsx components and
    /// apply all of the ecma transforms
    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let item = into_ecmascript_module_asset(&self.module)
            .await?
            .as_chunk_item(Vc::upcast(self.chunking_context));
        let ecmascript_item = Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(item)
            .await?
            .context("MdxChunkItem must generate an EcmascriptChunkItem")?;
        Ok(ecmascript_item.content_with_async_module_info(async_module_info))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
