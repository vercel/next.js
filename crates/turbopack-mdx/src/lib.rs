#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

use anyhow::{anyhow, Context, Result};
use mdxjs::{compile, MdxParseOptions, Options};
use turbo_tasks::{RcStr, Value, ValueDefault, Vc};
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
        EcmascriptChunkType, EcmascriptExports,
    },
    references::AnalyzeEcmascriptModuleResultBuilder,
    AnalyzeEcmascriptModuleResult, EcmascriptInputTransforms, EcmascriptModuleAsset,
    EcmascriptModuleAssetType, EcmascriptOptions,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("mdx".into())
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MdxParseConstructs {
    Commonmark,
    Gfm,
}

/// Subset of mdxjs::Options to allow to inherit turbopack's jsx-related configs
/// into mdxjs. This is thin, near straightforward subset of mdxjs::Options to
/// enable turbo tasks.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct MdxTransformOptions {
    pub development: Option<bool>,
    pub jsx: Option<bool>,
    pub jsx_runtime: Option<RcStr>,
    pub jsx_import_source: Option<RcStr>,
    /// The path to a module providing Components to mdx modules.
    /// The provider must export a useMDXComponents, which is called to access
    /// an object of components.
    pub provider_import_source: Option<RcStr>,
    /// Determines how to parse mdx contents.
    pub mdx_type: Option<MdxParseConstructs>,
}

impl Default for MdxTransformOptions {
    fn default() -> Self {
        Self {
            development: Some(true),
            jsx: Some(false),
            jsx_runtime: None,
            jsx_import_source: None,
            provider_import_source: None,
            mdx_type: Some(MdxParseConstructs::Commonmark),
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
    ecmascript_options: Vc<EcmascriptOptions>,
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

    let parse_options = match transform_options.mdx_type {
        Some(MdxParseConstructs::Gfm) => MdxParseOptions::gfm(),
        _ => MdxParseOptions::default(),
    };

    let options = Options {
        parse: parse_options,
        development: transform_options.development.unwrap_or(false),
        provider_import_source: transform_options
            .provider_import_source
            .clone()
            .map(RcStr::into_owned),
        jsx: transform_options.jsx.unwrap_or(false), // true means 'preserve' jsx syntax.
        jsx_runtime,
        jsx_import_source: transform_options
            .jsx_import_source
            .clone()
            .map(RcStr::into_owned),
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
        this.ecmascript_options,
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
        ecmascript_options: Vc<EcmascriptOptions>,
    ) -> Vc<Self> {
        Self::cell(MdxModuleAsset {
            source,
            asset_context,
            transforms,
            options,
            ecmascript_options,
        })
    }

    #[turbo_tasks::function]
    async fn failsafe_analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let asset = into_ecmascript_module_asset(&self).await;

        if let Ok(asset) = asset {
            Ok(asset.failsafe_analyze())
        } else {
            let mut result = AnalyzeEcmascriptModuleResultBuilder::new();
            result.set_successful(false);
            result.build(false).await
        }
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
    chunking_context: Vc<Box<dyn ChunkingContext>>,
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
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
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
