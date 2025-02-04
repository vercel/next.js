use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, MemberExpr, MemberProp},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[turbo_tasks::value]
pub struct MemberReplacement {
    key: RcStr,
    value: RcStr,
    path: ResolvedVc<AstPath>,
}

#[turbo_tasks::value_impl]
impl MemberReplacement {
    #[turbo_tasks::function]
    pub async fn new(key: RcStr, value: RcStr, path: Vc<AstPath>) -> Result<Vc<Self>> {
        Ok(Self::cell(MemberReplacement {
            key,
            value,
            path: path.to_resolved().await?,
        }))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for MemberReplacement {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let key = self.key.clone();
        let value = self.value.clone();
        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
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
