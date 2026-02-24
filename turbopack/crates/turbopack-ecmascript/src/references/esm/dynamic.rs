use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, util::take::Take},
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ChunkingTypeOption},
    environment::ChunkLoading,
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        BindingUsage, ExportUsage, ModuleResolveResult, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    analyzer::imports::ImportAnnotations,
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
};

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("dynamic import {request}")]
pub struct EsmAsyncAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub annotations: ImportAnnotations,
    pub issue_source: IssueSource,
    pub error_mode: ResolveErrorMode,
    pub import_externals: bool,
    /// The export usage extracted from the dynamic import usage pattern.
    /// Detected from destructured await, member access on await, .then()
    /// callback destructuring, or webpackExports/turbopackExports comments.
    pub export_usage: ExportUsage,
}

impl EsmAsyncAssetReference {
    fn get_origin(&self) -> Vc<Box<dyn ResolveOrigin>> {
        if let Some(transition) = self.annotations.transition() {
            self.origin.with_transition(transition.into())
        } else {
            *self.origin
        }
    }
}

impl EsmAsyncAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        error_mode: ResolveErrorMode,
        import_externals: bool,
        export_usage: ExportUsage,
    ) -> Self {
        EsmAsyncAssetReference {
            origin,
            request,
            issue_source,
            annotations,
            error_mode,
            import_externals,
            export_usage,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        esm_resolve(
            self.get_origin().resolve().await?,
            *self.request,
            EcmaScriptModulesReferenceSubType::DynamicImport,
            self.error_mode,
            Some(self.issue_source),
        )
        .await
    }

    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Async))
    }

    #[turbo_tasks::function]
    fn binding_usage(&self) -> Vc<BindingUsage> {
        BindingUsage {
            import: Default::default(),
            export: self.export_usage.clone(),
        }
        .cell()
    }
}

impl IntoCodeGenReference for EsmAsyncAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct EsmAsyncAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<EsmAsyncAssetReference>,
}

impl EsmAsyncAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            if matches!(
                *chunking_context.environment().chunk_loading().await?,
                ChunkLoading::Edge
            ) {
                ResolveType::ChunkItem
            } else {
                ResolveType::AsyncChunkLoader
            },
        )
        .await?;

        let import_externals = reference.import_externals;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: key_expr,
                    }) => {
                        *expr = pm.create_import(*key_expr, import_externals);
                        return;
                    }
                    // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                    Some(ExprOrSpread {
                        spread: Some(_),
                        expr: _,
                    }) => "spread operator is illegal in import() expressions.",
                    _ => "import() expressions require at least 1 argument",
                }
            } else {
                "visitor must be executed on a CallExpr"
            };
            let error = quote_expr!(
                "() => { throw new Error($message); }",
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
            *expr = Expr::Call(CallExpr {
                callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                args: vec![ExprOrSpread {
                    spread: None,
                    expr: error,
                }],
                span: DUMMY_SP,
                ..Default::default()
            });
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
