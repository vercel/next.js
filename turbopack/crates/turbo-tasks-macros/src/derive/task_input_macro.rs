use proc_macro::TokenStream;
use quote::quote;
use syn::{DeriveInput, parse_macro_input};

use crate::{
    derive::check_supported_generics,
    expand::{generate_exhaustive_destructuring, match_expansion},
};

pub fn derive_task_input(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let generics = &derive_input.generics;

    check_supported_generics(generics, "TaskInput");

    let is_resolved_impl = match_expansion(
        &derive_input,
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
        &derive_input,
        &|ident, fields| {
            let (capture, fields) = generate_exhaustive_destructuring(fields.named.iter());
            (
                capture,
                quote! {
                    {
                        #(
                            let #fields = turbo_tasks::TaskInput::resolve_input(#fields).await?;
                        )*
                        Ok(#ident { #(#fields),* })
                    }
                },
            )
        },
        &|ident, fields| {
            let (capture, fields) = generate_exhaustive_destructuring(fields.unnamed.iter());
            (
                capture,
                quote! {
                    {
                        #(
                            let #fields = turbo_tasks::TaskInput::resolve_input(#fields).await?;
                        )*
                        Ok(#ident(#(#fields),*))
                    }
                },
            )
        },
        &|ident| quote! {Ok(#ident)},
    );

    let generic_params: Vec<_> = generics
        .params
        .iter()
        .filter_map(|param| match param {
            syn::GenericParam::Type(param) => Some(param),
            _ => {
                // We already report an error for this above.
                None
            }
        })
        .collect();

    quote! {
        #[automatically_derived]
        #[turbo_tasks::macro_helpers::async_trait]
        impl #generics turbo_tasks::TaskInput for #ident #generics
        where
            #(#generic_params: turbo_tasks::TaskInput,)*
        {
            #[allow(non_snake_case)]
            #[allow(unreachable_code)] // This can occur for enums with no variants.
            fn is_resolved(&self) -> bool {
                #is_resolved_impl
            }

            #[allow(non_snake_case)]
            #[allow(unreachable_code)] // This can occur for enums with no variants.
            #[allow(clippy::manual_async_fn)] // some impls need the manual return type to work :(
            fn resolve_input(
                &self,
            ) -> impl
                ::std::future::Future<Output = turbo_tasks::Result<Self>> +
                ::std::marker::Send +
                '_
            {
                async move {
                    #resolve_impl
                }
            }
        }
    }
    .into()
}
