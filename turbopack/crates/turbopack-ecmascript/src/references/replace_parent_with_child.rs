use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    ecma::{
        ast::{BinExpr, Expr},
        visit::{AstParentKind, fields::BinExprField},
    },
    quote,
};
use turbo_tasks::{NonLocalValue, debug::ValueDebugFormat, trace::TraceRawVcs};

use super::AstPath;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
};

/// Used to replace expressions like `<truthy> || <something>` with `<truthy>`
#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]

pub struct ReplaceParentWithChild {
    path: AstPath,
}

impl ReplaceParentWithChild {
    pub fn new(path: AstPath) -> Self {
        Self { path }
    }

    pub fn code_generation(&self) -> Result<CodeGeneration> {
        let parent_path = &self.path[0..(self.path.len() - 1)];
        let to_replace_with = *self.path.last().unwrap();
        let visitor = create_visitor!(parent_path, visit_mut_expr, |parent_expr: &mut Expr| {
            let child = match parent_expr {
                Expr::Bin(BinExpr {
                    box left,
                    box right,
                    ..
                }) => {
                    let AstParentKind::BinExpr(field) = to_replace_with else {
                        panic!("invalid path");
                    };
                    let child = match field {
                        BinExprField::Left => left.clone(),
                        BinExprField::Right => right.clone(),
                        _ => {
                            panic!("Can only replace with expression children, got {field:?}");
                        }
                    };
                    quote!("(\"TURBOPACK simplified expression\", $e)" as Expr, e: Expr = child)
                }
                _ => todo!("only binary expressions are supported so far"),
            };
            *parent_expr = child;
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ReplaceParentWithChild> for CodeGen {
    fn from(val: ReplaceParentWithChild) -> Self {
        CodeGen::ReplaceBinaryExpressionWithFirstChild(val)
    }
}
