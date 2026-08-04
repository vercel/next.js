//! Dual-mode codemod: rewrite every `EXPR.await` -> `turbo_tasks::read!(EXPR)`,
//! including awaits nested inside macro invocations (read!/bail!/vec!/assert_eq!/
//! matches!/format!/try_join!/…) that ast-grep (tree-sitter) cannot reach.
//!
//! How it works — the pieces that make it correct where regex/ast-grep fail:
//!   * `syn` parses the real AST, so expression boundaries (chain heads), multiline chains,
//!     comments, match-arms and if/else are exact.
//!   * Edits are SURGICAL byte-range splices into the original source, so formatting/trivia is
//!     preserved (unlike regenerating from the AST).
//!   * `visit_macro` RE-PARSES a macro's token stream as expressions and recurses, so awaits inside
//!     macro args are found.
//!   * INNERMOST-FIRST multi-pass: each pass rewrites only awaits whose receiver contains no other
//!     await (so edits never nest/overlap), then re-parses. Nested awaits resolve over successive
//!     passes. This sidesteps all the edit-ordering hazards that corrupted the hand-rolled
//!     attempts.
//!
//! Usage: sync-codemod <file.rs> [<file.rs> ...]

use proc_macro2::{Spacing, TokenStream, TokenTree};
use syn::{
    Attribute, Block, Expr, Macro, Meta, Pat, Token,
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    spanned::Spanned,
    token::Comma,
    visit::Visit,
};

#[derive(Clone, Copy, Debug)]
struct AwaitSite {
    base_start: usize,
    base_end: usize,
    dot_start: usize,
    await_end: usize,
}

#[derive(Default)]
struct Finder {
    sites: Vec<AwaitSite>,
}

struct SelectBody(Vec<Expr>);

impl Parse for SelectBody {
    fn parse(input: ParseStream<'_>) -> syn::Result<Self> {
        let mut expressions = Vec::new();
        if input.peek(syn::Ident) && input.fork().parse::<syn::Ident>()? == "biased" {
            input.parse::<syn::Ident>()?;
            input.parse::<Token![;]>()?;
        }
        while !input.is_empty() {
            if input.peek(Token![else]) {
                input.parse::<Token![else]>()?;
            } else {
                Pat::parse_multi_with_leading_vert(input)?;
                input.parse::<Token![=]>()?;
                expressions.push(input.parse()?);
                if input.peek(Token![,]) && input.peek2(Token![if]) {
                    input.parse::<Token![,]>()?;
                    input.parse::<Token![if]>()?;
                    expressions.push(input.parse()?);
                }
            }
            input.parse::<Token![=>]>()?;
            expressions.push(input.parse()?);
            if input.peek(Token![,]) {
                input.parse::<Token![,]>()?;
            } else if !input.is_empty() {
                return Err(input.error("expected `,` between select branches"));
            }
        }
        Ok(Self(expressions))
    }
}

impl<'ast> Visit<'ast> for Finder {
    fn visit_expr_await(&mut self, node: &'ast syn::ExprAwait) {
        let base = node.base.span().byte_range();
        // Use the `.` and `await` token spans so we remove ONLY `.await`,
        // preserving any trivia (e.g. a comment) between the receiver and it.
        let dot = node.dot_token.span().byte_range();
        let awaited = node.await_token.span().byte_range();
        if base.end > base.start && dot.start >= base.end && awaited.end >= dot.start {
            self.sites.push(AwaitSite {
                base_start: base.start,
                base_end: base.end,
                dot_start: dot.start,
                await_end: awaited.end,
            });
        }
        // Recurse into the receiver to find nested awaits.
        self.visit_expr(&node.base);
    }

    fn visit_macro(&mut self, node: &'ast Macro) {
        // Re-parse the macro's tokens as expressions and recurse. Finder is
        // 'static, so visiting locally-owned exprs (shorter lifetime) is fine.
        for e in parse_macro_exprs(node.tokens.clone()) {
            self.visit_expr(&e);
        }
    }

    fn visit_attribute(&mut self, node: &'ast Attribute) {
        if let Meta::List(list) = &node.meta {
            for expression in parse_macro_exprs(list.tokens.clone()) {
                self.visit_expr(&expression);
            }
        }
    }
}

/// Best-effort extraction of expression arguments from a macro token stream.
/// Handles single expr (`read!(x)`), comma-separated exprs (`vec![a, b]`,
/// `assert_eq!(a, b)`, `format!("..", x)`), and mixed (`matches!(x, Pat)` — the
/// expr arg parses, the pattern arg is skipped). Falls back to recursing into
/// nested delimiter groups so awaits buried in unusual macros are still found.
fn parse_macro_exprs(ts: TokenStream) -> Vec<Expr> {
    if ts.is_empty() {
        return vec![];
    }
    if let Ok(e) = syn::parse2::<Expr>(ts.clone()) {
        return vec![e];
    }
    let parser = Punctuated::<Expr, Comma>::parse_terminated;
    if let Ok(p) = syn::parse::Parser::parse2(parser, ts.clone()) {
        return p.into_iter().collect();
    }
    // Statement-oriented macros commonly accept the contents of a Rust block
    // without the surrounding braces. Reintroducing those braces lets syn parse
    // every expression in the statement list rather than inspecting raw tokens.
    if let Ok(block) = syn::parse2::<Block>(quote::quote!({ #ts })) {
        return vec![Expr::Block(syn::ExprBlock {
            attrs: Vec::new(),
            label: None,
            block,
        })];
    }
    // `tokio::select!` and compatible macros use `pattern = future => handler`
    // branches. Parse each expression position while deliberately ignoring patterns.
    if let Ok(select) = syn::parse2::<SelectBody>(ts.clone()) {
        return select.0;
    }
    let sanitized = sanitize_interpolations(ts.clone());
    if sanitized.to_string() != ts.to_string() {
        let parsed = parse_macro_exprs(sanitized);
        if !parsed.is_empty() {
            return parsed;
        }
    }
    let mut out = Vec::new();
    for seg in split_top_level_commas(ts) {
        if let Ok(e) = syn::parse2::<Expr>(seg.clone()) {
            out.push(e);
        } else if let Some(e) = parse_named_value(seg.clone()) {
            out.push(e);
        } else {
            for tt in seg {
                if let TokenTree::Group(g) = tt {
                    out.extend(parse_macro_exprs(g.stream()));
                }
            }
        }
    }
    out
}

fn sanitize_interpolations(ts: TokenStream) -> TokenStream {
    let mut output = TokenStream::new();
    let mut tokens = ts.into_iter().peekable();
    while let Some(token) = tokens.next() {
        match token {
            TokenTree::Punct(ref punct)
                if matches!(punct.as_char(), '$' | '#')
                    && matches!(tokens.peek(), Some(TokenTree::Ident(_))) =>
            {
                // `$name` in macro_rules and `#name` in quote are expression
                // interpolation markers, not part of the generated Rust syntax.
            }
            TokenTree::Punct(ref punct)
                if matches!(punct.as_char(), '$' | '#')
                    && matches!(tokens.peek(), Some(TokenTree::Group(_))) =>
            {
                let Some(TokenTree::Group(group)) = tokens.next() else {
                    unreachable!();
                };
                // Parse one representative expansion of `$($args),*` / `#(#args),*`.
                // The enclosing delimiter keeps its original source span.
                output.extend(sanitize_interpolations(group.stream()));
                if matches!(tokens.peek(), Some(TokenTree::Punct(next)) if matches!(next.as_char(), '*' | '+' | '?'))
                {
                    tokens.next();
                } else {
                    let mut lookahead = tokens.clone();
                    lookahead.next();
                    if matches!(lookahead.next(), Some(TokenTree::Punct(next)) if matches!(next.as_char(), '*' | '+' | '?'))
                    {
                        // Discard the repetition separator and operator. One
                        // representative argument is enough to recover the AST.
                        tokens.next();
                        tokens.next();
                    }
                }
            }
            TokenTree::Group(group) => {
                let mut sanitized = proc_macro2::Group::new(
                    group.delimiter(),
                    sanitize_interpolations(group.stream()),
                );
                sanitized.set_span(group.span());
                output.extend([TokenTree::Group(sanitized)]);
            }
            token => output.extend([token]),
        }
    }
    output
}

fn parse_named_value(ts: TokenStream) -> Option<Expr> {
    let mut value = TokenStream::new();
    let mut found_assignment = false;
    for token in ts {
        if !found_assignment {
            if matches!(&token, TokenTree::Punct(punct) if punct.as_char() == '=' && punct.spacing() == Spacing::Alone)
            {
                found_assignment = true;
            }
            continue;
        }
        if value.is_empty()
            && matches!(&token, TokenTree::Punct(punct) if matches!(punct.as_char(), '%' | '?'))
        {
            continue;
        }
        value.extend([token]);
    }
    found_assignment
        .then(|| syn::parse2::<Expr>(value).ok())
        .flatten()
}

fn split_top_level_commas(ts: TokenStream) -> Vec<TokenStream> {
    let mut segs = Vec::new();
    let mut cur = TokenStream::new();
    for tt in ts {
        match &tt {
            TokenTree::Punct(p) if p.as_char() == ',' => {
                segs.push(std::mem::take(&mut cur));
            }
            _ => cur.extend(std::iter::once(tt)),
        }
    }
    if !cur.is_empty() {
        segs.push(cur);
    }
    segs
}

/// Rewrite one file to fixpoint. Returns number of awaits converted.
fn convert_source(mut src: String, path: &str) -> Result<(String, usize), String> {
    let mut total = 0usize;
    loop {
        let file = syn::parse_file(&src).map_err(|e| format!("{path}: parse: {e}"))?;
        let mut f = Finder::default();
        f.visit_file(&file);
        if f.sites.is_empty() {
            break;
        }
        let sites = &f.sites;
        // Innermost = no other site lies within this site's receiver range.
        let innermost: Vec<AwaitSite> = sites
            .iter()
            .enumerate()
            .filter(|(i, s)| {
                !sites.iter().enumerate().any(|(j, t)| {
                    *i != j && t.base_start >= s.base_start && t.await_end <= s.base_end
                })
            })
            .map(|(_, s)| *s)
            .collect();
        if innermost.is_empty() {
            return Err(format!("{path}: no innermost await (cycle?)"));
        }
        // Three point-edits per site (apply all right-to-left so offsets stay valid):
        //   * open  `turbo_tasks::read!(` at the receiver start
        //   * close `)` right after the receiver (before any trivia)
        //   * delete just the `.await` token (keeps trivia between receiver and it)
        let mut edits: Vec<(usize, usize, String)> = Vec::new();
        for s in &innermost {
            let mut base_start = s.base_start;
            if base_start > 0 && matches!(src.as_bytes()[base_start - 1], b'$' | b'#') {
                base_start -= 1;
            }
            edits.push((base_start, base_start, "turbo_tasks::read!(".to_string()));
            edits.push((s.base_end, s.base_end, ")".to_string()));
            let line_start = src[..s.dot_start].rfind('\n').map_or(0, |index| index + 1);
            let line_end = src[s.await_end..]
                .find('\n')
                .map_or(src.len(), |index| s.await_end + index + 1);
            let remove_start = if src[line_start..s.dot_start].trim().is_empty()
                && src[s.await_end..line_end].trim().is_empty()
            {
                line_start
            } else {
                s.dot_start
            };
            let remove_end = if remove_start == line_start {
                line_end
            } else {
                s.await_end
            };
            edits.push((remove_start, remove_end, String::new()));
        }
        edits.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
        for (start, end, rep) in edits {
            src.replace_range(start..end, &rep);
        }
        total += innermost.len();
    }
    Ok((src, total))
}

fn convert_file(path: &str) -> Result<usize, String> {
    let src = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
    let (output, total) = convert_source(src, path)?;
    if total > 0 {
        std::fs::write(path, output).map_err(|e| format!("{path}: write: {e}"))?;
    }
    Ok(total)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("usage: sync-codemod <file.rs> [file.rs ...]");
        std::process::exit(2);
    }
    let mut grand = 0usize;
    let mut failed = false;
    for path in &args {
        match convert_file(path) {
            Ok(n) => grand += n,
            Err(e) => {
                eprintln!("ERROR {e}");
                failed = true;
            }
        }
    }
    println!("converted {grand} awaits across {} files", args.len());
    if failed {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn convert(source: &str) -> (String, usize) {
        convert_source(source.to_owned(), "test.rs").unwrap()
    }

    #[test]
    fn converts_nested_and_chained_await_expressions() {
        let source = r#"async fn example() -> Result<()> {
    let value = make().await?.next().await?;
    let selected = (if condition() { left() } else { right() }).await;
    Ok(())
}"#;
        let (output, count) = convert(source);

        assert_eq!(count, 3);
        assert!(output.contains("turbo_tasks::read!(turbo_tasks::read!(make())?.next())?"));
        assert!(
            output.contains("turbo_tasks::read!((if condition() { left() } else { right() }))")
        );
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn converts_awaits_in_expression_and_statement_macros() {
        let source = r#"async fn example() {
    assert_eq!(left().await, right().await);
    matches!(value().await?, Some(Value { field, .. }));
    statement_macro! {
        let first = one().await;
        consume(two().await)
    }
}"#;
        let (output, count) = convert(source);

        assert_eq!(count, 5);
        assert!(
            output.contains("assert_eq!(turbo_tasks::read!(left()), turbo_tasks::read!(right()))")
        );
        assert!(
            output.contains("matches!(turbo_tasks::read!(value())?, Some(Value { field, .. }))")
        );
        assert!(output.contains("let first = turbo_tasks::read!(one());"));
        assert!(output.contains("consume(turbo_tasks::read!(two()))"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn preserves_comments_around_await() {
        let source = r#"async fn example() {
    value() /* receiver */ .await /* result */;
}"#;
        let (output, count) = convert(source);

        assert_eq!(count, 1);
        assert!(output.contains("turbo_tasks::read!(value()) /* receiver */  /* result */"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn converts_awaits_in_select_style_macro_grammar() {
        let source = r#"async fn example() {
    tokio::select! {
        biased;
        Some(value) = receive().await, if enabled().await => consume(value).await,
        else => fallback().await,
    }
}"#;
        let (output, count) = convert(source);

        assert_eq!(count, 4);
        assert!(output.contains("Some(value) = turbo_tasks::read!(receive())"));
        assert!(output.contains("if turbo_tasks::read!(enabled())"));
        assert!(output.contains("turbo_tasks::read!(consume(value))"));
        assert!(output.contains("else => turbo_tasks::read!(fallback())"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn converts_awaits_in_attributes_and_generated_macro_code() {
        let source = r#"#[tracing::instrument(fields(name = %source.ident().await?))]
async fn traced() {}

macro_rules! generated {
    ($value:expr) => {{ $value.resolve().await? }};
    ($($arg:expr),*) => {{ (call)($($arg,)*).await? }};
}

fn quote_generated() {
    quote::quote! { #value.resolve().await? };
    quote::quote! { reference.#method(#(#args),*).await? };
}"#;
        let (output, count) = convert(source);

        assert_eq!(count, 5, "{output}");
        assert!(output.contains("name = %turbo_tasks::read!(source.ident())?"));
        assert!(output.contains("turbo_tasks::read!($value.resolve())?"));
        assert!(output.contains("turbo_tasks::read!((call)($($arg,)*))?"));
        assert!(output.contains("turbo_tasks::read!(#value.resolve())?"));
        assert!(output.contains("turbo_tasks::read!(reference.#method(#(#args),*))?"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn removes_whitespace_only_await_lines() {
        let source = "async fn example() {\n    value()\n        .await\n        .consume();\n}\n";
        let (output, count) = convert(source);

        assert_eq!(count, 1);
        assert_eq!(
            output,
            "async fn example() {\n    turbo_tasks::read!(value())\n        .consume();\n}\n"
        );
    }
}
