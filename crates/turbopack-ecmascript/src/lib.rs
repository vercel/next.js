#![feature(box_syntax)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(str_split_as_str)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
pub mod chunk_group_files_asset;
pub mod code_gen;
mod emitter;
mod errors;
pub mod magic_identifier;
pub(crate) mod parse;
mod path_visitor;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod typescript;
pub mod utils;
pub mod webpack;

use anyhow::Result;
use chunk::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc,
    EcmascriptChunkPlaceablesVc, EcmascriptChunkVc,
};
use code_gen::CodeGenerateableVc;
use parse::{parse, ParseResult};
pub use parse::{EcmascriptInputTransform, EcmascriptInputTransformsVc};
use path_visitor::ApplyVisitors;
use references::AnalyzeEcmascriptModuleResult;
use swc_common::GLOBALS;
use swc_ecma_codegen::{text_writer::JsWriter, Emitter};
use swc_ecma_visit::{VisitMutWith, VisitMutWithPath};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    environment::EnvironmentVc,
    reference::AssetReferencesVc,
};

use self::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemContentVc, EcmascriptChunkItemOptions,
        EcmascriptExportsVc,
    },
    references::AnalyzeEcmascriptModuleResultVc,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    references::analyze_ecmascript_module,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleAssetType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
}

#[turbo_tasks::value]
#[derive(Clone, Copy)]
pub struct EcmascriptModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: ModuleAssetType,
    pub transforms: EcmascriptInputTransformsVc,
    pub environment: EnvironmentVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<ModuleAssetType>,
        transforms: EcmascriptInputTransformsVc,
        environment: EnvironmentVc,
    ) -> Self {
        Self::cell(EcmascriptModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            transforms,
            environment,
        })
    }

    #[turbo_tasks::function]
    pub async fn as_evaluated_chunk(
        self_vc: EcmascriptModuleAssetVc,
        context: ChunkingContextVc,
        runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
    ) -> Result<ChunkVc> {
        Ok(EcmascriptChunkVc::new_evaluate(context, self_vc.into(), runtime_entries).into())
    }

    #[turbo_tasks::function]
    pub async fn analyze(self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        let this = self.await?;
        Ok(analyze_ecmascript_module(
            this.source,
            this.context,
            Value::new(this.ty),
            this.transforms,
            this.environment,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptModuleAssetVc) -> Result<AssetReferencesVc> {
        Ok(self_vc.analyze().await?.references)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: EcmascriptModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: EcmascriptModuleAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }

    #[turbo_tasks::function]
    async fn get_exports(self_vc: EcmascriptModuleAssetVc) -> Result<EcmascriptExportsVc> {
        Ok(self_vc.analyze().await?.exports)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (ecmascript)",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: EcmascriptModuleAssetVc,
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
        let AnalyzeEcmascriptModuleResult {
            references,
            code_generation,
            ..
        } = &*self.module.analyze().await?;
        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
                code_gens.push(code_gen.code_generation(chunk_context, context));
            }
        }
        for c in code_generation.await?.iter() {
            code_gens.push(c.code_generation(chunk_context, context));
        }
        // need to keep that around to allow references into that
        let code_gens = code_gens.into_iter().try_join().await?;
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
        let parsed = parse(module.source, Value::new(module.ty), module.transforms).await?;

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

            Ok(EcmascriptChunkItemContent {
                inner_code: String::from_utf8(bytes)?,
                id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
                options: EcmascriptChunkItemOptions {
                    // TODO disable that for ESM
                    module: true,
                    exports: true,
                    ..Default::default()
                },
            }
            .into())
        } else {
            Ok(EcmascriptChunkItemContent {
                inner_code: format!(
                    "/* unparseable {} */",
                    self.module.path().to_string().await?
                ),
                id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
                options: EcmascriptChunkItemOptions {
                    ..Default::default()
                },
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
