use anyhow::Result;
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbopack_core::{self, resolve::parse::Request};

/// Creates a IIFE expression that throws a "Cannot find module" error for the
/// given request string
pub fn throw_module_not_found_expr(request: &str) -> Expr {
    let message = format!("Cannot find module '{request}'");
    quote!(
        "(() => { const e = new Error($message); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
            as Expr,
        message: Expr = message.into()
    )
}

/// Creates a IIFE expression that throws a "Cannot find module" error for the
/// given request string
pub fn throw_module_not_found_error_expr(request: &str, message: &str) -> Expr {
    let message = format!("Cannot find module '{request}': {message}");
    quote!(
        "(() => { const e = new Error($message); e.code = 'MODULE_NOT_FOUND'; throw e; })()"
            as Expr,
        message: Expr = message.into()
    )
}

#[turbo_tasks::function]
pub async fn request_to_string(request: Vc<Request>) -> Result<Vc<RcStr>> {
    Ok(Vc::cell(
        request
            .await?
            .request()
            // TODO: Handle Request::Dynamic, Request::Alternatives
            .unwrap_or(rcstr!("unknown")),
    ))
}
