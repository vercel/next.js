#![allow(internal_features)]
#![feature(proc_macro_diagnostic)]
#![feature(allow_internal_unstable)]
#![feature(box_patterns)]

mod assert_fields;
mod derive;
mod func;
mod function_macro;
mod generic_type_macro;
mod global_name;
mod primitive_macro;
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

#[proc_macro_derive(NonLocalValue, attributes(turbo_tasks))]
pub fn derive_non_local_value_attr(input: TokenStream) -> TokenStream {
    derive::derive_non_local_value(input)
}

#[proc_macro_derive(OperationValue, attributes(turbo_tasks))]
pub fn derive_operation_value_attr(input: TokenStream) -> TokenStream {
    derive::derive_operation_value(input)
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

#[proc_macro_derive(TaskInput, attributes(turbo_tasks))]
pub fn derive_task_input(input: TokenStream) -> TokenStream {
    derive::derive_task_input(input)
}

/// <!--
/// Documentation for this macro is available on the re-export:
/// <https://turbopack-rust-docs.vercel.sh/rustdoc/turbo_tasks/derive.KeyValuePair.html>
/// -->
#[proc_macro_derive(KeyValuePair)]
pub fn derive_key_value_pair(input: TokenStream) -> TokenStream {
    derive::derive_key_value_pair(input)
}

/// <!--
/// Documentation for this macro is available on the re-export:
/// <https://turbopack-rust-docs.vercel.sh/rustdoc/turbo_tasks/attr.value.html>
/// -->
#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    value_macro::value(args, input)
}

/// <!--
/// Documentation for this macro is available on the re-export:
/// <https://turbopack-rust-docs.vercel.sh/rustdoc/turbo_tasks/attr.value_trait.html>
/// -->
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
pub fn test_tt(_args: TokenStream, input: TokenStream) -> TokenStream {
    derive::derive_value_debug(input)
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value_impl(args: TokenStream, input: TokenStream) -> TokenStream {
    value_impl_macro::value_impl(args, input)
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro]
pub fn primitive(input: TokenStream) -> TokenStream {
    primitive_macro::primitive(input)
}

/// Registers a value type that is generic over the `Vc` it contains.
///
/// # Example
///
/// ```
/// use crate::generic_type as __turbo_tasks_internal_generic_type;
///
/// __turbo_tasks_internal_generic_type!(<A, B>, GenericType<Vc<A>, Vc<B>>);
///
/// // Now you can do the following, for any `A` and `B` value types:
///
/// let vc: Vc<GenericType<Vc<u32>, Vc<RcStr>>> = Vc::cell(
///     GenericType::new(
///         Vc::cell(42),
///         Vc::cell("hello".to_string())
///     )
/// );
/// ```
#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro]
pub fn generic_type(input: TokenStream) -> TokenStream {
    generic_type_macro::generic_type(input)
}
