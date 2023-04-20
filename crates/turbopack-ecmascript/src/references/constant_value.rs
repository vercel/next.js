use anyhow::Result;
use swc_core::quote;
use turbo_tasks::Value;
use turbopack_core::compile_time_info::CompileTimeDefineValue;

use super::AstPathVc;
use crate::{
    chunk::EcmascriptChunkingContextVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
};

#[turbo_tasks::value]
pub struct ConstantValue {
    value: CompileTimeDefineValue,
    path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl ConstantValueVc {
    #[turbo_tasks::function]
    pub fn new(value: Value<CompileTimeDefineValue>, path: AstPathVc) -> Self {
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
        _context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let value = self.value.clone();
        let visitors = [
            create_visitor!(exact &self.path.await?, visit_mut_expr(expr: &mut Expr) {
                *expr = match value {
                    CompileTimeDefineValue::Bool(true) => quote!("(\"TURBOPACK compile-time value\", true)" as Expr),
                    CompileTimeDefineValue::Bool(false) => quote!("(\"TURBOPACK compile-time value\", false)" as Expr),
                    CompileTimeDefineValue::String(ref s) => quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = s.to_string().into()),
                };
            }),
        ]
        .into();

        Ok(CodeGeneration { visitors }.cell())
    }
}
