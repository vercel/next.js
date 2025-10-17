use std::borrow::Cow;

use anyhow::Result;
use swc_core::{
    common::GLOBALS,
    ecma::{
        ast::{
            ArrowExpr, AssignOp, AssignTarget, BinExpr, BinaryOp, CallExpr, Callee, Expr,
            ExprOrSpread, ExprStmt, FnExpr, Lit, Module, ModuleItem, Program, Script,
            SimpleAssignTarget, Stmt,
        },
        visit::{Visit, VisitWith},
    },
};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::source::Source;

use crate::{
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
    analyzer::{JsValue, graph::EvalContext},
    parse::{ParseResult, parse},
    utils::unparen,
};

#[turbo_tasks::value(shared, serialization = "none")]
#[derive(Debug)]
pub enum WebpackRuntime {
    Webpack5 {
        /// There is a [JsValue]::FreeVar("chunkId") that need to be replaced
        /// before converting to string
        #[turbo_tasks(trace_ignore)]
        chunk_request_expr: JsValue,
        context_path: FileSystemPath,
    },
    None,
}

fn iife(stmt: &Stmt) -> Option<&Vec<Stmt>> {
    if let Stmt::Expr(ExprStmt { expr, .. }) = &stmt
        && let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        }) = unparen(expr)
    {
        if !args.is_empty() {
            return None;
        }
        return get_fn_body(callee);
    }
    None
}

fn program_iife(program: &Program) -> Option<&Vec<Stmt>> {
    match program {
        Program::Module(Module { body, .. }) => {
            if let [ModuleItem::Stmt(stmt)] = &body[..] {
                return iife(stmt);
            }
        }
        Program::Script(Script { body, .. }) => {
            if let [stmt] = &body[..] {
                return iife(stmt);
            }
        }
    }
    None
}

fn is_webpack_require_decl(stmt: &Stmt) -> bool {
    if let Some(decl) = stmt.as_decl()
        && let Some(fn_decl) = decl.as_fn_decl()
    {
        return &*fn_decl.ident.sym == "__webpack_require__";
    }
    false
}

fn get_assign_target_identifier(expr: &AssignTarget) -> Option<Cow<'_, str>> {
    match expr.as_simple()? {
        SimpleAssignTarget::Ident(ident) => Some(Cow::Borrowed(&*ident.sym)),
        SimpleAssignTarget::Member(member) => {
            if let Some(obj_name) = get_expr_identifier(&member.obj)
                && let Some(ident) = member.prop.as_ident()
            {
                return Some(Cow::Owned(obj_name.into_owned() + "." + &*ident.sym));
            }
            None
        }
        SimpleAssignTarget::Paren(p) => get_expr_identifier(&p.expr),

        _ => None,
    }
}

fn get_expr_identifier(expr: &Expr) -> Option<Cow<'_, str>> {
    let expr = unparen(expr);
    if let Some(ident) = expr.as_ident() {
        return Some(Cow::Borrowed(&*ident.sym));
    }
    if let Some(member) = expr.as_member()
        && let Some(ident) = member.prop.as_ident()
        && let Some(obj_name) = get_expr_identifier(&member.obj)
    {
        return Some(Cow::Owned(obj_name.into_owned() + "." + &*ident.sym));
    }
    None
}

fn get_assignment<'a>(stmts: &'a Vec<Stmt>, property: &str) -> Option<&'a Expr> {
    for stmt in stmts {
        if let Some(stmts) = iife(stmt)
            && let Some(result) = get_assignment(stmts, property)
        {
            return Some(result);
        }
        if let Some(expr_stmt) = stmt.as_expr()
            && let Some(assign) = unparen(&expr_stmt.expr).as_assign()
            && assign.op == AssignOp::Assign
            && let Some(name) = get_assign_target_identifier(&assign.left)
            && name == property
        {
            return Some(unparen(&assign.right));
        }
    }
    None
}

fn get_fn_body(expr: &Expr) -> Option<&Vec<Stmt>> {
    let expr = unparen(expr);
    if let Some(FnExpr { function, .. }) = expr.as_fn_expr()
        && let Some(body) = &function.body
    {
        return Some(&body.stmts);
    }
    if let Some(ArrowExpr { body, .. }) = expr.as_arrow()
        && let Some(block) = body.as_block_stmt()
    {
        return Some(&block.stmts);
    }
    None
}

fn get_javascript_chunk_filename(stmts: &Vec<Stmt>, eval_context: &EvalContext) -> Option<JsValue> {
    if let Some(expr) = get_assignment(stmts, "__webpack_require__.u")
        && let Some(stmts) = get_fn_body(expr)
        && let Some(ret) = stmts.iter().find_map(|stmt| stmt.as_return_stmt())
        && let Some(expr) = &ret.arg
    {
        return Some(eval_context.eval(expr));
    }
    None
}

struct RequirePrefixVisitor {
    result: Option<Lit>,
}

impl Visit for RequirePrefixVisitor {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some(expr) = call.callee.as_expr()
            && let Some(name) = get_expr_identifier(expr)
            && name == "require"
            && let [ExprOrSpread { spread: None, expr }] = &call.args[..]
            && let Some(BinExpr {
                op: BinaryOp::Add,
                left,
                ..
            }) = expr.as_bin()
        {
            self.result = left.as_lit().cloned();
            return;
        }
        call.visit_children_with(self);
    }
}

fn get_require_prefix(stmts: &Vec<Stmt>) -> Option<Lit> {
    if let Some(expr) = get_assignment(stmts, "__webpack_require__.f.require") {
        let mut visitor = RequirePrefixVisitor { result: None };
        expr.visit_children_with(&mut visitor);
        return visitor.result;
    }
    None
}

#[turbo_tasks::function]
pub async fn webpack_runtime(
    source: Vc<Box<dyn Source>>,
    transforms: Vc<EcmascriptInputTransforms>,
) -> Result<Vc<WebpackRuntime>> {
    let parsed = parse(
        source,
        EcmascriptModuleAssetType::Ecmascript,
        transforms,
        false,
        false,
    )
    .await?;
    match &*parsed {
        ParseResult::Ok {
            program,
            eval_context,
            globals,
            ..
        } => {
            if let Some(stmts) = program_iife(program)
                && stmts.iter().any(is_webpack_require_decl)
            {
                // extract webpack/runtime/get javascript chunk filename
                let chunk_filename = GLOBALS.set(globals, || {
                    get_javascript_chunk_filename(stmts, eval_context)
                });

                let prefix_path = get_require_prefix(stmts);

                if let (Some(chunk_filename), Some(prefix_path)) = (chunk_filename, prefix_path) {
                    let value = JsValue::concat(vec![
                        JsValue::Constant(prefix_path.into()),
                        chunk_filename,
                    ]);

                    return Ok(WebpackRuntime::Webpack5 {
                        chunk_request_expr: value,
                        context_path: source.ident().path().await?.parent(),
                    }
                    .into());
                }
            }
        }
        ParseResult::Unparsable { .. } | ParseResult::NotFound => {}
    }
    Ok(WebpackRuntime::None.into())
}
