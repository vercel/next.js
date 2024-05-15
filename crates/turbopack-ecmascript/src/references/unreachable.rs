use anyhow::Result;
use swc_core::quote;
use turbo_tasks::Vc;
use turbopack_core::chunk::ChunkingContext;

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[turbo_tasks::value]
pub struct Unreachable {
    path: Vc<AstPath>,
}

#[turbo_tasks::value_impl]
impl Unreachable {
    #[turbo_tasks::function]
    pub fn new(path: Vc<AstPath>) -> Vc<Self> {
        Self::cell(Unreachable { path })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for Unreachable {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
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
