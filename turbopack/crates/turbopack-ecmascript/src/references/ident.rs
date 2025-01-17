use anyhow::Result;
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[turbo_tasks::value]
pub struct IdentReplacement {
    value: RcStr,
    path: ResolvedVc<AstPath>,
}

#[turbo_tasks::value_impl]
impl IdentReplacement {
    #[turbo_tasks::function]
    pub async fn new(value: RcStr, path: Vc<AstPath>) -> Result<Vc<Self>> {
        Ok(Self::cell(IdentReplacement {
            value,
            path: path.to_resolved().await?,
        }))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for IdentReplacement {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let value = self.value.clone();
        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            let id = Expr::Ident((&*value).into());
            *expr = quote!("(\"TURBOPACK ident replacement\", $e)" as Expr, e: Expr = id);
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
