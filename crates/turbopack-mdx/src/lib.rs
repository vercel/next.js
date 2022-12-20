#![feature(min_specialization)]

use anyhow::{anyhow, Result};
use mdxjs::compile;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{rope::Rope, File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
    resolve::origin::{ResolveOrigin, ResolveOriginVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContentVc, EcmascriptChunkItemVc,
        EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    },
    AnalyzeEcmascriptModuleResultVc, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc,
};

#[turbo_tasks::value]
#[derive(Clone, Copy)]
pub struct MdxModuleAsset {
    source: AssetVc,
    context: AssetContextVc,
    transforms: EcmascriptInputTransformsVc,
}

/// MDX components should be treated as normal j|tsx components to analyze
/// its imports or run ecma transforms,
/// only difference is it is not a valid ecmascript AST we
/// can't pass it forward directly. Internally creates an jsx from mdx
/// via mdxrs, then pass it through existing ecmascript analyzer.
async fn into_ecmascript_module_asset(
    current_context: &MdxModuleAssetVc,
) -> Result<EcmascriptModuleAssetVc> {
    let content = current_context.content();
    let this = current_context.await?;

    let AssetContent::File(file) = &*content.await? else {
        anyhow::bail!("Unexpected mdx asset content");
    };

    let FileContent::Content(file) = &*file.await? else {
        anyhow::bail!("Not able to read mdx file content");
    };

    // TODO: upstream mdx currently bubbles error as string
    let mdx_jsx_component =
        compile(&file.content().to_str()?, &Default::default()).map_err(|e| anyhow!("{}", e))?;

    let source = VirtualAssetVc::new(
        this.source.path(),
        File::from(Rope::from(mdx_jsx_component)).into(),
    );
    Ok(EcmascriptModuleAssetVc::new(
        source.into(),
        this.context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        this.transforms,
        this.context.environment(),
    ))
}

#[turbo_tasks::value_impl]
impl MdxModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        transforms: EcmascriptInputTransformsVc,
    ) -> Self {
        Self::cell(MdxModuleAsset {
            source,
            context,
            transforms,
        })
    }

    #[turbo_tasks::function]
    async fn analyze(self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        Ok(into_ecmascript_module_asset(&self).await?.analyze())
    }
}

#[turbo_tasks::value_impl]
impl Asset for MdxModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: MdxModuleAssetVc) -> Result<AssetReferencesVc> {
        Ok(self_vc.analyze().await?.references)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for MdxModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: MdxModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for MdxModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: MdxModuleAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        MdxChunkItemVc::cell(MdxChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for MdxModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.context
    }
}

#[turbo_tasks::value]
struct MdxChunkItem {
    module: MdxModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for MdxChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (mdx)",
            self.module.await?.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for MdxChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    /// Once we have mdx contents, we should treat it as j|tsx components and
    /// apply all of the ecma transforms
    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
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
