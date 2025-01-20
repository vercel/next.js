use anyhow::Result;
use swc_core::quote;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Copy, Hash)]
pub enum ConstantConditionValue {
    Truthy,
    Falsy,
    Nullish,
}

#[turbo_tasks::value]
pub struct ConstantCondition {
    value: ConstantConditionValue,
    path: ResolvedVc<AstPath>,
}

#[turbo_tasks::value_impl]
impl ConstantCondition {
    #[turbo_tasks::function]
    pub fn new(value: Value<ConstantConditionValue>, path: ResolvedVc<AstPath>) -> Vc<Self> {
        Self::cell(ConstantCondition {
            value: value.into_value(),
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ConstantCondition {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
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

        Ok(CodeGeneration::visitors(visitors))
    }
}
