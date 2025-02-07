use std::sync::Arc;

use anyhow::{bail, Result};
use swc_core::{
    common::{util::take::Take, Globals},
    ecma::{
        ast::Program,
        codegen::{text_writer::JsWriter, Emitter},
    },
};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
};

use super::module::EcmascriptModuleFacadeModule;
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptExports,
    },
    code_gen::CodeGenerateable,
    process_content_with_code_gens,
};

/// The chunk item for [EcmascriptModuleFacadeModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleFacadeChunkItem {
    pub(crate) module: ResolvedVc<EcmascriptModuleFacadeModule>,
    pub(crate) module_graph: ResolvedVc<ModuleGraph>,
    pub(crate) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModuleFacadeChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunking_context = self.chunking_context;
        let exports = self.module.get_exports();
        let EcmascriptExports::EsmExports(exports) = *exports.await? else {
            bail!("Expected EsmExports");
        };

        let externals = *chunking_context
            .environment()
            .supports_commonjs_externals()
            .await?;

        let async_module_options = self
            .module
            .get_async_module()
            .module_options(async_module_info);

        let async_module = async_module_options.owned().await?;

        let mut code = RopeBuilder::default();

        let references = self.module.references();
        let references_ref = references.await?;
        let mut code_gens = Vec::with_capacity(references_ref.len() + 2);
        for r in &references_ref {
            if let Some(code_gen) = ResolvedVc::try_sidecast::<Box<dyn CodeGenerateable>>(*r) {
                code_gens.push(code_gen.code_generation(*self.module_graph, *chunking_context));
            }
        }
        code_gens.push(self.module.async_module().code_generation(
            async_module_info,
            references,
            *self.module_graph,
            *chunking_context,
        ));
        code_gens.push(exports.code_generation(*self.module_graph, *chunking_context));
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg);

        let mut program = Program::Module(swc_core::ecma::ast::Module::dummy());
        process_content_with_code_gens(&mut program, &Globals::new(), None, code_gens);

        let mut bytes: Vec<u8> = vec![];

        let source_map: Arc<swc_core::common::SourceMap> = Default::default();

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: None,
            wr: JsWriter::new(source_map.clone(), "\n", &mut bytes, None),
        };

        emitter.emit_program(&program)?;

        code.push_bytes(&bytes);

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            source_map: None,
            options: EcmascriptChunkItemOptions {
                strict: true,
                externals,
                async_module,
                ..Default::default()
            },
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModuleFacadeChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
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
