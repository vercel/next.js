#![feature(box_syntax)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(into_future)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
pub mod code_gen;
mod errors;
pub(crate) mod parse;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod target;
pub mod typescript;
pub mod utils;
mod visitor;
pub mod webpack;

use std::future::IntoFuture;

use anyhow::Result;
use chunk::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc, EcmascriptChunkVc,
};
use code_gen::CodeGenerationReferenceVc;
use parse::{parse, ParseResult};
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

use self::chunk::{EcmascriptChunkItemContent, EcmascriptChunkItemContentVc};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    references::module_references,
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
            target: target,
            node_native_bindings,
        })
    }

    #[turbo_tasks::function]
    pub fn as_evaluated_chunk(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new_evaluate(context, self_vc.into()).into()
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
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(module_references(
            self.source,
            self.context,
            Value::new(self.ty),
            self.target,
            self.node_native_bindings,
        ))
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
impl ChunkItem for ModuleChunkItem {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemContentVc> {
        let references = self.module.references();
        let mut code_generation = Vec::new();
        for r in references.await?.iter() {
            if let Some(code_gen) = CodeGenerationReferenceVc::resolve_from(r).await? {
                code_generation.push(code_gen.code_generation().into_future());
            }
        }
        // need to keep that around to allow references into that
        let code_generation = try_join_all(code_generation.into_iter()).await?;
        let code_generation = code_generation.iter().map(|cg| &**cg).collect::<Vec<_>>();
        // TOOD use interval tree with references into "code_generation"
        let mut interval_tree = Vec::new();
        for code_gen in code_generation {
            for (span, visitor) in code_gen.visitors.iter() {
                interval_tree.push((*span, visitor()));
            }
        }

        let module = self.module.await?;
        let parsed = parse(module.source, Value::new(module.ty)).await?;

        if let ParseResult::Ok {
            program,
            source_map,
            ..
        } = &*parsed
        {
            let mut program = program.clone();
            // TODO SWC magic to apply all visitors from the interval tree
            // to the "program" and generate code for that.
            Ok(EcmascriptChunkItemContent {
                inner_code: format!(
                    "console.log(\"todo {}\");",
                    self.module.path().to_string().await?
                ),
                id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
            }
            .into())
        } else {
            Ok(EcmascriptChunkItemContent {
                inner_code: format!("// unparsable {}", self.module.path().to_string().await?),
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
