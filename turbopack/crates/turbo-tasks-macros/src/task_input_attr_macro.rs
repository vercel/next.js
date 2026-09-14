//! The `#[turbo_tasks::task_input]` attribute macro.
//!
//! When applied to a struct/enum, emits:
//!
//! - `unsafe impl NonLocalValue for Ty` (unless `contains_unresolved_vcs` is passed).
//! - `impl turbo_tasks::TaskInput for Ty` with a field-walking `is_transient` (any contained `Vc`
//!   field can carry transience). By default `is_resolved` returns `true` and `resolve_input`
//!   returns a `CloneReady` future (8 bytes per awaitee). When `contains_unresolved_vcs` is set,
//!   the macro instead emits field-walking `is_resolved` and `resolve_input` — correct for types
//!   that hold a `Vc<T>` somewhere.
//!
//! Two usages:
//!
//! ```ignore
//! // The common case: type contains no unresolved Vcs (only ResolvedVc / OperationVc / leaves).
//! // Emits both NonLocalValue and the empty-body TaskInput impl.
//! #[turbo_tasks::task_input]
//! #[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
//! pub struct MyTaskInput { ... }
//!
//! // Opt out of NonLocalValue: type contains Vc<T> fields. Emits a field-walking
//! // resolve_input that recursively calls TaskInput::resolve_input on each field.
//! #[turbo_tasks::task_input(contains_unresolved_vcs)]
//! #[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
//! pub struct VcCarrier { vc: Vc<SomeType> }
//! ```

use proc_macro::TokenStream;
use proc_macro2::Span;
use quote::quote;
use syn::{
    Error, Item, ItemEnum, ItemStruct, Meta, Token,
    parse::{Parse, ParseStream},
    parse_macro_input,
    spanned::Spanned,
};

use crate::{
    derive::non_local_value_macro::non_local_value_impl,
    expand::{
        generate_exhaustive_destructuring, item_data, match_expansion, task_input_is_transient_body,
    },
};

struct TaskInputArguments {
    /// Set by `contains_unresolved_vcs` arg: the type contains `Vc<T>` (not `ResolvedVc` /
    /// `OperationVc`). The macro suppresses the `unsafe impl NonLocalValue` emission (which
    /// would be unsound) and emits a field-walking `TaskInput::resolve_input` that recursively
    /// resolves each field. Without this flag, the macro emits an empty `impl TaskInput` that
    /// uses the trait defaults (`CloneReady` future, no per-field walk).
    contains_unresolved_vcs: Option<Span>,
}

impl Parse for TaskInputArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut result = TaskInputArguments {
            contains_unresolved_vcs: None,
        };
        let punctuated = input.parse_terminated(Meta::parse, Token![,])?;
        for meta in punctuated {
            let ident = meta
                .path()
                .get_ident()
                .map(ToString::to_string)
                .unwrap_or_default();
            match (ident.as_str(), &meta) {
                ("contains_unresolved_vcs", Meta::Path(p)) => {
                    result.contains_unresolved_vcs = Some(p.span());
                }
                _ => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!("unexpected `{ident}`, expected `contains_unresolved_vcs`"),
                    ));
                }
            }
        }
        Ok(result)
    }
}

pub fn task_input(args: TokenStream, input: TokenStream) -> TokenStream {
    let TaskInputArguments {
        contains_unresolved_vcs,
    } = parse_macro_input!(args as TaskInputArguments);
    let item = parse_macro_input!(input as Item);

    // `match_expansion` and the `NonLocalValue` assertions only need the type's `ident`, generics,
    // and `Data` (field shape) — so we pull those straight off the `Item` rather than
    // round-tripping through a synthetic `DeriveInput`.
    let (ident, generics) = match &item {
        Item::Struct(ItemStruct {
            ident, generics, ..
        })
        | Item::Enum(ItemEnum {
            ident, generics, ..
        }) => (ident.clone(), generics.clone()),
        _ => {
            item.span()
                .unwrap()
                .error("`#[turbo_tasks::task_input]` may only be applied to a struct or enum")
                .emit();
            return quote! { #item }.into();
        }
    };
    let data = item_data(&item).expect("guarded by the struct/enum match above");

    let (impl_generics, ty_generics, _) = generics.split_for_impl();
    let generic_type_params: Vec<_> = generics.type_params().map(|param| &param.ident).collect();
    // Preserve any existing `where` predicates; we always append per-trait bounds for each
    // generic type parameter below.
    let existing_predicates: Vec<_> = generics
        .where_clause
        .as_ref()
        .map(|wc| wc.predicates.iter().collect())
        .unwrap_or_default();

    // All TaskInput impls (whether or not `contains_unresolved_vcs`) include a field-walking
    // `is_transient`: any contained Vc field can carry transience.
    let is_transient_impl = task_input_is_transient_body(&ident, &data);

    // When the type holds Vc<T>, resolve_input must walk fields and recursively resolve. This
    // is the same expansion the deleted `#[derive(TaskInput)]` produced; we reuse the
    // `match_expansion` helper to generate the body.
    let task_input_impl = if contains_unresolved_vcs.is_some() {
        let is_resolved_impl = match_expansion(
            &ident,
            &data,
            &|_ident, fields| {
                let (capture, fields) = generate_exhaustive_destructuring(fields.named.iter());
                (
                    capture,
                    quote! {
                        {#(
                            turbo_tasks::TaskInput::is_resolved(#fields) &&
                        )* true}
                    },
                )
            },
            &|_ident, fields| {
                let (capture, fields) = generate_exhaustive_destructuring(fields.unnamed.iter());
                (
                    capture,
                    quote! {
                        {#(
                            turbo_tasks::TaskInput::is_resolved(#fields) &&
                        )* true}
                    },
                )
            },
            &|_ident| quote! {true},
        );
        let resolve_impl = match_expansion(
            &ident,
            &data,
            &|ctor, fields| {
                let (capture, fields) = generate_exhaustive_destructuring(fields.named.iter());
                (
                    capture,
                    quote! {
                        {
                            #(
                                let #fields = turbo_tasks::TaskInput::resolve_input(#fields).await?;
                            )*
                            Ok(#ctor { #(#fields),* })
                        }
                    },
                )
            },
            &|ctor, fields| {
                let (capture, fields) = generate_exhaustive_destructuring(fields.unnamed.iter());
                (
                    capture,
                    quote! {
                        {
                            #(
                                let #fields = turbo_tasks::TaskInput::resolve_input(#fields).await?;
                            )*
                            Ok(#ctor(#(#fields),*))
                        }
                    },
                )
            },
            &|ctor| quote! {Ok(#ctor)},
        );
        quote! {
            #[automatically_derived]
            impl #impl_generics turbo_tasks::TaskInput for #ident #ty_generics
            where
                #(#existing_predicates,)*
                #(#generic_type_params: turbo_tasks::TaskInput,)*
            {
                #[allow(non_snake_case)]
                #[allow(unreachable_code)] // can occur for enums with no variants
                fn is_resolved(&self) -> bool {
                    #is_resolved_impl
                }

                #[allow(non_snake_case)]
                #[allow(unreachable_code)]
                fn is_transient(&self) -> bool {
                    #is_transient_impl
                }

                #[allow(non_snake_case)]
                #[allow(unreachable_code)]
                #[allow(clippy::manual_async_fn)]
                fn resolve_input(
                    &self,
                ) -> impl ::std::future::Future<Output = turbo_tasks::Result<Self>>
                + ::std::marker::Send
                + '_ {
                    async move {
                        #resolve_impl
                    }
                }
            }
        }
    } else {
        // No unresolved Vcs: `is_resolved` and `resolve_input` use the trait defaults, only
        // `is_transient` needs to walk fields. The `+ NonLocalValue` bound matches the
        // `unsafe impl NonLocalValue` emitted below — without it, a `Wrapper<Vc<X>>` could
        // satisfy `Wrapper: TaskInput` while `Wrapper<Vc<X>>: NonLocalValue` did not hold,
        // defeating the storage-safety guarantee that motivates the default-mode
        // `task_input` (the type must be safe to send across task boundaries).
        quote! {
            #[automatically_derived]
            impl #impl_generics turbo_tasks::TaskInput for #ident #ty_generics
            where
                #(#existing_predicates,)*
                #(#generic_type_params: turbo_tasks::TaskInput + turbo_tasks::NonLocalValue,)*
            {
                #[allow(non_snake_case)]
                #[allow(unreachable_code)]
                fn is_transient(&self) -> bool {
                    #is_transient_impl
                }
            }
        }
    };

    // Emit `unsafe impl NonLocalValue` (plus field assertions) unless opted out — sharing the
    // same code path as `#[derive(NonLocalValue)]`. `add_bounds` appends a `T: NonLocalValue`
    // predicate for each generic type param so the `unsafe impl` is sound and the field
    // assertions see the per-generic bound (a `struct GenericField<T>(T)` would otherwise always
    // fail the assertion).
    let non_local_value = if contains_unresolved_vcs.is_some() {
        quote! {}
    } else {
        non_local_value_impl(&ident, &generics, &data, /* add_bounds */ true)
    };

    let expanded = quote! {
        #item

        #non_local_value
        #task_input_impl
    };

    expanded.into()
}
