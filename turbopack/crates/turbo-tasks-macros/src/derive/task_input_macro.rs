use proc_macro::TokenStream;
use quote::quote;
use syn::{
    Data, DeriveInput, GenericArgument, PathArguments, Type, parse_macro_input, spanned::Spanned,
};

use crate::expand::{generate_exhaustive_destructuring, match_expansion};

/// Returns `true` if the given type syntactically contains a bare `Vc<…>` path segment.
///
/// This is used to compute `NEEDS_RESOLVE` in the derive macro without a const-eval expression
/// that could form a cycle for self-referential types (e.g. a recursive enum with `Box<Self>`).
fn type_contains_vc(ty: &Type) -> bool {
    match ty {
        Type::Path(type_path) => {
            for segment in &type_path.path.segments {
                if segment.ident == "Vc" {
                    return true;
                }
                if let PathArguments::AngleBracketed(args) = &segment.arguments {
                    for arg in &args.args {
                        if let GenericArgument::Type(inner) = arg {
                            if type_contains_vc(inner) {
                                return true;
                            }
                        }
                    }
                }
            }
            false
        }
        Type::Tuple(tuple) => tuple.elems.iter().any(type_contains_vc),
        Type::Slice(slice) => type_contains_vc(&slice.elem),
        Type::Array(array) => type_contains_vc(&array.elem),
        Type::Reference(reference) => type_contains_vc(&reference.elem),
        Type::Paren(paren) => type_contains_vc(&paren.elem),
        _ => false,
    }
}

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

    // Compute NEEDS_RESOLVE at macro-expansion time by checking whether any field type
    // syntactically contains a `Vc<…>` path segment.
    let any_field_needs_resolve = {
        let all_fields: Vec<_> = match &derive_input.data {
            Data::Struct(s) => s.fields.iter().map(|f| &f.ty).collect(),
            Data::Enum(e) => e
                .variants
                .iter()
                .flat_map(|v| v.fields.iter().map(|f| &f.ty))
                .collect(),
            _ => vec![],
        };
        all_fields.iter().any(|ty| type_contains_vc(ty))
    };
    let needs_resolve_impl = if any_field_needs_resolve {
        quote! { true }
    } else {
        quote! { false }
    };

    quote! {
        #[automatically_derived]
        #[turbo_tasks::macro_helpers::async_trait]
        impl #generics turbo_tasks::TaskInput for #ident #generics
        where
            #(#generic_params: turbo_tasks::TaskInput,)*
        {
            const NEEDS_RESOLVE: bool = #needs_resolve_impl;

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
