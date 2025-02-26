use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::quote;
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::AstPath;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

#[derive(
    Copy, Clone, Hash, PartialEq, Eq, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum ConstantConditionValue {
    Truthy,
    Falsy,
    Nullish,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct ConstantConditionCodeGen {
    value: ConstantConditionValue,
    path: AstPath,
}

impl ConstantConditionCodeGen {
    pub fn new(value: ConstantConditionValue, path: AstPath) -> Self {
        ConstantConditionCodeGen { value, path }
    }

    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let value = self.value;
        let visitors = [
            create_visitor!(exact self.path, visit_mut_expr(expr: &mut Expr) {
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

impl From<ConstantConditionCodeGen> for CodeGen {
    fn from(val: ConstantConditionCodeGen) -> Self {
        CodeGen::ConstantConditionCodeGen(val)
    }
}
