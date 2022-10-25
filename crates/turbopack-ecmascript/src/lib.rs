#![feature(box_syntax)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(str_split_as_str)]
#![feature(int_roundings)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
pub mod chunk_group_files_asset;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub(crate) mod parse;
mod path_visitor;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub(crate) mod transform;
pub mod typescript;
pub mod utils;
pub mod webpack;

use anyhow::Result;
use chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemVc, EcmascriptChunkPlaceablesVc, EcmascriptChunkVc,
};
use code_gen::CodeGenerateableVc;
use parse::{parse, ParseResult, ParseResultSourceMap};
use path_visitor::ApplyVisitors;
use references::AnalyzeEcmascriptModuleResult;
use swc_core::{
    common::GLOBALS,
    ecma::{
        codegen::{text_writer::JsWriter, Emitter},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
pub use transform::{EcmascriptInputTransform, EcmascriptInputTransformsVc};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    environment::EnvironmentVc,
    reference::AssetReferencesVc,
    resolve::origin::{ResolveOrigin, ResolveOriginVc},
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
pub enum EcmascriptModuleAssetType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
}

#[turbo_tasks::value]
#[derive(Clone, Copy)]
pub struct EcmascriptModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: EcmascriptModuleAssetType,
    pub transforms: EcmascriptInputTransformsVc,
    pub environment: EnvironmentVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<EcmascriptModuleAssetType>,
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
            self.as_resolve_origin(),
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
    fn content(&self) -> AssetContentVc {
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
impl ResolveOrigin for EcmascriptModuleAsset {
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
    module: EcmascriptModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (ecmascript)",
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
        let AnalyzeEcmascriptModuleResult {
            references,
            code_generation,
            ..
        } = &*self.module.analyze().await?;
        let context = self.context;
        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
                code_gens.push(code_gen.code_generation(context));
            }
        }
        for c in code_generation.await?.iter() {
            code_gens.push(c.code_generation(context));
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
            eval_context,
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
                program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));
            });

            let mut bytes: Vec<u8> = vec![];
            // TODO: Insert this as a sourceless segment so that sourcemaps aren't affected.
            // = format!("/* {} */\n", self.module.path().to_string().await?).into_bytes();

            let mut srcmap = vec![];

            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config {
                    ..Default::default()
                },
                cm: source_map.clone(),
                comments: None,
                wr: JsWriter::new(source_map.clone(), "\n", &mut bytes, Some(&mut srcmap)),
            };

            emitter.emit_program(&program)?;

            let srcmap = ParseResultSourceMap::new(source_map.clone(), srcmap).cell();

            Ok(EcmascriptChunkItemContent {
                inner_code: String::from_utf8(bytes)?,
                source_map: Some(srcmap),
                options: if eval_context.is_esm() {
                    EcmascriptChunkItemOptions {
                        ..Default::default()
                    }
                } else {
                    EcmascriptChunkItemOptions {
                        // These things are not available in ESM
                        module: true,
                        exports: true,
                        this: true,
                        ..Default::default()
                    }
                },
                ..Default::default()
            }
            .into())
        } else {
            Ok(EcmascriptChunkItemContent {
                inner_code: format!(
                    "const e = new Error(\"Could not parse module '{path}'\");\ne.code = \
                     'MODULE_UNPARSEABLE';\nthrow e;",
                    path = self.module.path().to_string().await?
                ),
                ..Default::default()
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
