use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, spanned::Spanned, DeriveInput};
use turbo_tasks_macros_shared::{generate_exhaustive_destructuring, match_expansion};

pub fn derive_task_input(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let generics = &derive_input.generics;

    if let Some(where_clause) = &generics.where_clause {
        // NOTE(alexkirsz) We could support where clauses and generic parameters bounds
        // in the future, but for simplicity's sake, we don't support them yet.
        where_clause
            .span()
            .unwrap()
            .error("the TaskInput derive macro does not support where clauses yet")
            .emit();
    }

    for param in &generics.params {
        match param {
            syn::GenericParam::Type(param) => {
                if !param.bounds.is_empty() {
                    // NOTE(alexkirsz) See where clause above.
                    param
                        .span()
                        .unwrap()
                        .error(
                            "the TaskInput derive macro does not support generic parameters \
                             bounds yet",
                        )
                        .emit();
                }
            }
            syn::GenericParam::Lifetime(param) => {
                param
                    .span()
                    .unwrap()
                    .error("the TaskInput derive macro does not support generic lifetimes")
                    .emit();
            }
            syn::GenericParam::Const(param) => {
                // NOTE(alexkirsz) Ditto: not supported yet for simplicity's sake.
                param
                    .span()
                    .unwrap()
                    .error("the TaskInput derive macro does not support const generics yet")
                    .emit();
            }
        }
    }

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
    let is_transient_impl = match_expansion(
        &derive_input,
        &|_ident, fields| {
            let (capture, fields) = generate_exhaustive_destructuring(fields.named.iter());
            (
                capture,
                quote! {
                    {#(
                        turbo_tasks::TaskInput::is_transient(#fields) ||
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
                        turbo_tasks::TaskInput::is_transient(#fields) ||
                    )* false}
                },
            )
        },
        &|_ident| quote! {false},
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
            fn is_transient(&self) -> bool {
                #is_transient_impl
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
