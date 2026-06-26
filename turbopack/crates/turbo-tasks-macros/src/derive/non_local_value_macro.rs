use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{Data, DeriveInput, Generics, Ident, parse_macro_input, parse_quote};

use crate::{assert_fields::assert_fields_impl_trait, derive::trace_raw_vcs_macro::filter_field};

/// Emits `unsafe impl NonLocalValue for #ident` plus the field assertions that fail compilation
/// (pointing at the offending field) if any field is not a `NonLocalValue`.
///
/// Shared by `#[derive(NonLocalValue)]` and the `#[turbo_tasks::task_input]` attribute macro.
/// When `add_bounds` is set, a `T: NonLocalValue` predicate is appended for each generic type
/// parameter — the attribute macro needs this so a `struct GenericField<T>(T)` both gets a sound
/// `unsafe impl` and passes the field assertion (the assertion struct must see the per-generic
/// bound). The derive macro relies on the type's existing `where` clause instead and passes
/// `false`.
pub fn non_local_value_impl(
    ident: &Ident,
    generics: &Generics,
    data: &Data,
    add_bounds: bool,
) -> TokenStream2 {
    let mut generics = generics.clone();
    if add_bounds {
        let type_params: Vec<_> = generics.type_params().map(|p| p.ident.clone()).collect();
        let where_clause = generics.make_where_clause();
        for param in type_params {
            where_clause
                .predicates
                .push(parse_quote!(#param: turbo_tasks::NonLocalValue));
        }
    }

    let assertions = assert_fields_impl_trait(
        &parse_quote!(turbo_tasks::NonLocalValue),
        &generics,
        data,
        filter_field,
    );

    let (impl_generics, ty_generics, where_clause) = generics.split_for_impl();
    quote! {
        #[automatically_derived]
        unsafe impl #impl_generics turbo_tasks::NonLocalValue
            for #ident #ty_generics #where_clause {}
        #assertions
    }
}

pub fn derive_non_local_value(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    non_local_value_impl(
        &derive_input.ident,
        &derive_input.generics,
        &derive_input.data,
        /* add_bounds */ false,
    )
    .into()
}
