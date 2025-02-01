use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::quote;
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[derive(PartialEq, Eq, TraceRawVcs, Serialize, Deserialize, ValueDebugFormat, NonLocalValue)]
enum DynamicExpressionType {
    Promise,
    Normal,
}

#[turbo_tasks::value]
pub struct DynamicExpression {
    path: ResolvedVc<AstPath>,
    ty: DynamicExpressionType,
}

#[turbo_tasks::value_impl]
impl DynamicExpression {
    #[turbo_tasks::function]
    pub fn new(path: ResolvedVc<AstPath>) -> Vc<Self> {
        Self::cell(DynamicExpression {
            path,
            ty: DynamicExpressionType::Normal,
        })
    }

    #[turbo_tasks::function]
    pub fn new_promise(path: ResolvedVc<AstPath>) -> Vc<Self> {
        Self::cell(DynamicExpression {
            path,
            ty: DynamicExpressionType::Promise,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for DynamicExpression {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let path = &self.path.await?;

        let visitor = match self.ty {
            DynamicExpressionType::Normal => {
                create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                    *expr = quote!("(() => { const e = new Error(\"Cannot find module as expression is too dynamic\"); e.code = 'MODULE_NOT_FOUND'; throw e; })()" as Expr);
                })
            }
            DynamicExpressionType::Promise => {
                create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                    *expr = quote!("Promise.resolve().then(() => { const e = new Error(\"Cannot find module as expression is too dynamic\"); e.code = 'MODULE_NOT_FOUND'; throw e; })" as Expr);
                })
            }
        };

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
