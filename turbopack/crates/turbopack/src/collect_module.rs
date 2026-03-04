use std::io::Write;

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystem, VirtualFileSystem, rope::RopeBuilder};
use turbopack_core::{
    self,
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    reference_type::ReferenceType,
    source::{OptionSource, Source},
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_ESM, TURBOPACK_IMPORT},
    utils::StringifyJs,
};

use crate::{ModuleAssetContext, module_options::CustomModuleType};

#[turbo_tasks::value]
pub struct CollectModuleType {}

#[turbo_tasks::value_impl]
impl CollectModuleType {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        CollectModuleType {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for CollectModuleType {
    #[turbo_tasks::function]
    fn create_module(
        self: turbo_tasks::Vc<Self>,
        _source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<Box<dyn Module>>> {
        let ReferenceType::Collect { namespace } = reference_type else {
            bail!(
                "CollectModuleType only supports \
                 EcmaScriptModulesReferenceSubType::ImportWithTurbopackCollect"
            );
        };

        Ok(Vc::upcast(CollectModule::new(
            namespace,
            module_asset_context,
        )))
    }

    #[turbo_tasks::function]
    fn extend_ecmascript_transforms(
        self: turbo_tasks::Vc<Self>,
        _preprocess: Vc<EcmascriptInputTransforms>,
        _main: Vc<EcmascriptInputTransforms>,
        _postprocess: Vc<EcmascriptInputTransforms>,
    ) -> Result<Vc<Box<dyn CustomModuleType>>> {
        bail!("CollectModuleType does not support ECMAScript transforms")
    }
}

#[turbo_tasks::value]
pub struct CollectModule {
    namespace: RcStr,
    module_asset_context: ResolvedVc<ModuleAssetContext>,
}

#[turbo_tasks::value_impl]
impl CollectModule {
    #[turbo_tasks::function]
    pub fn new(namespace: RcStr, module_asset_context: ResolvedVc<ModuleAssetContext>) -> Vc<Self> {
        CollectModule {
            namespace,
            module_asset_context,
        }
        .cell()
    }
}

/// Each entry point in the HMR system has an ident with a different nested asset.
/// This produces the 'base' ident for the HMR entry point, which is then modified
#[turbo_tasks::function]
fn virtual_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name(rcstr!("turbopack-collect"))
}

#[turbo_tasks::value_impl]
impl Module for CollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(virtual_fs().root().owned().await?)
            .with_modifier(self.namespace.clone()))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CollectModule {
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
impl EcmascriptChunkPlaceable for CollectModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let collect = module_graph.collect().await?;
        let items = collect.get(&self.namespace);

        let chunk_item_id_strategy = chunking_context.chunk_item_id_strategy().await?;

        let items = items
            .into_iter()
            .flatten()
            .map(async |(module, data)| {
                Ok((
                    chunk_item_id_strategy.get_id_from_module(**module).await?,
                    data,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect::<FxIndexMap<_, _>>();

        let mut code = RopeBuilder::default();

        code += "const data = ([\n";
        for (id, data) in items {
            writeln!(
                code,
                "{{id: {}, data: {}, import: () => {TURBOPACK_IMPORT}({})}},",
                StringifyJs(&id),
                StringifyJs(data),
                StringifyJs(&id),
            )?;
        }
        code += "]);";
        code += "function getList() { return data; }";

        writeln!(
            code,
            "{TURBOPACK_ESM}([
    'getList', ()=>getList
]);"
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            ..Default::default()
        }
        .cell())
    }
}
