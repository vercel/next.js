use anyhow::Result;
use swc_core::quote;
use turbopack_core::chunk::ChunkingContextVc;

use super::AstPathVc;
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
};

#[turbo_tasks::value]
pub struct Unreachable {
    path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl UnreachableVc {
    #[turbo_tasks::function]
    pub fn new(path: AstPathVc) -> Self {
        Self::cell(Unreachable { path })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for Unreachable {
    #[turbo_tasks::function]
    async fn code_generation(&self, _context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let path = self.path.await?;
        let visitors = [
            // Unreachable might be used on Stmt or Expr
            create_visitor!(exact path, visit_mut_expr(expr: &mut Expr) {
                *expr = quote!("(\"TURBOPACK unreachable\", undefined)" as Expr);
            }),
            create_visitor!(exact path, visit_mut_stmt(stmt: &mut Stmt) {
                // TODO(WEB-553) walk ast to find all `var` declarations and keep them
                // since they hoist out of the scope
                *stmt = quote!("{\"TURBOPACK unreachable\";}" as Stmt);
            }),
        ]
        .into();

        Ok(CodeGeneration { visitors }.cell())
    }
}
