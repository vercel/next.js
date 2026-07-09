//! A dedicated module type for the whole-module reconstruction ("facade") of a
//! split, statically-analyzable CommonJS module.
//!
//! Whole-module consumers (`require()`, `import * as ns`) need the reassembled,
//! mutable `module.exports`.

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        AssignExpr, AssignOp, AssignTarget, Expr, ExprStmt, Ident, IdentName, MemberExpr,
        MemberProp, SimpleAssignTarget, Stmt,
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset, ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
    resolve::{ExportUsage, ModulePart},
};

use crate::{
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptAnalyzableExt,
    EcmascriptModuleAsset, EcmascriptModuleContent, EcmascriptModuleContentOptions,
    SpecifiedModuleType,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt, CodeGens},
    references::esm::base::EsmAssetReferences,
    runtime_functions::TURBOPACK_IMPORT,
    tree_shake::part::module::EcmascriptModulePartAsset,
    utils::module_id_to_lit,
};

/// The whole-module reconstruction of a split CommonJS module. See the module
/// docs.
#[turbo_tasks::value]
pub struct EcmascriptModuleCjsFacadeModule {
    module: ResolvedVc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleCjsFacadeModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<EcmascriptModuleAsset>) -> Vc<Self> {
        EcmascriptModuleCjsFacadeModule { module }.cell()
    }
}

impl EcmascriptModuleCjsFacadeModule {
    /// The module's statically-known export names (source order) and whether it
    /// carries the transpiled-ESM `__esModule` marker.
    async fn static_exports(&self) -> Result<(Vec<RcStr>, bool)> {
        let exports = self.module.get_exports().await?;
        let EcmascriptExports::StaticCommonJs(cjs) = &*exports else {
            bail!("EcmascriptModuleCjsFacadeModule must wrap a StaticCommonJs module");
        };
        let cjs = cjs.await?;
        Ok((cjs.names.to_vec(), cjs.has_es_module))
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleCjsFacadeModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .module
            .ident()
            .owned()
            .await?
            .with_part(ModulePart::Facade)
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        // Graph edges to the two parts the facade is built from: the module
        // evaluation part (side effects) and the exports part (values). These
        // create the chunking edges; the runtime imports are emitted by
        // `CjsFacadeExportsCodeGen`.
        //
        // Mirrors the `ModulePart::Facade` arm of
        // `EcmascriptModulePartAsset::references` in `tree_shake/part/module.rs`
        // (the ESM facade's equivalent dependency declaration).
        let part_dep =
            |part: ModulePart, export: Vc<ExportUsage>| -> Vc<Box<dyn ModuleReference>> {
                Vc::upcast(SingleChunkableModuleReference::new(
                    Vc::upcast(EcmascriptModulePartAsset::new_with_resolved_part(
                        *self.module,
                        part,
                    )),
                    rcstr!("part reference"),
                    export,
                ))
            };

        Ok(Vc::cell(vec![
            part_dep(ModulePart::evaluation(), ExportUsage::evaluation())
                .to_resolved()
                .await?,
            part_dep(ModulePart::exports(), ExportUsage::all())
                .to_resolved()
                .await?,
        ]))
    }

    #[turbo_tasks::function]
    fn is_self_async(&self) -> Vc<bool> {
        // CommonJS modules are never async.
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        // The facade runs the module-evaluation part, so it has whatever side
        // effects the original module does.
        self.module.side_effects()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModuleCjsFacadeModule {
    #[turbo_tasks::function]
    fn analyze(&self) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        bail!("EcmascriptModuleCjsFacadeModule::analyze shouldn't be called");
    }

    #[turbo_tasks::function]
    fn module_content_without_analysis(
        &self,
        _generate_source_map: bool,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        bail!(
            "EcmascriptModuleCjsFacadeModule::module_content_without_analysis shouldn't be called"
        );
    }

    #[turbo_tasks::function]
    async fn module_content_options(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let this = self.await?;
        let (names, has_es_module) = this.static_exports().await?;

        let code_generation =
            Vc::<CodeGens>::cell(vec![CodeGen::CjsFacadeExports(CjsFacadeExportsCodeGen {
                module: this.module,
                names,
                has_es_module,
            })])
            .to_resolved()
            .await?;

        Ok(EcmascriptModuleContentOptions {
            parsed: None,
            module: ResolvedVc::upcast(self),
            specified_module_type: SpecifiedModuleType::CommonJs,
            chunking_context,
            references: self.references().to_resolved().await?,
            part_references: vec![],
            esm_references: EsmAssetReferences::empty().to_resolved().await?,
            code_generation,
            async_module: self.get_async_module().to_resolved().await?,
            generate_source_map: false,
            original_source_map: None,
            exports: self.get_exports().to_resolved().await?,
            async_module_info,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleCjsFacadeModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        // Keep the original module's CommonJS exports so importer-side interop
        // treats the facade like the original module.
        self.module.get_exports()
    }

    // `get_async_module` uses the trait default (`None`) — CommonJS is never async.

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let content = self.module_content(chunking_context, async_module_info);
        Ok(EcmascriptChunkItemContent::new(
            content,
            chunking_context,
            self.get_async_module().module_options(async_module_info),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleCjsFacadeModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModuleCjsFacadeModule {}

/// Emits the CommonJS facade body: import the evaluation part (side effects) and
/// the exports part (values), then rebuild `module.exports` with native writes.
#[derive(
    Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, ValueDebugFormat, NonLocalValue, Encode, Decode,
)]
pub struct CjsFacadeExportsCodeGen {
    module: ResolvedVc<EcmascriptModuleAsset>,
    names: Vec<RcStr>,
    has_es_module: bool,
}

impl CjsFacadeExportsCodeGen {
    /// Emits the facade body. For `names = ["foo", "bar"]` and
    /// `has_es_module = true`:
    ///
    /// ```js
    /// __turbopack_context__.i(<module evaluation part>);
    /// var __TURBOPACK_cjs_facade_exports__ = __turbopack_context__.i(<exports part>);
    /// exports.__esModule = true;
    /// exports.foo = __TURBOPACK_cjs_facade_exports__.foo;
    /// exports.bar = __TURBOPACK_cjs_facade_exports__.bar;
    /// ```
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let eval_id = EcmascriptModulePartAsset::new_with_resolved_part(
            *self.module,
            ModulePart::evaluation(),
        )
        .chunk_item_id(chunking_context)
        .await?;
        let exports_id =
            EcmascriptModulePartAsset::new_with_resolved_part(*self.module, ModulePart::exports())
                .chunk_item_id(chunking_context)
                .await?;

        // `var __TURBOPACK_cjs_facade_exports__ = __turbopack_context__.i(<exports part>);`
        let ns = Ident::new(
            "__TURBOPACK_cjs_facade_exports__".into(),
            DUMMY_SP,
            Default::default(),
        );

        let hoisted = vec![
            // Run the module's side effects first, like `require()` would.
            CodeGenerationHoistedStmt::new(
                rcstr!("cjs facade evaluation"),
                quote!(
                    "$turbopack_import($id);" as Stmt,
                    turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                    id: Expr = module_id_to_lit(&eval_id),
                ),
            ),
            CodeGenerationHoistedStmt::new(
                rcstr!("cjs facade exports"),
                quote!(
                    "var $name = $turbopack_import($id);" as Stmt,
                    name = ns.clone(),
                    turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                    id: Expr = module_id_to_lit(&exports_id),
                ),
            ),
        ];

        // `exports.NAME = <ns>.NAME` writes, plus the `__esModule` marker first.
        let mut late = Vec::with_capacity(self.names.len() + self.has_es_module as usize);
        if self.has_es_module {
            late.push(CodeGenerationHoistedStmt::new(
                rcstr!("cjs facade __esModule"),
                exports_write("__esModule", quote!("true" as Expr)),
            ));
        }
        for name in &self.names {
            late.push(CodeGenerationHoistedStmt::new(
                format!("cjs facade export {name}").into(),
                exports_write(name, Expr::Member(member(ns.clone(), name))),
            ));
        }

        Ok(CodeGeneration::new(vec![], hoisted, vec![], late, vec![]))
    }
}

/// `exports.<prop> = <value>;`
fn exports_write(prop: &str, value: Expr) -> Stmt {
    let exports = Ident::new("exports".into(), DUMMY_SP, Default::default());
    Stmt::Expr(ExprStmt {
        span: DUMMY_SP,
        expr: Box::new(Expr::Assign(AssignExpr {
            span: DUMMY_SP,
            op: AssignOp::Assign,
            left: AssignTarget::Simple(SimpleAssignTarget::Member(member(exports, prop))),
            right: Box::new(value),
        })),
    })
}

/// `<obj>.<prop>`
fn member(obj: Ident, prop: &str) -> MemberExpr {
    MemberExpr {
        span: DUMMY_SP,
        obj: Box::new(Expr::Ident(obj)),
        prop: MemberProp::Ident(IdentName {
            span: DUMMY_SP,
            sym: prop.into(),
        }),
    }
}

impl From<CjsFacadeExportsCodeGen> for CodeGen {
    fn from(val: CjsFacadeExportsCodeGen) -> Self {
        CodeGen::CjsFacadeExports(val)
    }
}
