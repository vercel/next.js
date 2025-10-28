use anyhow::{Context, Result};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext,
        MergeableModuleExposure, MergeableModules, MergeableModulesExposed,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::ModuleReferences,
};

use crate::{
    EcmascriptAnalyzable, EcmascriptModuleContent, EcmascriptOptions,
    chunk::{EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType},
};

#[turbo_tasks::value(shared)]
pub(crate) struct MergedEcmascriptModule {
    modules: Vec<(
        ResolvedVc<Box<dyn EcmascriptAnalyzable>>,
        MergeableModuleExposure,
    )>,
    entry_points: Vec<ResolvedVc<Box<dyn EcmascriptAnalyzable>>>,
    options: ResolvedVc<EcmascriptOptions>,
}

impl MergedEcmascriptModule {
    pub async fn new(
        modules: Vc<MergeableModulesExposed>,
        entry_points: Vc<MergeableModules>,
        options: ResolvedVc<EcmascriptOptions>,
    ) -> Result<ResolvedVc<Self>> {
        Ok(MergedEcmascriptModule {
            modules: modules
                .await?
                .iter()
                .map(|(m, exposed)| {
                    Ok((
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m)
                            .context("expected EcmascriptAnalyzable")?,
                        *exposed,
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            entry_points: entry_points
                .await?
                .iter()
                .map(|m| {
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m)
                        .context("expected EcmascriptAnalyzable")
                })
                .collect::<Result<Vec<_>>>()?,
            options,
        }
        .resolved_cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for MergedEcmascriptModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        panic!("content() should not be called");
    }
}

#[turbo_tasks::value_impl]
impl Module for MergedEcmascriptModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        // This purposely reuses the module's ident as it has replaced the original module, thus
        // there can never be a collision.
        self.entry_points.first().unwrap().ident()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        panic!("references() should not be called");
    }

    #[turbo_tasks::function]
    async fn is_self_async(&self) -> Result<Vc<bool>> {
        panic!("is_self_async() should not be called");
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for MergedEcmascriptModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        Vc::upcast(
            MergedEcmascriptModuleChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct MergedEcmascriptModuleChunkItem {
    module: ResolvedVc<MergedEcmascriptModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for MergedEcmascriptModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for MergedEcmascriptModuleChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should not be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let module = self.module.await?;
        let modules = &module.modules;
        let entry_points = &module.entry_points;
        let options = modules
            .iter()
            .map(|(m, _)| m.module_content_options(*self.chunking_context, async_module_info))
            .collect::<Vec<_>>();

        let content = EcmascriptModuleContent::new_merged(
            modules.clone(),
            options,
            ResolvedVc::deref_vec(entry_points.clone()),
        );

        // Currently, merged modules never include async modules.
        let async_module_options = Vc::cell(None);

        Ok(EcmascriptChunkItemContent::new(
            content,
            *self.chunking_context,
            async_module_options,
        ))
    }
}
