//! Wrap free-standing plain `async fn`s in `turbo_tasks::dual_fn! { ... }`.
//!
//! The bulk `.await`->`read!` codemod turns `helper(x).await` into `read!(helper(x))`.
//! That's correct when `helper` returns a `Vc` (a `#[turbo_tasks::function]`), but a
//! plain `async fn helper() -> Result<T>` is still a Future in the sync build, and
//! `read!` on a Future doesn't implement `SyncRead`. The fix is to make such helpers
//! dual-mode: `dual_fn!` emits `async fn` in the async build and a plain `fn` in the
//! sync build (so `read!(helper(x))` is identity on the returned value in sync).
//!
//! This tool converts FREE functions only. It skips:
//!   * `#[turbo_tasks::function]` fns (the function macro already strips `async`)
//!   * methods (inside `impl`/`trait`) — those need cfg-duplication, handled elsewhere
//!   * fns already inside a `dual_fn!` invocation
//!
//! Signatures accepted by `dual_fn!` are wrapped in that macro. All other signatures
//! (bounds, where clauses, const generics, implicit return types, qualifiers) become a
//! cfg-gated async/sync pair, with the `async` keyword removed by its AST span.
//!
//! Usage: dualfn <file.rs> [<file.rs> ...]

use syn::{Item, ItemFn, spanned::Spanned};

struct Edit {
    start: usize,
    end: usize,
    text: String,
}

fn has_tt_function_attr(f: &ItemFn) -> bool {
    f.attrs.iter().any(|a| {
        let p = a.path();
        p.segments.len() == 2
            && p.segments[0].ident == "turbo_tasks"
            && p.segments[1].ident == "function"
    })
}

fn has_cfg_attr(f: &ItemFn) -> bool {
    f.attrs.iter().any(|attr| attr.path().is_ident("cfg"))
}

/// Eligible = plain async, explicit return type, no where-clause, no generic bounds.
fn eligible(f: &ItemFn) -> Result<(), &'static str> {
    if f.sig.asyncness.is_none() {
        return Err("not async");
    }
    if has_tt_function_attr(f) {
        return Err("#[turbo_tasks::function]");
    }
    if has_cfg_attr(f) {
        return Err("already cfg-gated");
    }
    if f.sig.constness.is_some()
        || f.sig.unsafety.is_some()
        || f.sig.abi.is_some()
        || f.sig.variadic.is_some()
    {
        return Err("unsupported function qualifier");
    }
    if !matches!(f.sig.output, syn::ReturnType::Type(..)) {
        return Err("no explicit return type");
    }
    if f.sig.generics.where_clause.is_some() {
        return Err("has where-clause");
    }
    // dual_fn! accepts <lifetimes> and <type idents> but NOT bounds (T: Foo).
    for p in &f.sig.generics.params {
        match p {
            syn::GenericParam::Type(t) if !t.bounds.is_empty() || t.default.is_some() => {
                return Err("generic bound or default");
            }
            syn::GenericParam::Lifetime(l) if !l.bounds.is_empty() => return Err("lifetime bound"),
            syn::GenericParam::Const(_) => return Err("const generic"),
            _ => {}
        }
    }
    Ok(())
}

fn item_start(f: &ItemFn) -> usize {
    if let Some(attr) = f.attrs.first() {
        attr.span().byte_range().start
    } else {
        match &f.vis {
            syn::Visibility::Public(_) | syn::Visibility::Restricted(_) => {
                f.vis.span().byte_range().start
            }
            syn::Visibility::Inherited => f.sig.span().byte_range().start,
        }
    }
}

fn remove_async_keyword(item: &str, f: &ItemFn, start: usize) -> String {
    let asyncness = f.sig.asyncness.expect("caller checked asyncness");
    let range = asyncness.span().byte_range();
    let mut output = item.to_owned();
    output.replace_range(range.start - start..range.end - start, "");
    output
}

fn collect_fns<'a>(items: &'a [Item], out: &mut Vec<&'a ItemFn>) {
    for it in items {
        match it {
            Item::Fn(f) => out.push(f),
            Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_fns(inner, out);
                }
            }
            _ => {}
        }
    }
}

fn process(path: &str) -> Result<(usize, Vec<String>), String> {
    let src = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file = syn::parse_file(&src).map_err(|e| format!("{path}: {e}"))?;
    let mut fns = Vec::new();
    collect_fns(&file.items, &mut fns);

    let mut edits: Vec<Edit> = Vec::new();
    let skips: Vec<String> = Vec::new();
    for f in fns {
        if f.sig.asyncness.is_none() || has_tt_function_attr(f) || has_cfg_attr(f) {
            continue;
        }
        // Span from first attr, else the `pub`/`pub(..)` visibility, else the
        // signature (`async`/`fn`) — so the wrapped item keeps its visibility INSIDE
        // dual_fn! (which handles `$vis`).
        let start = item_start(f);
        let end = f.block.span().byte_range().end;
        let block_text = &src[start..end];
        let sync = remove_async_keyword(block_text, f, start);
        let text = if eligible(f).is_ok() {
            // Indent the wrapped fn? Keep as-is; dual_fn! body isn't indentation-sensitive.
            format!("turbo_tasks::dual_fn! {{\n{sync}\n}}")
        } else {
            format!(
                "#[cfg(not(feature = \"sync\"))]\n{block_text}\n\n#[cfg(feature = \
                 \"sync\")]\n{sync}"
            )
        };
        edits.push(Edit { start, end, text });
    }

    if edits.is_empty() {
        return Ok((0, skips));
    }
    // Apply back-to-front so byte offsets stay valid.
    edits.sort_by(|a, b| b.start.cmp(&a.start));
    let mut out = src;
    let n = edits.len();
    for e in edits {
        out.replace_range(e.start..e.end, &e.text);
    }
    std::fs::write(path, out).map_err(|e| e.to_string())?;
    Ok((n, skips))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform(source: &str) -> String {
        let file = syn::parse_file(source).unwrap();
        let Item::Fn(function) = &file.items[0] else {
            panic!("expected function");
        };
        let start = item_start(function);
        let end = function.block.span().byte_range().end;
        let item = &source[start..end];
        let sync = remove_async_keyword(item, function, start);
        if eligible(function).is_ok() {
            format!("turbo_tasks::dual_fn! {{\n{sync}\n}}")
        } else {
            format!("#[cfg(not(feature = \"sync\"))]\n{item}\n\n#[cfg(feature = \"sync\")]\n{sync}")
        }
    }

    #[test]
    fn wraps_macro_compatible_signatures() {
        let output = transform("pub async fn helper<T>(value: T) -> Result<T> { Ok(value) }");
        assert!(output.starts_with("turbo_tasks::dual_fn!"));
        assert!(output.contains("pub  fn helper<T>"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn cfg_duplicates_every_other_valid_signature() {
        let source = r#"pub async /* keep */ fn helper<const N: usize, T>(value: T)
where
    T: Clone,
{
    let text = "async fn stays";
    async fn nested() {}
}"#;
        let output = transform(source);

        assert!(output.contains("#[cfg(not(feature = \"sync\"))]"));
        assert!(output.contains("#[cfg(feature = \"sync\")]"));
        assert_eq!(output.matches("async /* keep */ fn helper").count(), 1);
        assert!(output.contains(" /* keep */ fn helper"));
        assert_eq!(output.matches("async fn nested()").count(), 2);
        assert_eq!(output.matches("\"async fn stays\"").count(), 2);
        syn::parse_file(&output).unwrap();
    }
}

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    if files.is_empty() {
        eprintln!("usage: dualfn <file.rs> ...");
        std::process::exit(2);
    }
    let mut total = 0;
    let mut all_skips = Vec::new();
    for f in &files {
        match process(f) {
            Ok((n, skips)) => {
                total += n;
                for s in skips {
                    all_skips.push(format!("{f}: {s}"));
                }
            }
            Err(e) => eprintln!("ERROR {e}"),
        }
    }
    println!("wrapped {total} free async fns in dual_fn!");
    if !all_skips.is_empty() {
        println!("skipped {} (need manual handling):", all_skips.len());
        for s in &all_skips {
            println!("  - {s}");
        }
    }
}
