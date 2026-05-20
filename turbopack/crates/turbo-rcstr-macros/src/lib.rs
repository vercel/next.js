//! Proc macro implementation of `rcstr!`.
//!
//! The implementation deliberately avoids `syn` and `quote`. The macro is
//! invoked thousands of times across the workspace, so per-invocation cost
//! matters: we pattern-match on `proc_macro::TokenTree` directly to
//! identify a single string-literal token, ask the compiler for its
//! unescaped value via [`Literal::str_value`] (gated by the unstable
//! `proc_macro_value` feature), and emit the chosen expansion by parsing
//! a string template via `TokenStream::from_str`.

#![feature(proc_macro_value)]

use std::str::FromStr;

use proc_macro::{Literal, TokenStream, TokenTree};

/// `MAX_INLINE_LEN` for the active `turbo-rcstr` configuration. Mirrors
/// [`turbo_rcstr::tagged_value::MAX_INLINE_LEN`]
const MAX_INLINE_LEN: usize = if cfg!(feature = "atom_size_128") {
    15
} else {
    7
};

#[proc_macro]
pub fn rcstr(input: TokenStream) -> TokenStream {
    // Fast path: input is a single string-literal token whose unescaped
    // length we can determine cheaply. Otherwise (multi-token expressions
    // like `concat!(...)`, identifiers, empty input, non-string literals,
    // escape-bearing literals) defer to the const-branch expansion so
    // const evaluation picks the arm at compile time.
    //
    // `input.clone()` is cheap — a `TokenStream` is an opaque handle into
    // the proc-macro server's storage rather than an owned tree of tokens
    // — so cloning here lets us consume one copy in `classify_literal`
    // while keeping the original around for the fallback path.
    {
        let source = if let Some((lit, len)) = classify_literal(input.clone()) {
            if len <= MAX_INLINE_LEN {
                format!("::turbo_rcstr::inline_atom({lit}).unwrap()")
            } else {
                format!(
                    "{{ static RCSTR_STORAGE: ::turbo_rcstr::StaticPrehashedString = \
                     ::turbo_rcstr::make_const_prehashed_string({lit}); const RCSTR: \
                     ::turbo_rcstr::RcStr = ::turbo_rcstr::from_static(&RCSTR_STORAGE); \
                     ::turbo_rcstr::__rcstr_inventory_submit!( \
                     ::turbo_rcstr::StaticRcStr(&RCSTR_STORAGE) ); RCSTR }}",
                )
            }
        } else {
            format!(
                "{{ const TEXT: &str = {input}; if ::turbo_rcstr::is_atom_inlineable(TEXT) {{ \
                 ::turbo_rcstr::inline_atom(TEXT).unwrap() }} else {{ static RCSTR_STORAGE: \
                 ::turbo_rcstr::StaticPrehashedString = \
                 ::turbo_rcstr::make_const_prehashed_string(TEXT); const RCSTR: \
                 ::turbo_rcstr::RcStr = ::turbo_rcstr::from_static(&RCSTR_STORAGE); \
                 ::turbo_rcstr::__rcstr_inventory_submit!( \
                 ::turbo_rcstr::StaticRcStr(&RCSTR_STORAGE) ); RCSTR }} }}",
            )
        };
        TokenStream::from_str(&source).expect("emitted source parses")
    }
}

/// If `input` is a single string-literal token, return the literal and
/// its unescaped length. Returns `None` for non-literal inputs, multi-
/// token inputs, or non-string literals (numeric, byte string, char,
/// etc.) so the caller falls back to the const-branch expansion.
///
/// [`Literal::str_value`] resolves all escape sequences (regular strings,
/// raw strings, unicode escapes) and reports an error for non-string
/// literals — exactly the inspection we want.
fn classify_literal(input: TokenStream) -> Option<(Literal, usize)> {
    let mut iter = input.into_iter();
    let TokenTree::Literal(lit) = iter.next()? else {
        return None;
    };
    if iter.next().is_some() {
        return None;
    }
    let value = lit.str_value().ok()?;
    Some((lit, value.len()))
}
