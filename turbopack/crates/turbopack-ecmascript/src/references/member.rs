use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    atoms::atom,
    base::SwcComments,
    common::{
        DUMMY_SP, Span,
        comments::{Comment, CommentKind, Comments},
    },
    ecma::ast::{Expr, MemberExpr, MemberProp},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

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
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let comments = SwcComments::default();

        let key = self.key.clone();
        let value = self.value.clone();

        let comments_clone = comments.clone();
        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let span = Span::dummy_with_cmt();

            comments_clone.add_leading(
                span.lo,
                Comment {
                    kind: CommentKind::Block,
                    span: DUMMY_SP,
                    text: atom!("TURBOPACK member replacement"),
                },
            );
            let member = Expr::Member(MemberExpr {
                span,
                obj: Box::new(Expr::Ident((&*key).into())),
                prop: MemberProp::Ident((&*value).into()),
            });
            *expr = quote!("$e" as Expr, e: Expr = member);
        });

        Ok(CodeGeneration::visitors_with_comments(
            vec![visitor],
            comments,
        ))
    }
}

impl From<MemberReplacement> for CodeGen {
    fn from(val: MemberReplacement) -> Self {
        CodeGen::MemberReplacement(val)
    }
}
