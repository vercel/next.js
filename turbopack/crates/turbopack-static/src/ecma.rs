use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AssetSuffix, AsyncModuleInfo, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssetsWithReferenced},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_URL, TURBOPACK_EXPORT_VALUE},
    utils::StringifyJs,
};

use crate::output_asset::StaticOutputAsset;

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticUrlJsModule {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub tag: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl StaticUrlJsModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, tag: Option<RcStr>) -> Vc<Self> {
        Self::cell(StaticUrlJsModule { source, tag })
    }

    #[turbo_tasks::function]
    fn static_output_asset(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<StaticOutputAsset> {
        StaticOutputAsset::new(*chunking_context, *self.source, self.tag.clone())
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticUrlJsModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let mut ident = self
            .source
            .ident()
            .with_modifier(rcstr!("static in ecmascript"));
        if let Some(tag) = &self.tag {
            ident = ident.with_modifier(format!("tag {}", tag).into());
        }
        ident
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for StaticUrlJsModule {
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
impl EcmascriptChunkPlaceable for StaticUrlJsModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let static_asset = self.static_output_asset(chunking_context);
        let url = chunking_context
            .asset_url(static_asset.path().owned().await?, this.tag.clone())
            .await?;

        let url_behavior = chunking_context.url_behavior(this.tag.clone()).await?;

        let inner_code = match &url_behavior.suffix {
            AssetSuffix::None => {
                // No suffix, export as-is
                format!(
                    "{TURBOPACK_EXPORT_VALUE}({path});",
                    path = StringifyJs(&url)
                )
            }
            AssetSuffix::Constant(suffix) => {
                // Append constant suffix
                format!(
                    "{TURBOPACK_EXPORT_VALUE}({path} + {suffix});",
                    path = StringifyJs(&url),
                    suffix = StringifyJs(suffix.as_str())
                )
            }
            AssetSuffix::Inferred => {
                // The runtime logic will infer the suffix
                format!("{TURBOPACK_EXPORT_URL}({path});", path = StringifyJs(&url))
            }
            AssetSuffix::FromGlobal(global_name) => {
                // Read suffix from global at runtime
                format!(
                    "{TURBOPACK_EXPORT_VALUE}({path} + (globalThis[{global}] || ''));",
                    path = StringifyJs(&url),
                    global = StringifyJs(global_name)
                )
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: inner_code.into(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        static_url_js_output_assets(self, chunking_context)
    }
}

#[turbo_tasks::function]
async fn static_url_js_output_assets(
    module: Vc<StaticUrlJsModule>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<OutputAssetsWithReferenced>> {
    let static_asset = module
        .static_output_asset(chunking_context)
        .to_resolved()
        .await?;
    Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(vec![
        ResolvedVc::upcast(static_asset),
    ])))
}
