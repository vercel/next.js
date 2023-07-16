#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

use anyhow::{anyhow, Result};
use mdxjs::{compile, Options};
use turbo_tasks::{Value, ValueDefault, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference::AssetReferences,
    resolve::origin::ResolveOrigin,
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkingContext, EcmascriptExports,
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
    context: Vc<Box<dyn AssetContext>>,
    transforms: Vc<EcmascriptInputTransforms>,
    options: Vc<MdxTransformOptions>,
}

/// MDX components should be treated as normal j|tsx components to analyze
/// its imports or run ecma transforms,
/// only difference is it is not a valid ecmascript AST we
/// can't pass it forward directly. Internally creates an jsx from mdx
/// via mdxrs, then pass it through existing ecmascript analyzer.
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
        this.context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        this.transforms,
        Value::new(Default::default()),
        this.context.compile_time_info(),
    ))
}

#[turbo_tasks::value_impl]
impl MdxModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Source>>,
        context: Vc<Box<dyn AssetContext>>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Vc<MdxTransformOptions>,
    ) -> Vc<Self> {
        Self::cell(MdxModuleAsset {
            source,
            context,
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
impl Asset for MdxModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        Ok(self.failsafe_analyze().await?.references)
    }
}

#[turbo_tasks::value_impl]
impl Module for MdxModuleAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for MdxModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for MdxModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(MdxChunkItem::cell(MdxChunkItem {
            module: self,
            context,
        }))
    }

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
    fn context(&self) -> Vc<Box<dyn AssetContext>> {
        self.context
    }
}

#[turbo_tasks::value]
struct MdxChunkItem {
    module: Vc<MdxModuleAsset>,
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<AssetReferences> {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    /// Once we have mdx contents, we should treat it as j|tsx components and
    /// apply all of the ecma transforms
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        Ok(into_ecmascript_module_asset(&self.module)
            .await?
            .as_chunk_item(self.context)
            .content())
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
