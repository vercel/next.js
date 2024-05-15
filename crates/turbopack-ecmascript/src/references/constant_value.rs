use anyhow::Result;
use swc_core::quote;
use turbo_tasks::{Value, Vc};
use turbopack_core::{chunk::ChunkingContext, compile_time_info::CompileTimeDefineValue};

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[turbo_tasks::value]
pub struct ConstantValue {
    value: CompileTimeDefineValue,
    path: Vc<AstPath>,
}

#[turbo_tasks::value_impl]
impl ConstantValue {
    #[turbo_tasks::function]
    pub fn new(value: Value<CompileTimeDefineValue>, path: Vc<AstPath>) -> Vc<Self> {
        Self::cell(ConstantValue {
            value: value.into_value(),
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ConstantValue {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let value = self.value.clone();
        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            *expr = match value {
                CompileTimeDefineValue::Bool(true) => quote!("(\"TURBOPACK compile-time value\", true)" as Expr),
                CompileTimeDefineValue::Bool(false) => quote!("(\"TURBOPACK compile-time value\", false)" as Expr),
                CompileTimeDefineValue::String(ref s) => quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = s.to_string().into()),
                CompileTimeDefineValue::JSON(ref s) => quote!("(\"TURBOPACK compile-time value\", JSON.parse($e))" as Expr, e: Expr = s.to_string().into()),
            };
        });

        Ok(CodeGeneration {
            visitors: vec![visitor],
        }
        .cell())
    }
}
