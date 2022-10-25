use anyhow::Result;
use swc_core::{
    common::{Globals, GLOBALS},
    css::{
        ast::{AtRule, AtRulePrelude, Rule},
        codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferencesVc},
    resolve::origin::{ResolveOrigin, ResolveOriginVc},
};

use crate::{
    chunk::{
        CssChunkItem, CssChunkItemContent, CssChunkItemContentVc, CssChunkItemVc,
        CssChunkPlaceable, CssChunkPlaceableVc, CssChunkVc,
    },
    code_gen::CodeGenerateableVc,
    parse::{parse, ParseResult, ParseResultVc},
    path_visitor::ApplyVisitors,
    references::{analyze_css_stylesheet, import::ImportAssetReferenceVc},
    transform::CssInputTransformsVc,
    CssModuleAssetType,
};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct CssModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub transforms: CssInputTransformsVc,
    pub ty: CssModuleAssetType,
}

#[turbo_tasks::value_impl]
impl CssModuleAssetVc {
    /// Creates a new CSS asset. The CSS is treated as global CSS.
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc, transforms: CssInputTransformsVc) -> Self {
        Self::cell(CssModuleAsset {
            source,
            context,
            transforms,
            ty: CssModuleAssetType::Global,
        })
    }

    /// Creates a new CSS asset. The CSS is treated as CSS module.
    #[turbo_tasks::function]
    pub fn new_module(
        source: AssetVc,
        context: AssetContextVc,
        transforms: CssInputTransformsVc,
    ) -> Self {
        Self::cell(CssModuleAsset {
            source,
            context,
            transforms,
            ty: CssModuleAssetType::Module,
        })
    }

    /// Returns the parsed css.
    #[turbo_tasks::function]
    pub(crate) async fn parse(self) -> Result<ParseResultVc> {
        let this = self.await?;
        Ok(parse(this.source, Value::new(this.ty), this.transforms))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: CssModuleAssetVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        // TODO: include CSS source map
        Ok(analyze_css_stylesheet(
            this.source,
            self_vc.as_resolve_origin(),
            Value::new(this.ty),
            this.transforms,
        ))
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
impl ResolveOrigin for CssModuleAsset {
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
    module: CssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (css)",
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
impl CssChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<CssChunkItemContentVc> {
        let references = &*self.module.references().await?;
        let mut imports = vec![];
        let context = self.context;

        for reference in references.iter() {
            if let Some(import) = ImportAssetReferenceVc::resolve_from(reference).await? {
                for asset in &*import.resolve_reference().primary_assets().await? {
                    if let Some(placeable) = CssChunkPlaceableVc::resolve_from(asset).await? {
                        imports.push((import, placeable.as_chunk_item(context)));
                    }
                }
            }
        }

        let mut code_gens = Vec::new();
        for r in references.iter() {
            if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
                code_gens.push(code_gen.code_generation(context));
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

        let parsed = self.module.parse().await?;

        if let ParseResult::Ok { stylesheet, .. } = &*parsed {
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
                    &Rule::AtRule(box AtRule {
                        prelude: Some(box AtRulePrelude::ImportPrelude(_)),
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
                imports,
            }
            .into())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!(
                    "/* unparseable {} */",
                    self.module.path().to_string().await?
                ),
                imports: vec![],
            }
            .into())
        }
    }
}
