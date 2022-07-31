#![feature(min_specialization)]
#![feature(into_future)]

use anyhow::Result;
use swc_css_ast::{AtRule, AtRulePrelude, Rule};
use swc_css_codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
};

pub mod chunk;
pub mod embed;
pub(crate) mod parse;
pub(crate) mod references;

use crate::{
    chunk::{
        CssChunkContextVc, CssChunkItem, CssChunkItemContent, CssChunkItemContentVc,
        CssChunkItemVc, CssChunkPlaceable, CssChunkPlaceableVc, CssChunkVc,
    },
    parse::{parse, ParseResult},
    references::{analyze_css_stylesheet, import::ImportAssetReferenceVc},
};

#[turbo_tasks::value(Asset, CssChunkPlaceable, ChunkableAsset, ValueToString)]
#[derive(Clone)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::cell(ModuleAsset { source, context })
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
        Ok(analyze_css_stylesheet(self.source, self.context))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        CssChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> CssChunkItemVc {
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
            "{} (css)",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value(ChunkItem, CssChunkItem)]
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
impl CssChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        _chunk_context: CssChunkContextVc,
        _context: ChunkingContextVc,
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

        let module = self.module.await?;
        let parsed = parse(module.source).await?;

        if let ParseResult::Ok {
            stylesheet,
            source_map: _,
            ..
        } = &*parsed
        {
            let mut stylesheet = stylesheet.clone();

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
