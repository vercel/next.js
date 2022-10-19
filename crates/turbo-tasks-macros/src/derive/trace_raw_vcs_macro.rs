use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Field, FieldsNamed, FieldsUnnamed};
use turbo_tasks_macros_shared::{generate_destructuring, match_expansion};

use super::FieldAttributes;

fn ignore_field(field: &Field) -> bool {
    FieldAttributes::from(field.attrs.as_slice()).trace_ignore
}

pub fn derive_trace_raw_vcs(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let generics = &derive_input.generics;

    let trace_items = match_expansion(&derive_input, &trace_named, &trace_unnamed, &trace_unit);
    let generics_params = &generics.params.iter().collect::<Vec<_>>();
    quote! {
        impl #generics turbo_tasks::trace::TraceRawVcs for #ident #generics #(where #generics_params: turbo_tasks::trace::TraceRawVcs)* {
            fn trace_raw_vcs(&self, __context__: &mut turbo_tasks::trace::TraceRawVcsContext) {
                #trace_items
            }
        }
    }
    .into()
}

fn trace_named(_ident: &Ident, fields: &FieldsNamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.named.iter(), &ignore_field);
    (
        captures,
        quote! {
            {#(
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(#fields_idents, __context__);
            )*}
        },
    )
}

fn trace_unnamed(_ident: &Ident, fields: &FieldsUnnamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.unnamed.iter(), &ignore_field);
    (
        captures,
        quote! {
            {#(
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(#fields_idents, __context__);
            )*}
        },
    )
}

fn trace_unit(_ident: &Ident) -> (TokenStream2, TokenStream2) {
    (quote! {}, quote! { { } })
}
