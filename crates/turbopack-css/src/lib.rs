#![feature(min_specialization)]

use std::future::IntoFuture;

use anyhow::Result;
use swc_common::{Globals, GLOBALS};
use swc_css_ast::{AtRule, AtRulePrelude, Rule};
use swc_css_codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit};
use swc_css_visit::{VisitMutWith, VisitMutWithPath};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferencesVc},
};

pub mod chunk;
mod code_gen;
pub mod embed;
pub(crate) mod parse;
mod path_visitor;
pub(crate) mod references;

use crate::{
    chunk::{
        CssChunkContextVc, CssChunkItem, CssChunkItemContent, CssChunkItemContentVc,
        CssChunkItemVc, CssChunkPlaceable, CssChunkPlaceableVc, CssChunkVc,
    },
    code_gen::CodeGenerateableVc,
    parse::{parse, ParseResult},
    path_visitor::ApplyVisitors,
    references::{analyze_css_stylesheet, import::ImportAssetReferenceVc},
};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct CssModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl CssModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::cell(CssModuleAsset { source, context })
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssModuleAsset {
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
        Ok(analyze_css_stylesheet(self.source, self.context))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: CssModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        CssChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: CssModuleAssetVc, context: ChunkingContextVc) -> CssChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssModuleAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (css)",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: CssModuleAssetVc,
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
impl CssChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        chunk_context: CssChunkContextVc,
        context: ChunkingContextVc,
    ) -> Result<CssChunkItemContentVc> {
        let references = &*self.module.references().await?;
        let mut imports = vec![];

        for reference in references.iter() {
            if let Some(import) = ImportAssetReferenceVc::resolve_from(reference).await? {
                for asset in &*import.resolve_reference().primary_assets().await? {
                    if CssChunkPlaceableVc::resolve_from(asset).await?.is_some() {
                        imports.push((import, asset.path().to_string()));
                    }
                }
            }
        }

        let mut code_gens = Vec::new();
        for r in references.iter() {
            if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
                code_gens.push(
                    code_gen
                        .code_generation(chunk_context, context)
                        .into_future(),
                );
            }
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
        let parsed = parse(module.source).await?;

        if let ParseResult::Ok {
            stylesheet,
            source_map: _,
            ..
        } = &*parsed
        {
            let mut stylesheet = stylesheet.clone();

            let globals = Globals::new();
            GLOBALS.set(&globals, || {
                if !visitors.is_empty() {
                    stylesheet.visit_mut_with_path(
                        &mut ApplyVisitors::new(visitors),
                        &mut Default::default(),
                    );
                }
                for visitor in root_visitors {
                    stylesheet.visit_mut_with(&mut visitor.create());
                }
            });

            // remove imports
            stylesheet.rules.retain(|r| {
                !matches!(
                    r,
                    &Rule::AtRule(AtRule {
                        prelude: Some(AtRulePrelude::ImportPrelude(_)),
                        ..
                    })
                )
            });

            let mut code_string = format!("/* {} */\n", self.module.path().to_string().await?);

            // TODO: pass sourcemap somehow (second param in the css writer)?
            let mut code_gen = CodeGenerator::new(
                BasicCssWriter::new(&mut code_string, None, Default::default()),
                Default::default(),
            );

            code_gen.emit(&stylesheet)?;

            Ok(CssChunkItemContent {
                inner_code: code_string,
                path: self.module.path().to_string(),
                imports,
            }
            .into())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!(
                    "/* unparseable {} */",
                    self.module.path().to_string().await?
                ),
                path: self.module.path().to_string(),
                imports: vec![],
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
