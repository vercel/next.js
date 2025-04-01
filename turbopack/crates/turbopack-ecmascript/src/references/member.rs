use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, MemberExpr, MemberProp},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct MemberReplacement {
    key: RcStr,
    value: RcStr,
    path: AstPath,
}

impl MemberReplacement {
    pub fn new(key: RcStr, value: RcStr, path: AstPath) -> Self {
        MemberReplacement { key, value, path }
    }

    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let key = self.key.clone();
        let value = self.value.clone();

        let visitor = create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            let member = Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: Box::new(Expr::Ident((&*key).into())),
                prop: MemberProp::Ident((&*value).into()),
            });
            *expr = quote!("(\"TURBOPACK member replacement\", $e)" as Expr, e: Expr = member);
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<MemberReplacement> for CodeGen {
    fn from(val: MemberReplacement) -> Self {
        CodeGen::MemberReplacement(val)
    }
}
