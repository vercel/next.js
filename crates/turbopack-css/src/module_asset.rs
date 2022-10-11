use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
    resolve::origin::{ResolveOrigin, ResolveOriginVc},
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExports, EcmascriptExportsVc,
};

use crate::{
    references::analyze_css_stylesheet, transform::CssInputTransformsVc, CssModuleAssetType,
};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub transforms: CssInputTransformsVc,
}

#[turbo_tasks::value_impl]
impl ModuleCssModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc, transforms: CssInputTransformsVc) -> Self {
        Self::cell(ModuleCssModuleAsset {
            source,
            context,
            transforms,
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ModuleCssModuleAssetVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        // TODO: include CSS source map
        Ok(analyze_css_stylesheet(
            this.source,
            self_vc.as_resolve_origin(),
            Value::new(CssModuleAssetType::Module),
            this.transforms,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ModuleCssModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ModuleCssModuleAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItem {
            context,
            module: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for ModuleCssModuleAsset {
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
struct ModuleChunkItem {
    module: ModuleCssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (css module)",
            self.module.await?.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        Ok(EcmascriptChunkItemContent {
            inner_code: r#"const proxy = new Proxy(
    {},
    {
        get(target, prop, receiver) {
            return `css_modules_unimplemented_{prop}`;
        },
    }
);
__turbopack_export_value__({}, proxy);
"#
            .to_string(),
            // TODO: We generate a minimal map for runtime code so that the filename is
            // displayed in dev tools.
            ..Default::default()
        }
        .cell())
    }
}
