use proc_macro::TokenStream;
use quote::quote;
use syn::{DeriveInput, parse_macro_input};

use crate::{
    derive::check_supported_generics,
    expand::{generate_exhaustive_destructuring, match_expansion},
};

pub fn derive_is_transient(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let generics = &derive_input.generics;

    check_supported_generics(generics, "IsTransient");

    let is_transient_impl = match_expansion(
        &derive_input,
        &|_ident, fields| {
            let (capture, fields) = generate_exhaustive_destructuring(fields.named.iter());
            (
                capture,
                quote! {
                    {#(
                        turbo_tasks::IsTransient::is_transient(#fields) ||
                    )* false}
                },
            )
        },
        &|_ident, fields| {
            let (capture, fields) = generate_exhaustive_destructuring(fields.unnamed.iter());
            (
                capture,
                quote! {
                    {#(
                        turbo_tasks::IsTransient::is_transient(#fields) ||
                    )* false}
                },
            )
        },
        &|_ident| quote! {false},
    );

    let generic_params: Vec<_> = generics
        .params
        .iter()
        .filter_map(|param| match param {
            syn::GenericParam::Type(param) => Some(param),
            _ => None,
        })
        .collect();

    quote! {
        #[automatically_derived]
        impl #generics turbo_tasks::IsTransient for #ident #generics
        where
            #(#generic_params: turbo_tasks::IsTransient,)*
        {
            #[allow(non_snake_case)]
            #[allow(unreachable_code)] // can occur for enums with no variants
            fn is_transient(&self) -> bool {
                #is_transient_impl
            }
        }
    }
    .into()
}
