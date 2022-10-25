#![feature(proc_macro_diagnostic)]
#![feature(allow_internal_unstable)]
#![feature(box_patterns)]

mod derive;
mod func;
mod function_macro;
mod util;
mod value_impl_macro;
mod value_macro;
mod value_trait_macro;

extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro_error::proc_macro_error;

#[proc_macro_derive(TraceRawVcs, attributes(turbo_tasks))]
pub fn derive_trace_raw_vcs_attr(input: TokenStream) -> TokenStream {
    derive::derive_trace_raw_vcs(input)
}

#[proc_macro_derive(ValueDebug, attributes(turbo_tasks))]
pub fn derive_value_debug_attr(input: TokenStream) -> TokenStream {
    derive::derive_value_debug(input)
}

#[proc_macro_derive(ValueDebugFormat, attributes(turbo_tasks))]
pub fn derive_value_debug_format_attr(input: TokenStream) -> TokenStream {
    derive::derive_value_debug_format(input)
}

#[proc_macro_derive(DeterministicHash, attributes(turbo_tasks))]
pub fn derive_deterministic_hash(input: TokenStream) -> TokenStream {
    derive::derive_deterministic_hash(input)
}

/// Creates a ValueVc struct for a `struct` or `enum` that represent
/// that type placed into a cell in a Task.
///
/// That ValueVc object can be `.await?`ed to get a readonly reference
/// to the original value.
///
/// `into` argument (`#[turbo_tasks::value(into: xxx)]`)
///
/// When provided the ValueVc implement `From<Value>` to allow to convert
/// a Value to a ValueVc by placing it into a cell in a Task.
///
/// `into: new`: Always overrides the value in the cell. Invalidating all
/// dependent tasks.
///
/// `into: shared`: Compares with the existing value in the cell, before
/// overriding it. Requires Value to implement [Eq].
///
/// TODO: add more documentation: presets, traits
#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    value_macro::value(args, input)
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value_trait(args: TokenStream, input: TokenStream) -> TokenStream {
    value_trait_macro::value_trait(args, input)
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn function(args: TokenStream, input: TokenStream) -> TokenStream {
    function_macro::function(args, input)
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value_impl(args: TokenStream, input: TokenStream) -> TokenStream {
    value_impl_macro::value_impl(args, input)
}
