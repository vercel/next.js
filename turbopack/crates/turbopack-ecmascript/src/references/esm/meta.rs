use std::borrow::Cow;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Ident},
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor, magic_identifier,
    references::AstPath,
    runtime_functions::{TURBOPACK_MODULE, TURBOPACK_RESOLVE_FILE_URL},
};

/// Responsible for initializing the `import.meta` object binding, so that it
/// may be referenced in th the file.
///
/// There can be many references to import.meta, and they appear at any nesting
/// in the file. But we must only initialize the binding a single time.
///
/// This singleton behavior must be enforced by the caller!
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode,
)]
pub struct ImportMetaBinding {
    path: FileSystemPath,
    hmr_enabled: bool,
    mode: RcStr,
    base_url: RcStr,
    is_ssr: bool,
}

impl ImportMetaBinding {
    pub fn new(
        path: FileSystemPath,
        hmr_enabled: bool,
        mode: RcStr,
        base_url: RcStr,
        is_ssr: bool,
    ) -> Self {
        ImportMetaBinding {
            path,
            hmr_enabled,
            mode,
            base_url,
            is_ssr,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let rel_path = chunking_context
            .root_path()
            .await?
            .get_relative_path_to(&self.path);
        let path = rel_path.map_or_else(
            || {
                quote!(
                    "(() => { throw new Error('could not convert import.meta.url to filepath') })()"
                        as Expr
                )
            },
            |path| {
                // `encode_path` only escapes characters that would break the JS string literal
                // we embed `formatted` into. The runtime helper (`TURBOPACK_RESOLVE_FILE_URL`)
                // is responsible for producing the final, properly URL-encoded `file://` URI.
                let formatted = encode_path(path.trim_start_matches("./")).to_string();
                quote!(
                    "$turbopack_resolve_file_url($formatted)" as Expr,
                    turbopack_resolve_file_url: Expr = TURBOPACK_RESOLVE_FILE_URL.into(),
                    formatted: Expr = formatted.into()
                )
            },
        );

        let hmr_enabled = self.hmr_enabled;
        let mode: Expr = self.mode.as_str().into();
        let is_prod: Expr = (self.mode == "production").into();
        let is_dev: Expr = (self.mode != "production").into();
        let is_ssr: Expr = self.is_ssr.into();
        let base_url: Expr = self.base_url.as_str().into();

        // [NOTE] url property is lazy-evaluated, as it should be computed once
        // turbopack_runtime injects a function to calculate an absolute path.
        let stmt = if hmr_enabled {
            // turbopackHot exposes the HMR API (equivalent to module.hot in CJS).
            let turbopack_module: Expr = TURBOPACK_MODULE.into();
            quote!(
                "var $name = { get url() { return $path }, env: { DEV: $is_dev, PROD: \
                 $is_prod, MODE: $mode, BASE_URL: $base_url, SSR: $is_ssr }, get turbopackHot() { \
                 return $m.hot } };" as Stmt,
                name = meta_ident(),
                path: Expr = path,
                is_dev: Expr = is_dev,
                is_prod: Expr = is_prod,
                mode: Expr = mode,
                base_url: Expr = base_url,
                is_ssr: Expr = is_ssr,
                m: Expr = turbopack_module,
            )
        } else {
            quote!(
                "var $name = { get url() { return $path }, env: { DEV: $is_dev, PROD: \
                 $is_prod, MODE: $mode, BASE_URL: $base_url, SSR: $is_ssr } };" as Stmt,
                name = meta_ident(),
                path: Expr = path,
                is_dev: Expr = is_dev,
                is_prod: Expr = is_prod,
                mode: Expr = mode,
                base_url: Expr = base_url,
                is_ssr: Expr = is_ssr,
            )
        };

        Ok(CodeGeneration::hoisted_stmt(rcstr!("import.meta"), stmt))
    }
}

impl From<ImportMetaBinding> for CodeGen {
    fn from(val: ImportMetaBinding) -> Self {
        CodeGen::ImportMetaBinding(val)
    }
}

/// Handles rewriting `import.meta` references into the injected binding created
/// by ImportMetaBinding.
///
/// There can be many references to import.meta, and they appear at any nesting
/// in the file. But all references refer to the same mutable object.
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ImportMetaRef {
    ast_path: AstPath,
}

impl ImportMetaRef {
    pub fn new(ast_path: AstPath) -> Self {
        ImportMetaRef { ast_path }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let visitor = create_visitor!(self.ast_path, visit_mut_expr, |expr: &mut Expr| {
            *expr = Expr::Ident(meta_ident());
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ImportMetaRef> for CodeGen {
    fn from(val: ImportMetaRef) -> Self {
        CodeGen::ImportMetaRef(val)
    }
}

/// URL encodes special chars that would appear in the "pathname" portion.
/// https://github.com/nodejs/node/blob/3bed5f11e039153eff5cbfd9513b8f55fd53fc43/lib/internal/url.js#L1513-L1526
fn encode_path(path: &'_ str) -> Cow<'_, str> {
    let mut encoded = String::new();
    let mut start = 0;
    for (i, c) in path.char_indices() {
        let mapping = match c {
            '%' => "%25",
            '\\' => "%5C",
            '\n' => "%0A",
            '\r' => "%0D",
            '\t' => "%09",
            _ => continue,
        };

        if encoded.is_empty() {
            encoded.reserve(path.len());
        }

        encoded += &path[start..i];
        encoded += mapping;
        start = i + 1;
    }

    if encoded.is_empty() {
        return Cow::Borrowed(path);
    }
    encoded += &path[start..];
    Cow::Owned(encoded)
}

fn meta_ident() -> Ident {
    Ident::new(
        magic_identifier::mangle("import.meta").into(),
        DUMMY_SP,
        Default::default(),
    )
}

#[cfg(test)]
mod test {
    use super::encode_path;

    #[test]
    fn test_encode_path_regular() {
        let input = "abc";
        assert_eq!(encode_path(input), "abc");
    }

    #[test]
    fn test_encode_path_special_chars() {
        let input = "abc%def\\ghi\njkl\rmno\tpqr";
        assert_eq!(encode_path(input), "abc%25def%5Cghi%0Ajkl%0Dmno%09pqr");
    }

    #[test]
    fn test_encode_path_special_char_start() {
        let input = "%abc";
        assert_eq!(encode_path(input), "%25abc");
    }

    #[test]
    fn test_encode_path_special_char_end() {
        let input = "abc%";
        assert_eq!(encode_path(input), "abc%25");
    }

    #[test]
    fn test_encode_path_special_char_contiguous() {
        let input = "%%%";
        assert_eq!(encode_path(input), "%25%25%25");
    }
}
