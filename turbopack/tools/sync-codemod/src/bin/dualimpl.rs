//! Cfg-duplicate PLAIN inherent impls that contain plain `async fn` methods.
//!
//! Free helper fns are handled by `dualfn` and #[async_trait] trait impls by
//! `dualtrait`. This handles the third case: an inherent `impl Type { async fn m() ... }`
//! of a plain (non-turbo-tasks) helper/builder type, whose async methods are called as
//! `read!(x.m(..))` after the bulk codemod. In the sync build those methods must be plain
//! `fn`, so we emit a cfg-gated pair (async copy + async-stripped sync copy), matching the
//! dual_fn!/dualtrait pattern.
//!
//! Strict guards — only touches impls that are unambiguously plain:
//!   * inherent impls only (no trait impl)
//!   * NO turbo_tasks attribute on the impl (skip #[turbo_tasks::value_impl])
//!   * NO method carrying #[turbo_tasks::function] (the fn macro handles those itself)
//!   * at least one plain `async fn` method
//!   * not already cfg-gated
//!
//! Usage: dualimpl <file.rs> ...

use syn::{ImplItem, Item, ItemImpl, spanned::Spanned};

struct Edit {
    start: usize,
    end: usize,
    text: String,
}

#[derive(Clone, Copy)]
struct Removal {
    start: usize,
    end: usize,
}

fn impl_has_tt_attr(im: &ItemImpl) -> bool {
    im.attrs.iter().any(|a| {
        a.path()
            .segments
            .first()
            .map(|s| s.ident == "turbo_tasks")
            .unwrap_or(false)
    })
}

fn has_cfg_attr(im: &ItemImpl) -> bool {
    im.attrs.iter().any(|a| a.path().is_ident("cfg"))
}

/// (has >=1 plain async method, has any #[turbo_tasks::function] method)
fn scan_methods(im: &ItemImpl) -> (bool, bool) {
    let mut plain_async = false;
    let mut tt_fn = false;
    for it in &im.items {
        if let ImplItem::Fn(m) = it {
            let is_tt = m.attrs.iter().any(|a| {
                let p = a.path();
                p.segments.len() == 2
                    && p.segments[0].ident == "turbo_tasks"
                    && p.segments[1].ident == "function"
            });
            if is_tt {
                tt_fn = true;
            } else if m.sig.asyncness.is_some() {
                plain_async = true;
            }
        }
    }
    (plain_async, tt_fn)
}

fn remove_asyncness(src: &str, im: &ItemImpl, item_start: usize) -> String {
    let mut removals = im
        .items
        .iter()
        .filter_map(|item| {
            let ImplItem::Fn(method) = item else {
                return None;
            };
            let span = method.sig.asyncness?.span().byte_range();
            Some(Removal {
                start: span.start - item_start,
                end: span.end - item_start,
            })
        })
        .collect::<Vec<_>>();
    removals.sort_by_key(|removal| std::cmp::Reverse(removal.start));

    let mut sync = src.to_owned();
    for removal in removals {
        sync.replace_range(removal.start..removal.end, "");
    }
    sync
}

fn collect_impls<'a>(items: &'a [Item], out: &mut Vec<&'a ItemImpl>) {
    for it in items {
        match it {
            Item::Impl(im) => out.push(im),
            Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_impls(inner, out);
                }
            }
            _ => {}
        }
    }
}

fn process(path: &str) -> Result<usize, String> {
    let src = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file = syn::parse_file(&src).map_err(|e| format!("{path}: {e}"))?;
    let mut impls = Vec::new();
    collect_impls(&file.items, &mut impls);

    let mut edits: Vec<Edit> = Vec::new();
    for im in impls {
        if im.trait_.is_some() || impl_has_tt_attr(im) || has_cfg_attr(im) {
            continue;
        }
        let (plain_async, tt_fn) = scan_methods(im);
        if !plain_async || tt_fn {
            continue;
        }
        let start = im
            .attrs
            .first()
            .map(|a| a.span().byte_range().start)
            .unwrap_or_else(|| im.span().byte_range().start);
        let end = im.brace_token.span.close().byte_range().end;
        let orig = &src[start..end];
        let sync = remove_asyncness(orig, im, start);
        let text = format!(
            "#[cfg(not(feature = \"sync\"))]\n{orig}\n\n#[cfg(feature = \"sync\")]\n{sync}"
        );
        edits.push(Edit { start, end, text });
    }

    if edits.is_empty() {
        return Ok(0);
    }
    edits.sort_by(|a, b| b.start.cmp(&a.start));
    let mut out = src;
    let n = edits.len();
    for e in edits {
        out.replace_range(e.start..e.end, &e.text);
    }
    std::fs::write(path, out).map_err(|e| e.to_string())?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform(src: &str) -> String {
        let file = syn::parse_file(src).unwrap();
        let Item::Impl(im) = &file.items[0] else {
            panic!("expected impl");
        };
        let start = im.span().byte_range().start;
        remove_asyncness(src, im, start)
    }

    #[test]
    fn only_removes_asyncness_from_direct_methods() {
        let source = r#"impl Example {
    async /* keep */ fn spaced(&self) {
        let text = "async fn in a string";
        // async fn in a comment
        async fn nested() {}
    }

    pub async
    fn multiline() {}
}"#;

        let output = transform(source);
        assert!(output.contains(" /* keep */ fn spaced"));
        assert!(output.contains("\"async fn in a string\""));
        assert!(output.contains("// async fn in a comment"));
        assert!(output.contains("async fn nested()"));
        assert!(output.contains("pub \n    fn multiline"));
        syn::parse_file(&output).unwrap();
    }
}

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    if files.is_empty() {
        eprintln!("usage: dualimpl <file.rs> ...");
        std::process::exit(2);
    }
    let mut total = 0;
    for f in &files {
        match process(f) {
            Ok(n) => total += n,
            Err(e) => eprintln!("ERROR {e}"),
        }
    }
    println!("cfg-duplicated {total} plain inherent impls with async methods");
}
