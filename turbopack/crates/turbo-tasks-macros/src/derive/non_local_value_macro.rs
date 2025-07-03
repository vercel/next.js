use proc_macro::TokenStream;
use quote::quote;
use syn::{DeriveInput, parse_macro_input, parse_quote};

use crate::{assert_fields::assert_fields_impl_trait, derive::trace_raw_vcs_macro::filter_field};

pub fn derive_non_local_value(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;

    let assertions = assert_fields_impl_trait(
        &parse_quote!(turbo_tasks::NonLocalValue),
        &derive_input.generics,
        &derive_input.data,
        filter_field,
    );

    let (impl_generics, ty_generics, where_clause) = derive_input.generics.split_for_impl();
    quote! {
        unsafe impl #impl_generics turbo_tasks::NonLocalValue
            for #ident #ty_generics #where_clause {}
        #assertions
    }
    .into()
}
