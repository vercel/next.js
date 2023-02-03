use anyhow::Result;
use swc_core::quote;
use turbo_tasks::Value;
use turbopack_core::chunk::ChunkingContextVc;

use super::AstPathVc;
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Copy, Hash, PartialOrd, Ord)]
pub enum ConstantConditionValue {
    Truthy,
    Falsy,
    Nullish,
}

#[turbo_tasks::value]
pub struct ConstantCondition {
    value: ConstantConditionValue,
    path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl ConstantConditionVc {
    #[turbo_tasks::function]
    pub fn new(value: Value<ConstantConditionValue>, path: AstPathVc) -> Self {
        Self::cell(ConstantCondition {
            value: value.into_value(),
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ConstantCondition {
    #[turbo_tasks::function]
    async fn code_generation(&self, _context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let value = self.value;
        let visitors = [
            create_visitor!(exact &self.path.await?, visit_mut_expr(expr: &mut Expr) {
                *expr = match value {
                    ConstantConditionValue::Truthy => quote!("(\"TURBOPACK compile-time truthy\", 1)" as Expr),
                    ConstantConditionValue::Falsy => quote!("(\"TURBOPACK compile-time falsy\", 0)" as Expr),
                    ConstantConditionValue::Nullish => quote!("(\"TURBOPACK compile-time nullish\", null)" as Expr),
                };
            }),
        ]
        .into();

        Ok(CodeGeneration { visitors }.cell())
    }
}
