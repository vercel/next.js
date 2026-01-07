use std::sync::Arc;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{Expr, ExprStmt, ModuleItem, ObjectLit, Stmt},
        codegen::{Emitter, text_writer::JsWriter},
    },
    quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkType, ChunkableModule, ChunkableModuleReference, ChunkingContext,
        MinifyType, ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    issue::IssueSource,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    output::OutputAssetsReference,
    reference::{ModuleReference, ModuleReferences},
    resolve::{ModuleResolveResult, origin::ResolveOrigin},
    source::Source,
};

use crate::{
    EcmascriptChunkPlaceable,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports,
    },
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::module_id_to_lit,
};

/// Reference to `import.meta.glob()`, which will be replaced with a require to a
/// synthetic module that exports an object mapping paths to import functions.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ImportMetaGlobAssetReference {
    pub inner: ResolvedVc<ImportMetaGlobAsset>,
    pub pattern: RcStr,
    pub eager: bool,
    pub import: Option<RcStr>,

    pub issue_source: Option<IssueSource>,
    pub in_try: bool,
}

impl ImportMetaGlobAssetReference {
    pub async fn new(
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        pattern: RcStr,
        eager: bool,
        import: Option<RcStr>,
        issue_source: Option<IssueSource>,
        in_try: bool,
    ) -> Result<Self> {
        let inner = ImportMetaGlobAsset {
            source,
            origin,
            pattern: pattern.clone(),
            eager,
            import: import.clone(),
        }
        .resolved_cell();

        Ok(ImportMetaGlobAssetReference {
            inner,
            pattern,
            eager,
            import,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.inner))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("import.meta.glob {}", self.pattern).into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ImportMetaGlobAssetReference {}

impl IntoCodeGenReference for ImportMetaGlobAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::ImportMetaGlobAssetReferenceCodeGen(ImportMetaGlobAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ImportMetaGlobAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<ImportMetaGlobAssetReference>,
}

impl ImportMetaGlobAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let module_id = self
            .reference
            .await?
            .inner
            .chunk_item_id(chunking_context)
            .await?;

        let mut visitors = Vec::new();

        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(_) = expr {
                    *expr = Expr::Call(
                        quote_expr!(
                            "$turbopack_require($id)",
                            turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                            id: Expr = module_id_to_lit(&module_id)
                        )
                        .expect_call(),
                    );
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ResolvedModuleReference(ResolvedVc<ModuleResolveResult>);

#[turbo_tasks::value_impl]
impl ModuleReference for ResolvedModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *self.0
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ResolvedModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("resolved reference".into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ResolvedModuleReference {}

#[turbo_tasks::value]
pub struct ImportMetaGlobAsset {
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,

    pattern: RcStr,
    eager: bool,
    import: Option<RcStr>,
}

fn modifier(pattern: &RcStr, eager: bool, import: &Option<RcStr>) -> RcStr {
    let mut parts = vec![format!("import.meta.glob {}", pattern)];
    if eager {
        parts.push("eager".to_string());
    }
    if let Some(import_name) = import {
        parts.push(format!("import:{}", import_name));
    }
    parts.join(" ").into()
}

#[turbo_tasks::value_impl]
impl Module for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier(&self.pattern, self.eager, &self.import))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(Vec::new()))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unimplemented!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            ImportMetaGlobChunkItem {
                module_graph,
                chunking_context,
                inner: self,
                origin: this.origin,
                eager: this.eager,
                import: this.import.clone(),
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
pub struct ImportMetaGlobChunkItem {
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    inner: ResolvedVc<ImportMetaGlobAsset>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    eager: bool,
    import: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ImportMetaGlobChunkItem {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ImportMetaGlobChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let minify = self.chunking_context.minify_type().await?;

        // Generate: { './file.js': () => import('./file.js'), ... }
        let import_map = ObjectLit {
            span: DUMMY_SP,
            props: vec![],
        };

        let expr = quote_expr!(
            "$turbopack_export_value($obj);",
            turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into(),
            obj: Expr = Expr::Object(import_map),
        );

        // Export the generated object
        let module = swc_core::ecma::ast::Module {
            span: DUMMY_SP,
            body: vec![ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr,
            }))],
            shebang: None,
        };

        let source_map: Arc<swc_core::common::SourceMap> = Default::default();

        let mut bytes: Vec<u8> = vec![];
        let mut wr: JsWriter<'_, &mut Vec<u8>> =
            JsWriter::new(source_map.clone(), "\n", &mut bytes, None);
        if matches!(*minify, MinifyType::Minify { .. }) {
            wr.set_indent_str("");
        }

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: None,
            wr,
        };

        emitter.emit_module(&module)?;

        Ok(EcmascriptChunkItemContent {
            inner_code: bytes.into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ImportMetaGlobChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.inner)
    }
}
