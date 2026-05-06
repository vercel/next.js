//! Proc macro implementation of `rcstr!`.
//!
//! This proc macro inspects the literal at expansion time and emits only
//! the relevant arm. The threshold (`MAX_INLINE_LEN`) is computed at the
//! proc-macro crate's compile time from its own `atom_size_*` feature
//! flags, which `turbo-rcstr` forwards from its matching features. For
//! inputs the proc macro cannot inspect (constant identifiers, `concat!`
//! results, `quote!` interpolations, etc.) it falls back to the original
//! both-branches expansion that defers the decision to const evaluation.
//!
//! The implementation deliberately avoids `syn` and `quote`. The macro is
//! invoked thousands of times across the workspace, so per-invocation cost
//! matters: we pattern-match on `proc_macro::TokenTree` directly to
//! identify a single string-literal token, ask the compiler for its
//! unescaped value via [`Literal::str_value`] (gated by the unstable
//! `proc_macro_value` feature), and emit the chosen expansion by parsing
//! a string template via `TokenStream::from_str`. This keeps the per-call
//! cost close to a `macro_rules!` macro and avoids pulling `syn`'s parser
//! into every consuming crate's compilation.

#![feature(proc_macro_value)]

use std::str::FromStr;

use proc_macro::{Literal, TokenStream, TokenTree};

/// `MAX_INLINE_LEN` for the active `turbo-rcstr` configuration, computed
/// from the proc-macro crate's own feature flags. The outer `turbo-rcstr`
/// crate forwards its `atom_size_*` features to this crate so the proc
/// macro sees the same threshold the consuming binary will see at runtime.
///
/// Mirrors [`turbo_rcstr::tagged_value::MAX_INLINE_LEN`]: a tagged value is
/// `size_of::<TaggedValue>() - 1` bytes of inline payload. With
/// `atom_size_128` the value is `u128` (15 bytes inlinable); otherwise (the
/// default 64-bit case and the `atom_size_64` feature) it is 8 bytes wide,
/// giving 7 bytes of inline payload.
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
    if let Some((lit, len)) = classify_literal(input.clone()) {
        if len <= MAX_INLINE_LEN {
            return emit_inlinable(&lit);
        } else {
            return emit_non_inlinable(&lit);
        }
    }
    emit_fallback(input)
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

/// Emit `::turbo_rcstr::inline_atom(<lit>).unwrap()`.
fn emit_inlinable(lit: &Literal) -> TokenStream {
    parse(&format!("::turbo_rcstr::inline_atom({lit}).unwrap()"))
}

/// Emit the static + inventory submission expansion for a literal we know
/// is non-inlinable. No inline arm, no const branch.
fn emit_non_inlinable(lit: &Literal) -> TokenStream {
    parse(&format!(
        "{{ static RCSTR_STORAGE: ::turbo_rcstr::PrehashedString = \
         ::turbo_rcstr::make_const_prehashed_string({lit}); const RCSTR: ::turbo_rcstr::RcStr = \
         ::turbo_rcstr::from_static(&RCSTR_STORAGE); ::turbo_rcstr::__rcstr_inventory_submit!( \
         ::turbo_rcstr::StaticRcStr(&RCSTR_STORAGE) ); RCSTR }}",
    ))
}

/// Emit the both-branches const-eval expansion. Used for non-literal
/// inputs (constant identifiers, `concat!(...)`, etc.) and for literals
/// whose unescaped length we couldn't determine cheaply.
fn emit_fallback(input: TokenStream) -> TokenStream {
    parse(&format!(
        "{{ const TEXT: &str = {input}; if ::turbo_rcstr::is_atom_inlineable(TEXT) {{ \
         ::turbo_rcstr::inline_atom(TEXT).unwrap() }} else {{ static RCSTR_STORAGE: \
         ::turbo_rcstr::PrehashedString = ::turbo_rcstr::make_const_prehashed_string(TEXT); const \
         RCSTR: ::turbo_rcstr::RcStr = ::turbo_rcstr::from_static(&RCSTR_STORAGE); \
         ::turbo_rcstr::__rcstr_inventory_submit!( ::turbo_rcstr::StaticRcStr(&RCSTR_STORAGE) ); \
         RCSTR }} }}",
    ))
}

#[inline]
fn parse(source: &str) -> TokenStream {
    TokenStream::from_str(source).expect("emitted source parses")
}
