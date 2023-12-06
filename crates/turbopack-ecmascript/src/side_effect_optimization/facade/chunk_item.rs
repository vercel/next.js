use std::sync::Arc;

use anyhow::{bail, Result};
use swc_core::{
    common::{util::take::Take, Globals, GLOBALS},
    ecma::{
        ast::Program,
        codegen::{text_writer::JsWriter, Emitter},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
use turbo_tasks::{TryJoinIterExt, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use super::module::EcmascriptModuleFacadeModule;
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptChunkingContext,
        EcmascriptExports,
    },
    code_gen::{CodeGenerateable, CodeGenerateableWithAsyncModuleInfo},
    path_visitor::ApplyVisitors,
};

/// The chunk item for [EcmascriptModuleFacadeModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleReexportsChunkItem {
    pub(crate) module: Vc<EcmascriptModuleFacadeModule>,
    pub(crate) chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModuleReexportsChunkItem {
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

        let async_module = async_module_options.await?.clone_value();

        let mut code = RopeBuilder::default();

        let mut code_gens = Vec::new();
        for r in self.module.references().await?.iter() {
            let r = r.resolve().await?;
            if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateableWithAsyncModuleInfo>>(r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context, async_module_info));
            } else if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateable>>(r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context));
            }
        }

        code_gens.push(exports.code_generation(chunking_context));
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();

        let mut visitors = Vec::new();
        let mut root_visitors = Vec::new();
        for code_gen in code_gens {
            for (path, visitor) in code_gen.visitors.iter() {
                if path.is_empty() {
                    root_visitors.push(&**visitor);
                } else {
                    visitors.push((path, &**visitor));
                }
            }
        }

        let mut program = Program::Module(swc_core::ecma::ast::Module::dummy());
        GLOBALS.set(&Globals::new(), || {
            if !visitors.is_empty() {
                program.visit_mut_with_path(
                    &mut ApplyVisitors::new(visitors),
                    &mut Default::default(),
                );
            }
            for visitor in root_visitors {
                program.visit_mut_with(&mut visitor.create());
            }

            program.visit_mut_with(&mut swc_core::ecma::transforms::base::hygiene::hygiene());
            program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));
        });

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
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModuleReexportsChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn asset_ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self.module.ident())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
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
