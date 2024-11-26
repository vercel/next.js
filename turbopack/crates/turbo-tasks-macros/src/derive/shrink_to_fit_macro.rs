use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, FieldsNamed, FieldsUnnamed};
use turbo_tasks_macros_shared::{generate_exhaustive_destructuring, match_expansion};

pub fn derive_shrink_to_fit(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let (impl_generics, ty_generics, where_clause) = derive_input.generics.split_for_impl();

    let shrink_items = match_expansion(&derive_input, &shrink_named, &shrink_unnamed, &shrink_unit);
    quote! {
        impl #impl_generics turbo_tasks::ShrinkToFit for #ident #ty_generics #where_clause {
            fn shrink_to_fit(&mut self) {
                #shrink_items
            }
        }
    }
    .into()
}

fn shrink_named(_ident: TokenStream2, fields: &FieldsNamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_exhaustive_destructuring(fields.named.iter());
    (
        captures,
        quote! {
            {#(
                turbo_tasks::macro_helpers::ShrinkToFitDerefSpecialization::new(
                    #fields_idents,
                ).shrink_to_fit();
            )*}
        },
    )
}

fn shrink_unnamed(_ident: TokenStream2, fields: &FieldsUnnamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_exhaustive_destructuring(fields.unnamed.iter());
    (
        captures,
        quote! {
            {#(
                turbo_tasks::macro_helpers::ShrinkToFitDerefSpecialization::new(
                    #fields_idents,
                ).shrink_to_fit();
            )*}
        },
    )
}

fn shrink_unit(_ident: TokenStream2) -> TokenStream2 {
    quote! { { } }
}
