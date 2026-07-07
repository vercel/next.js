use anyhow::Result;
use swc_core::ecma::ast::{
    ArrowExpr, CallExpr, Callee, Expr, ExprStmt, FnExpr, Module, ModuleItem, Program, Script, Stmt,
};
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{compile_time_info::CompileTimeInfo, source::Source};

use crate::{
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
    parse::{ParseResult, parse},
    utils::unparen,
};

#[turbo_tasks::value(shared, serialization = "skip")]
#[derive(Debug)]
pub enum WebpackRuntime {
    Webpack5 { context_path: FileSystemPath },
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

#[turbo_tasks::function]
pub async fn webpack_runtime(
    source: Vc<Box<dyn Source>>,
    transforms: Vc<EcmascriptInputTransforms>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Result<Vc<WebpackRuntime>> {
    let node_env = compile_time_info
        .await?
        .defines
        .read_process_env(rcstr!("NODE_ENV"))
        .owned()
        .await?
        .unwrap_or_else(|| rcstr!("development"));
    let parsed = parse(
        source,
        EcmascriptModuleAssetType::Ecmascript,
        transforms,
        node_env,
        false,
        false,
    )
    .await?;
    match &*parsed {
        ParseResult::Ok { program, .. } => {
            if let Some(stmts) = program_iife(program)
                && stmts.iter().any(is_webpack_require_decl)
            {
                return Ok(WebpackRuntime::Webpack5 {
                    context_path: source.ident().await?.path.parent(),
                }
                .cell());
            }
        }
        ParseResult::Unparsable { .. } | ParseResult::NotFound => {}
    }
    Ok(WebpackRuntime::None.cell())
}
