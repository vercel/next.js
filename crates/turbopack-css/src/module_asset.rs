use std::fmt::Write;

use anyhow::Result;
use swc_css_modules::CssClassName;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetReference,
        ChunkableAssetReferenceVc, ChunkableAssetVc, ChunkingContextVc, ChunkingType,
        ChunkingTypeOptionVc,
    },
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        ResolveResult, ResolveResultVc,
    },
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_str,
};

use crate::{parse::ParseResult, transform::CssInputTransformsVc, CssModuleAssetVc};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssModuleAsset {
    pub inner: CssModuleAssetVc,
}

#[turbo_tasks::value_impl]
impl ModuleCssModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc, transforms: CssInputTransformsVc) -> Self {
        Self::cell(ModuleCssModuleAsset {
            inner: CssModuleAssetVc::new_module(source, context, transforms),
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.inner.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.inner.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.inner.references()
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
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc {
        ModuleChunkItem {
            context,
            module: self.inner,
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
        self.inner.path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.inner.context()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: CssModuleAssetVc,
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
        AssetReferencesVc::cell(vec![CssProxyToCssAssetReference {
            module: self.module,
            context: self.context,
        }
        .cell()
        .into()])
    }
}

#[turbo_tasks::value]
struct CssProxyToCssAssetReference {
    module: CssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell("css".to_string())
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.module.into(), Vec::new()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Parallel))
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
        let parsed = self.module.parse().await?;
        Ok(match &*parsed {
            ParseResult::Ok { exports, .. } => {
                let mut code = "__turbopack_export_value__({\n".to_string();
                for (key, elements) in exports {
                    let content = elements
                        .iter()
                        .map(|element| match element {
                            CssClassName::Local { name } | CssClassName::Global { name } => &**name,
                            CssClassName::Import { .. } => "TODO",
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    writeln!(
                        code,
                        "  {}: {},",
                        stringify_str(key),
                        stringify_str(&content)
                    )?;
                }
                code += "});\n";
                EcmascriptChunkItemContent {
                    inner_code: code,
                    // TODO: We generate a minimal map for runtime code so that the filename is
                    // displayed in dev tools.
                    ..Default::default()
                }
            }
            ParseResult::NotFound | ParseResult::Unparseable => {
                EcmascriptChunkItemContent {
                    inner_code: "__turbopack_export_value__({});\n".to_string(),
                    // TODO: We generate a minimal map for runtime code so that the filename is
                    // displayed in dev tools.
                    ..Default::default()
                }
            }
        }
        .cell())
    }
}
