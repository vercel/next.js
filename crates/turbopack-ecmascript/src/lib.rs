#![feature(box_syntax)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(into_future)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub(crate) mod parse;
mod path_visitor;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod target;
pub mod typescript;
pub mod utils;
pub mod webpack;
use std::future::IntoFuture;

use anyhow::Result;
use chunk::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc, EcmascriptChunkVc,
};
use code_gen::CodeGenerateableVc;
use parse::{parse, ParseResult};
use path_visitor::ApplyVisitors;
use swc_common::GLOBALS;
use swc_ecma_codegen::{text_writer::JsWriter, Emitter};
use swc_ecma_visit::{VisitMutWith, VisitMutWithPath};
use target::CompileTargetVc;
use turbo_tasks::{
    primitives::StringVc, util::try_join_all, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
};

use self::{
    chunk::{EcmascriptChunkItemContent, EcmascriptChunkItemContentVc},
    references::{AnalyseEcmascriptModuleResult, AnalyseEcmascriptModuleResultVc},
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    references::analyze_ecmascript_module,
};

#[turbo_tasks::value(serialization: auto_for_input)]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleAssetType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
}

#[turbo_tasks::value(Asset, EcmascriptChunkPlaceable, ChunkableAsset, ValueToString)]
#[derive(Clone)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: ModuleAssetType,
    pub target: CompileTargetVc,
    pub node_native_bindings: bool,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<ModuleAssetType>,
        target: CompileTargetVc,
        node_native_bindings: bool,
    ) -> Self {
        Self::cell(ModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            target,
            node_native_bindings,
        })
    }

    #[turbo_tasks::function]
    pub fn as_evaluated_chunk(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new_evaluate(context, self_vc.into()).into()
    }

    #[turbo_tasks::function]
    pub async fn analyze(self) -> Result<AnalyseEcmascriptModuleResultVc> {
        let this = self.await?;
        Ok(analyze_ecmascript_module(
            this.source,
            this.context,
            Value::new(this.ty),
            this.target,
            this.node_native_bindings,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(self_vc: ModuleAssetVc) -> Result<AssetReferencesVc> {
        Ok(self_vc.analyze().await?.references)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (ecmascript)",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value(ChunkItem, EcmascriptChunkItem)]
struct ModuleChunkItem {
    module: ModuleAssetVc,
    context: ChunkingContextVc,
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
    async fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemContentVc> {
        let AnalyseEcmascriptModuleResult {
            references,
            code_generation,
        } = &*self.module.analyze().await?;
        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
                code_gens.push(
                    code_gen
                        .code_generation(chunk_context, context)
                        .into_future(),
                );
            }
        }
        for c in code_generation.await?.iter() {
            code_gens.push(c.code_generation(chunk_context, context).into_future());
        }
        // need to keep that around to allow references into that
        let code_gens = try_join_all(code_gens.into_iter()).await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();
        // TOOD use interval tree with references into "code_gens"
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

        let module = self.module.await?;
        let parsed = parse(module.source, Value::new(module.ty)).await?;

        if let ParseResult::Ok {
            program,
            source_map,
            globals,
            ..
        } = &*parsed
        {
            let mut program = program.clone();

            GLOBALS.set(globals, || {
                if !visitors.is_empty() {
                    program.visit_mut_with_path(
                        &mut ApplyVisitors::new(visitors),
                        &mut Default::default(),
                    );
                }
                for visitor in root_visitors {
                    program.visit_mut_with(&mut visitor.create());
                }
                program.visit_mut_with(&mut swc_ecma_transforms_base::fixer::fixer(None));
            });

            let mut bytes =
                format!("/* {} */\n", self.module.path().to_string().await?).into_bytes();

            let mut emitter = Emitter {
                cfg: swc_ecma_codegen::Config {
                    ..Default::default()
                },
                cm: source_map.clone(),
                comments: None,
                wr: JsWriter::new(source_map.clone(), "\n", &mut bytes, None),
            };

            emitter.emit_program(&program)?;

            // TODO SWC magic to apply all visitors from the interval tree
            // to the "program" and generate code for that.
            Ok(EcmascriptChunkItemContent {
                inner_code: String::from_utf8(bytes)?,
                id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
            }
            .into())
        } else {
            Ok(EcmascriptChunkItemContent {
                inner_code: format!("/* unparsable {} */", self.module.path().to_string().await?),
                id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
            }
            .into())
        }
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
