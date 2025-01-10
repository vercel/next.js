use std::borrow::Cow;

use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Ident},
    quote,
};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor, magic_identifier,
    references::AstPath,
};

/// Responsible for initializing the `import.meta` object binding, so that it
/// may be referenced in th the file.
///
/// There can be many references to import.meta, and they appear at any nesting
/// in the file. But we must only initialize the binding a single time.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct ImportMetaBinding {
    path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ImportMetaBinding {
    #[turbo_tasks::function]
    pub fn new(path: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        ImportMetaBinding { path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ImportMetaBinding {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let rel_path = chunking_context
            .root_path()
            .await?
            .get_relative_path_to(&*self.path.await?);
        let path = rel_path.map_or_else(
            || {
                quote!(
                    "(() => { throw new Error('could not convert import.meta.url to filepath') })()"
                        as Expr
                )
            },
            |path| {
                let formatted = encode_path(path.trim_start_matches("./")).to_string();
                quote!(
                    "`file://${__turbopack_resolve_absolute_path__($formatted)}`" as Expr,
                    formatted: Expr = formatted.into()
                )
            },
        );

        Ok(CodeGeneration::hoisted_stmt(
            "import.meta".into(),
            // [NOTE] url property is lazy-evaluated, as it should be computed once
            // turbopack_runtime injects a function to calculate an absolute path.
            quote!(
                "const $name = { get url() { return $path } };" as Stmt,
                name = meta_ident(),
                path: Expr = path.clone(),
            ),
        ))
    }
}

/// Handles rewriting `import.meta` references into the injected binding created
/// by ImportMetaBindi ImportMetaBinding.
///
/// There can be many references to import.meta, and they appear at any nesting
/// in the file. But all references refer to the same mutable object.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct ImportMetaRef {
    ast_path: ResolvedVc<AstPath>,
}

#[turbo_tasks::value_impl]
impl ImportMetaRef {
    #[turbo_tasks::function]
    pub fn new(ast_path: ResolvedVc<AstPath>) -> Vc<Self> {
        ImportMetaRef { ast_path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ImportMetaRef {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let ast_path = &self.ast_path.await?;
        let visitor = create_visitor!(ast_path, visit_mut_expr(expr: &mut Expr) {
            *expr = Expr::Ident(meta_ident());
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

/// URL encodes special chars that would appear in the "pathname" portion.
/// https://github.com/nodejs/node/blob/3bed5f11e039153eff5cbfd9513b8f55fd53fc43/lib/internal/url.js#L1513-L1526
fn encode_path(path: &'_ str) -> Cow<'_, str> {
    let mut encoded = String::new();
    let mut start = 0;
    for (i, c) in path.chars().enumerate() {
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
