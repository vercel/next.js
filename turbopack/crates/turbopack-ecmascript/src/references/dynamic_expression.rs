use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::quote;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
enum DynamicExpressionType {
    Promise,
    Normal,
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode,
)]
pub struct DynamicExpression {
    path: AstPathId,
    ty: DynamicExpressionType,
}

impl DynamicExpression {
    pub fn new(path: AstPathId) -> Self {
        DynamicExpression {
            path,
            ty: DynamicExpressionType::Normal,
        }
    }

    pub fn new_promise(path: AstPathId) -> Self {
        DynamicExpression {
            path,
            ty: DynamicExpressionType::Promise,
        }
    }

    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let visitor = match self.ty {
            DynamicExpressionType::Normal => {
                create_visitor!(trie, self.path, visit_mut_expr, |expr: &mut Expr| {
                    *expr = quote!(
                        "(() => { const e = new Error(\"Cannot find module as expression is too \
                         dynamic\"); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
                            as Expr
                    );
                })
            }
            DynamicExpressionType::Promise => {
                create_visitor!(trie, self.path, visit_mut_expr, |expr: &mut Expr| {
                    *expr = quote!(
                        "Promise.resolve().then(() => { const e = new Error(\"Cannot find module \
                         as expression is too dynamic\"); e.code = 'MODULE_NOT_FOUND'; throw e; })"
                            as Expr
                    );
                })
            }
        };

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<DynamicExpression> for CodeGen {
    fn from(val: DynamicExpression) -> Self {
        CodeGen::DynamicExpression(val)
    }
}
