use anyhow::Result;
use swc_core::{
    common::{Globals, GLOBALS},
    css::{
        ast::{AtRule, AtRulePrelude, Rule},
        codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    resolve::origin::ResolveOrigin,
    source::Source,
};

use crate::{
    chunk::{CssChunk, CssChunkItem, CssChunkItemContent, CssChunkPlaceable, CssImport},
    code_gen::CodeGenerateable,
    parse::{parse_css, ParseCss, ParseCssResult, ParseCssResultSourceMap},
    path_visitor::ApplyVisitors,
    references::{
        analyze_css_stylesheet, compose::CssModuleComposeReference, import::ImportAssetReference,
    },
    transform::CssInputTransforms,
    CssModuleAssetType,
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("css".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct CssModuleAsset {
    source: Vc<Box<dyn Source>>,
    asset_context: Vc<Box<dyn AssetContext>>,
    transforms: Vc<CssInputTransforms>,
    ty: CssModuleAssetType,
}

#[turbo_tasks::value_impl]
impl CssModuleAsset {
    /// Creates a new CSS asset.
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Source>>,
        asset_context: Vc<Box<dyn AssetContext>>,
        transforms: Vc<CssInputTransforms>,
        ty: CssModuleAssetType,
    ) -> Vc<Self> {
        Self::cell(CssModuleAsset {
            source,
            asset_context,
            transforms,
            ty,
        })
    }

    /// Retrns the asset ident of the source without the "css" modifier
    #[turbo_tasks::function]
    pub async fn source_ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        Ok(self.await?.source.ident())
    }
}

#[turbo_tasks::value_impl]
impl ParseCss for CssModuleAsset {
    #[turbo_tasks::function]
    fn parse_css(&self) -> Vc<ParseCssResult> {
        parse_css(self.source, self.ty, self.transforms)
    }
}

#[turbo_tasks::value_impl]
impl Module for CssModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        // TODO: include CSS source map
        Ok(analyze_css_stylesheet(
            this.source,
            Vc::upcast(self),
            this.ty,
            this.transforms,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(CssChunk::new(
            chunking_context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn CssChunkItem>> {
        Vc::upcast(CssModuleChunkItem::cell(CssModuleChunkItem {
            module: self,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for CssModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        self.asset_context
    }
}

#[turbo_tasks::value]
struct CssModuleChunkItem {
    module: Vc<CssModuleAsset>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<CssChunkItemContent>> {
        let references = &*self.module.references().await?;
        let mut imports = vec![];
        let chunking_context = self.chunking_context;

        for reference in references.iter() {
            if let Some(import_ref) =
                Vc::try_resolve_downcast_type::<ImportAssetReference>(*reference).await?
            {
                for &module in import_ref
                    .resolve_reference()
                    .primary_modules()
                    .await?
                    .iter()
                {
                    if let Some(placeable) =
                        Vc::try_resolve_downcast::<Box<dyn CssChunkPlaceable>>(module).await?
                    {
                        imports.push(CssImport::Internal(
                            import_ref,
                            placeable.as_chunk_item(chunking_context),
                        ));
                    }
                }
            } else if let Some(compose_ref) =
                Vc::try_resolve_downcast_type::<CssModuleComposeReference>(*reference).await?
            {
                for &module in compose_ref
                    .resolve_reference()
                    .primary_modules()
                    .await?
                    .iter()
                {
                    if let Some(placeable) =
                        Vc::try_resolve_downcast::<Box<dyn CssChunkPlaceable>>(module).await?
                    {
                        imports.push(CssImport::Composes(
                            placeable.as_chunk_item(chunking_context),
                        ));
                    }
                }
            }
        }

        let mut code_gens = Vec::new();
        for r in references.iter() {
            if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateable>>(*r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context));
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
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }
}
