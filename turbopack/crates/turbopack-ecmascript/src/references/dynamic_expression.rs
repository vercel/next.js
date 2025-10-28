use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::quote;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use super::AstPath;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

#[derive(PartialEq, Eq, TraceRawVcs, Serialize, Deserialize, ValueDebugFormat, NonLocalValue)]
enum DynamicExpressionType {
    Promise,
    Normal,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct DynamicExpression {
    path: AstPath,
    ty: DynamicExpressionType,
}

impl DynamicExpression {
    pub fn new(path: AstPath) -> Self {
        DynamicExpression {
            path,
            ty: DynamicExpressionType::Normal,
        }
    }

    pub fn new_promise(path: AstPath) -> Self {
        DynamicExpression {
            path,
            ty: DynamicExpressionType::Promise,
        }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let visitor = match self.ty {
            DynamicExpressionType::Normal => {
                create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
                    *expr = quote!(
                        "(() => { const e = new Error(\"Cannot find module as expression is too \
                         dynamic\"); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
                            as Expr
                    );
                })
            }
            DynamicExpressionType::Promise => {
                create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
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
