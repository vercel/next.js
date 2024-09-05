use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Field, FieldsNamed, FieldsUnnamed};
use turbo_tasks_macros_shared::{generate_destructuring, match_expansion};

use super::FieldAttributes;

fn filter_field(field: &Field) -> bool {
    // `trace_ignores` implies the field does not contain `Vc`s
    // TODO: Rename this field into something a bit more generic, like `has_no_vcs`?
    !FieldAttributes::from(field.attrs.as_slice()).trace_ignore
}

#[allow(dead_code)]
pub fn derive_resolve_deep(input: TokenStream) -> TokenStream {
    let mut derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;

    for type_param in derive_input.generics.type_params_mut() {
        type_param
            .bounds
            .push(syn::parse_quote!(turbo_tasks::ResolveDeep));
    }
    let (impl_generics, ty_generics, where_clause) = derive_input.generics.split_for_impl();

    let resolve_items = match_expansion(
        &derive_input,
        &resolve_named,
        &resolve_unnamed,
        &resolve_unit,
    );
    quote! {
        impl #impl_generics turbo_tasks::ResolveDeep for #ident #ty_generics #where_clause {
            async fn resolve_deep(&mut self) -> turbo_tasks::macro_helpers::anyhow::Result<()> {
                #resolve_items
                Ok(())
            }
        }
    }
    .into()
}

fn resolve_named(_ident: TokenStream2, fields: &FieldsNamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.named.iter(), &filter_field);
    (
        captures,
        quote! {
            {#(
                turbo_tasks::ResolveDeep::resolve_deep(#fields_idents).await?;
            )*}
        },
    )
}

fn resolve_unnamed(_ident: TokenStream2, fields: &FieldsUnnamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.unnamed.iter(), &filter_field);
    (
        captures,
        quote! {
            {#(
                turbo_tasks::ResolveDeep::resolve_deep(#fields_idents).await?;
            )*}
        },
    )
}

fn resolve_unit(_ident: TokenStream2) -> TokenStream2 {
    quote! { { } }
}
