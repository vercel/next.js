//! Cfg-duplicate `#[async_trait]` traits and trait impls for dual-mode (R5).
//!
//! Dual traits (Issue, ValueToString, SourceTransform, …) are declared with `async fn`
//! methods in the async build and plain `fn` in the sync build. An impl written with
//! `#[async_trait]` + `async fn` therefore only matches the async trait; the sync build
//! needs a plain-`fn` copy. Following the pattern the turbopack crates use, we emit both:
//!
//!   #[cfg(not(feature = "sync"))]
//!   #[async_trait]
//!   #[turbo_tasks::value_impl]
//!   impl Trait for Ty { async fn m(&self) -> ... { body } }
//!
//!   #[cfg(feature = "sync")]
//!   #[turbo_tasks::value_impl]
//!   impl Trait for Ty { fn m(&self) -> ... { body } }   // async + #[async_trait] dropped
//!
//! Targets every trait impl attributed with `#[async_trait]`. Bodies are identical (the
//! `.await`->read! codemod already ran), so the sync copy is the async copy minus the
//! `#[async_trait]` attr and the `async` keyword on methods.
//!
//! Idempotent: skips impls already preceded by a `#[cfg(...feature = "sync"...)]` attr.
//!
//! Usage: dualtrait <file.rs> ...

use proc_macro2::Span;
use syn::{ImplItem, Item, ItemImpl, ItemTrait, TraitItem, spanned::Spanned};

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

fn has_async_trait_attr(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|attr| {
        let p = attr.path();
        p.segments
            .last()
            .map(|s| s.ident == "async_trait")
            .unwrap_or(false)
    })
}

fn has_cfg_attr(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|attr| attr.path().is_ident("cfg"))
}

fn collect_items<'a>(
    items: &'a [Item],
    impls: &mut Vec<&'a ItemImpl>,
    traits: &mut Vec<&'a ItemTrait>,
) {
    for it in items {
        match it {
            Item::Impl(im) => impls.push(im),
            Item::Trait(tr) => traits.push(tr),
            Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_items(inner, impls, traits);
                }
            }
            _ => {}
        }
    }
}

fn async_trait_attr_spans(attrs: &[syn::Attribute]) -> impl Iterator<Item = Span> + '_ {
    attrs.iter().filter_map(|attr| {
        attr.path()
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "async_trait")
            .then(|| attr.span())
    })
}

fn apply_removals(text: &str, spans: impl Iterator<Item = Span>, item_start: usize) -> String {
    let mut removals = spans
        .map(|span| {
            let range = span.byte_range();
            Removal {
                start: range.start - item_start,
                end: range.end - item_start,
            }
        })
        .collect::<Vec<_>>();
    removals.sort_by_key(|removal| std::cmp::Reverse(removal.start));

    let mut sync = text.to_owned();
    for removal in removals {
        sync.replace_range(removal.start..removal.end, "");
    }
    sync
}

/// Build the sync copy using only spans of syntax nodes that differ between modes.
fn impl_to_sync_copy(text: &str, im: &ItemImpl, item_start: usize) -> String {
    let methods = im.items.iter().filter_map(|item| {
        let ImplItem::Fn(method) = item else {
            return None;
        };
        method.sig.asyncness.as_ref().map(|token| token.span())
    });
    apply_removals(
        text,
        async_trait_attr_spans(&im.attrs).chain(methods),
        item_start,
    )
}

fn trait_to_sync_copy(text: &str, tr: &ItemTrait, item_start: usize) -> String {
    let methods = tr.items.iter().filter_map(|item| {
        let TraitItem::Fn(method) = item else {
            return None;
        };
        method.sig.asyncness.as_ref().map(|token| token.span())
    });
    apply_removals(
        text,
        async_trait_attr_spans(&tr.attrs).chain(methods),
        item_start,
    )
}

fn process(path: &str) -> Result<usize, String> {
    let src = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file = syn::parse_file(&src).map_err(|e| format!("{path}: {e}"))?;
    let mut impls = Vec::new();
    let mut traits = Vec::new();
    collect_items(&file.items, &mut impls, &mut traits);

    let mut edits: Vec<Edit> = Vec::new();
    for im in impls {
        if im.trait_.is_none() || !has_async_trait_attr(&im.attrs) || has_cfg_attr(&im.attrs) {
            continue;
        }
        let start = im
            .attrs
            .first()
            .map(|a| a.span().byte_range().start)
            .unwrap_or_else(|| im.span().byte_range().start);
        let end = im.brace_token.span.close().byte_range().end;
        let orig = &src[start..end];
        let sync = impl_to_sync_copy(orig, im, start);
        let text = format!(
            "#[cfg(not(feature = \"sync\"))]\n{orig}\n\n#[cfg(feature = \"sync\")]\n{sync}"
        );
        edits.push(Edit { start, end, text });
    }
    for tr in traits {
        if !has_async_trait_attr(&tr.attrs) || has_cfg_attr(&tr.attrs) {
            continue;
        }
        let start = tr
            .attrs
            .first()
            .map(|attr| attr.span().byte_range().start)
            .unwrap_or_else(|| tr.span().byte_range().start);
        let end = tr.brace_token.span.close().byte_range().end;
        let orig = &src[start..end];
        let sync = trait_to_sync_copy(orig, tr, start);
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

    #[test]
    fn removes_only_async_trait_syntax_nodes() {
        let source = r#"#[async_trait::async_trait(?Send)]
#[other]
impl Trait for Example {
    async /* keep */ fn run(&self) {
        let text = "async fn in a string";
        // async fn in a comment
        async fn nested() {}
    }
}"#;
        let file = syn::parse_file(source).unwrap();
        let Item::Impl(im) = &file.items[0] else {
            panic!("expected impl");
        };
        let start = im.attrs[0].span().byte_range().start;
        let output = impl_to_sync_copy(source, im, start);

        assert!(!output.contains("#[async_trait::async_trait(?Send)]"));
        assert!(output.contains("#[other]"));
        assert!(output.contains(" /* keep */ fn run"));
        assert!(output.contains("\"async fn in a string\""));
        assert!(output.contains("// async fn in a comment"));
        assert!(output.contains("async fn nested()"));
        syn::parse_file(&output).unwrap();
    }

    #[test]
    fn converts_async_trait_definitions() {
        let source = r#"#[async_trait]
pub trait Example<T>
where
    T: Send,
{
    async /* keep */ fn run(&self, value: T);
    fn sync_method(&self);
}"#;
        let file = syn::parse_file(source).unwrap();
        let Item::Trait(tr) = &file.items[0] else {
            panic!("expected trait");
        };
        let start = tr.attrs[0].span().byte_range().start;
        let output = trait_to_sync_copy(source, tr, start);

        assert!(!output.contains("#[async_trait]"));
        assert!(output.contains(" /* keep */ fn run"));
        assert!(output.contains("fn sync_method"));
        syn::parse_file(&output).unwrap();
    }
}

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    if files.is_empty() {
        eprintln!("usage: dualtrait <file.rs> ...");
        std::process::exit(2);
    }
    let mut total = 0;
    for f in &files {
        match process(f) {
            Ok(n) => total += n,
            Err(e) => eprintln!("ERROR {e}"),
        }
    }
    println!("cfg-duplicated {total} #[async_trait] traits and impls");
}
