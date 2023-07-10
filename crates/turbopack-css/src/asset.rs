use anyhow::Result;
use swc_core::{
    common::{Globals, GLOBALS},
    css::{
        ast::{AtRule, AtRulePrelude, Rule},
        codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableModule,
        ChunkableModuleVc, ChunkingContextVc,
    },
    context::AssetContextVc,
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    reference::{AssetReference, AssetReferencesVc},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        PrimaryResolveResult,
    },
};

use crate::{
    chunk::{
        CssChunkItem, CssChunkItemContent, CssChunkItemContentVc, CssChunkItemVc,
        CssChunkPlaceable, CssChunkPlaceableVc, CssChunkVc, CssImport,
    },
    code_gen::{CodeGenerateable, CodeGenerateableVc},
    parse::{
        parse_css, ParseCss, ParseCssResult, ParseCssResultSourceMap, ParseCssResultVc, ParseCssVc,
    },
    path_visitor::ApplyVisitors,
    references::{
        analyze_css_stylesheet, compose::CssModuleComposeReferenceVc,
        import::ImportAssetReferenceVc,
    },
    transform::CssInputTransformsVc,
    CssModuleAssetType,
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("css".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct CssModuleAsset {
    source: AssetVc,
    context: AssetContextVc,
    transforms: CssInputTransformsVc,
    ty: CssModuleAssetType,
}

#[turbo_tasks::value_impl]
impl CssModuleAssetVc {
    /// Creates a new CSS asset.
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        transforms: CssInputTransformsVc,
        ty: CssModuleAssetType,
    ) -> Self {
        Self::cell(CssModuleAsset {
            source,
            context,
            transforms,
            ty,
        })
    }

    /// Retrns the asset ident of the source without the "css" modifier
    #[turbo_tasks::function]
    pub async fn source_ident(self) -> Result<AssetIdentVc> {
        Ok(self.await?.source.ident())
    }
}

#[turbo_tasks::value_impl]
impl ParseCss for CssModuleAsset {
    #[turbo_tasks::function]
    fn parse_css(&self) -> ParseCssResultVc {
        parse_css(self.source, self.ty, self.transforms)
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident().with_modifier(modifier())
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
            this.ty,
            this.transforms,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for CssModuleAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: CssModuleAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        CssChunkVc::new(context, self_vc.into(), availability_info).into()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: CssModuleAssetVc, context: ChunkingContextVc) -> CssChunkItemVc {
        CssModuleChunkItemVc::cell(CssModuleChunkItem {
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
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.context
    }
}

#[turbo_tasks::value]
struct CssModuleChunkItem {
    module: CssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<CssChunkItemContentVc> {
        let references = &*self.module.references().await?;
        let mut imports = vec![];
        let context = self.context;

        for reference in references.iter() {
            if let Some(import_ref) = ImportAssetReferenceVc::resolve_from(reference).await? {
                for result in import_ref.resolve_reference().await?.primary.iter() {
                    if let PrimaryResolveResult::Asset(asset) = result {
                        if let Some(placeable) = CssChunkPlaceableVc::resolve_from(asset).await? {
                            imports.push(CssImport::Internal(
                                import_ref,
                                placeable.as_chunk_item(context),
                            ));
                        }
                    }
                }
            } else if let Some(compose_ref) =
                CssModuleComposeReferenceVc::resolve_from(reference).await?
            {
                for result in compose_ref.resolve_reference().await?.primary.iter() {
                    if let PrimaryResolveResult::Asset(asset) = result {
                        if let Some(placeable) = CssChunkPlaceableVc::resolve_from(asset).await? {
                            imports.push(CssImport::Composes(placeable.as_chunk_item(context)));
                        }
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
            for import in &code_gen.imports {
                imports.push(import.clone());
            }

            for (path, visitor) in code_gen.visitors.iter() {
                if path.is_empty() {
                    root_visitors.push(&**visitor);
                } else {
                    visitors.push((path, &**visitor));
                }
            }
        }

        let parsed = self.module.parse_css().await?;

        if let ParseCssResult::Ok {
            stylesheet,
            source_map,
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
                    &Rule::AtRule(box AtRule {
                        prelude: Some(box AtRulePrelude::ImportPrelude(_)),
                        ..
                    })
                )
            });

            let mut code_string = String::new();
            let mut srcmap = vec![];

            let mut code_gen = CodeGenerator::new(
                BasicCssWriter::new(&mut code_string, Some(&mut srcmap), Default::default()),
                Default::default(),
            );

            code_gen.emit(&stylesheet)?;

            let srcmap = ParseCssResultSourceMap::new(source_map.clone(), srcmap).cell();

            Ok(CssChunkItemContent {
                inner_code: code_string.into(),
                imports,
                source_map: Some(srcmap),
            }
            .into())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!(
                    "/* unparseable {} */",
                    self.module.ident().to_string().await?
                )
                .into(),
                imports: vec![],
                source_map: None,
            }
            .into())
        }
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }
}
