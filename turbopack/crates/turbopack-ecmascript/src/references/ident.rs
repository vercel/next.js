use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::AstPath,
};

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode,
)]
pub struct IdentReplacement {
    value: RcStr,
    path: AstPath,
}

impl IdentReplacement {
    pub fn new(value: RcStr, path: AstPath) -> Self {
        IdentReplacement { value, path }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let value = self.value.clone();

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let id = Expr::Ident((&*value).into());
            *expr = quote!("(\"TURBOPACK ident replacement\", $e)" as Expr, e: Expr = id);
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<IdentReplacement> for CodeGen {
    fn from(val: IdentReplacement) -> Self {
        CodeGen::IdentReplacement(val)
    }
}
