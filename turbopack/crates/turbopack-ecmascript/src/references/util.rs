use anyhow::Result;
use swc_core::{ecma::ast::Expr, quote};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, rope::Rope};
use turbopack_core::{
    resolve::parse::Request,
    source_map::{
        GenerateSourceMap, OptionStringifiedSourceMap, utils::resolve_source_map_sources,
    },
};

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

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct InlineSourceMap {
    /// The file path of the module containing the sourcemap data URL
    pub origin_path: ResolvedVc<FileSystemPath>,
    /// The Base64 encoded JSON sourcemap string
    pub source_map: RcStr,
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for InlineSourceMap {
    #[turbo_tasks::function]
    pub async fn generate_source_map(&self) -> Result<Vc<OptionStringifiedSourceMap>> {
        let source_map = maybe_decode_data_url(&self.source_map);
        let source_map = resolve_source_map_sources(source_map.as_ref(), *self.origin_path).await?;
        Ok(Vc::cell(source_map))
    }
}

fn maybe_decode_data_url(url: &str) -> Option<Rope> {
    const DATA_PREAMBLE: &str = "data:application/json;base64,";

    if !url.starts_with(DATA_PREAMBLE) {
        return None;
    }
    let data_b64 = &url[DATA_PREAMBLE.len()..];
    data_encoding::BASE64
        .decode(data_b64.as_bytes())
        .ok()
        .map(Rope::from)
}
