#![allow(internal_features)]
#![feature(proc_macro_diagnostic)]
#![feature(allow_internal_unstable)]
#![feature(box_patterns)]

mod derive;
mod func;
mod function_macro;
mod generic_type_macro;
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

#[proc_macro_derive(ResolvedValue, attributes(turbo_tasks))]
pub fn derive_resolved_value_attr(input: TokenStream) -> TokenStream {
    derive::derive_resolved_value(input)
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

/// Creates a Vc<Value> struct for a `struct` or `enum` that represent
/// that type placed into a cell in a Task.
///
/// That Vc<Value> object can be `await`ed to get a readonly reference
/// to the value contained in the cell.
///
/// ## Arguments
///
/// Example: `#[turbo_tasks::value(into = "new", eq = "manual")]`
///
/// ### `cell`
///
/// Possible values:
///
/// - "new": Always overrides the value in the cell. Invalidating all
/// dependent tasks.
/// - "shared" (default): Compares with the existing value in the cell, before
/// overriding it. Requires Value to implement [Eq].
///
/// ### `eq`
///
/// Possible values:
///
/// - "manual": Prevents deriving [Eq] so you can do it manually.
///
/// ### `into`
///
/// When provided the Vc<Value> implement `From<Value>` to allow to convert
/// a Value to a Vc<Value> by placing it into a cell in a Task.
///
/// Possible values:
///
/// - "new": Always overrides the value in the cell. Invalidating all
/// dependent tasks.
/// - "shared": Compares with the existing value in the cell, before
/// overriding it. Requires Value to implement [Eq].
/// - "none" (default): Prevents implementing `From<Value>`.
///
/// ### `serialization`
///
/// Affects serialization via [serde::Serialize] and [serde::Deserialize].
///
/// Possible values:
///
/// - "auto" (default): Derives the serialization traits and enabled
///   serialization.
/// - "auto_for_input": Same as "auto", but also adds the marker trait
///   [turbo_tasks::TypedForInput].
/// - "custom": Prevents deriving the serialization traits, but still enables
///   serialization (you need to manually implement [serde::Serialize] and
///   [serde::Deserialize]).
/// - "custom_for_input":Same as "auto", but also adds the marker trait
///   [turbo_tasks::TypedForInput].
/// - "none": Disables serialization and prevents deriving the traits.
///
/// ### `shared`
///
/// Sets both `cell = "shared"` and `into = "shared"`
///
/// No value.
///
/// Example: `#[turbo_tasks::value(shared)]`
///
/// ### `transparent`
///
/// If applied to a unit struct (e.g. `struct Wrapper(Value)`) the outer struct
/// is skipped for all operations (cell, into, reading).
///
/// No value.
///
/// Example: `#[turbo_tasks::value(transparent)]`
///
/// ### `resolved`
///
/// A shorthand syntax for
/// [`#[derive(turbo_tasks::ResolvedValue)]`][macro@turbo_tasks::ResolvedValue]
///
/// Example: `#[turbo_tasks::value(resolved)]`
///
/// TODO: add more documentation: presets, traits
#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_error]
#[proc_macro_attribute]
pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    value_macro::value(args, input)
}

/// Allows this trait to be used as part of a trait object inside of a value
/// cell, in the form of `Vc<dyn MyTrait>`.
///
/// ## Arguments
///
/// Example: `#[turbo_tasks::value_trait(no_debug, resolved)]`
///
/// ### 'no_debug`
///
/// Disables the automatic implementation of [`turbo_tasks::debug::ValueDebug`].
///
/// Example: `#[turbo_tasks::value_trait(no_debug)]`
///
/// ### 'resolved`
///
/// Adds [`turbo_tasks::ResolvedValue`] as a supertrait of this trait.
///
/// Example: `#[turbo_tasks::value_trait(resolved)]`
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
