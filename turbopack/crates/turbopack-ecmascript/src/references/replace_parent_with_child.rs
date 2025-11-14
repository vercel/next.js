use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
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
#[derive(
    PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash,
)]

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
        let AstParentKind::BinExpr(field) = to_replace_with else {
            panic!("invalid path, must point at a BinExpr not a {to_replace_with:?}");
        };
        let visitor = create_visitor!(parent_path, visit_mut_expr, |parent_expr: &mut Expr| {
            match parent_expr {
                Expr::Bin(BinExpr { left, right, .. }) => {
                    let child = match field {
                        BinExprField::Left => left.take(),
                        BinExprField::Right => right.take(),
                        _ => {
                            panic!("Can only replace with expression children, got {field:?}");
                        }
                    };
                    *parent_expr = quote!("(\"TURBOPACK simplified expression\", $e)" as Expr, e: Expr = *child);
                }

                _ => {
                    // do nothing, the AST must have been modified and our operator or child
                    // removed.
                }
            };
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ReplaceParentWithChild> for CodeGen {
    fn from(val: ReplaceParentWithChild) -> Self {
        CodeGen::ReplaceParentWithChild(val)
    }
}
