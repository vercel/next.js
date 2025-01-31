use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::RcStr;
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct IdentReplacement {
    value: RcStr,
    path: ResolvedVc<AstPath>,
}

impl IdentReplacement {
    pub fn new(value: RcStr, path: ResolvedVc<AstPath>) -> Self {
        IdentReplacement { value, path }
    }

    pub async fn code_generation(
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

impl Into<CodeGen> for IdentReplacement {
    fn into(self) -> CodeGen {
        CodeGen::IdentReplacement(self)
    }
}
