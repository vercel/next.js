use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Field, FieldsNamed, FieldsUnnamed};
use turbo_tasks_macros_shared::{generate_destructuring, match_expansion};

use super::FieldAttributes;

fn filter_field(field: &Field) -> bool {
    !FieldAttributes::from(field.attrs.as_slice()).debug_ignore
}

/// This macro generates the implementation of the `ValueDebugFormat` trait for
/// a given type.
///
/// Fields annotated with `#[debug_ignore]` will not appear in the
/// `ValueDebugFormat` representation of the type.
pub fn derive_value_debug_format(input: TokenStream) -> TokenStream {
    let mut derive_input = parse_macro_input!(input as DeriveInput);

    let ident = &derive_input.ident;

    for type_param in derive_input.generics.type_params_mut() {
        type_param
            .bounds
            .push(syn::parse_quote!(turbo_tasks::debug::ValueDebugFormat));
        type_param.bounds.push(syn::parse_quote!(std::fmt::Debug));
        type_param.bounds.push(syn::parse_quote!(std::marker::Send));
        type_param.bounds.push(syn::parse_quote!(std::marker::Sync));
    }
    let (impl_generics, ty_generics, where_clause) = derive_input.generics.split_for_impl();

    let formatting_logic =
        match_expansion(&derive_input, &format_named, &format_unnamed, &format_unit);

    quote! {
        impl #impl_generics turbo_tasks::debug::ValueDebugFormat for #ident #ty_generics #where_clause {
            fn value_debug_format<'a>(&'a self, depth: usize) -> turbo_tasks::debug::ValueDebugFormatString<'a> {
                turbo_tasks::debug::ValueDebugFormatString::Async(
                    Box::pin(async move {
                        if depth == 0 {
                            return Ok(stringify!(#ident).to_string());
                        }

                        use turbo_tasks::debug::internal::*;
                        use turbo_tasks::debug::ValueDebugFormat;
                        Ok(format!("{:#?}", #formatting_logic))
                    })
                )
            }
        }
    }
    .into()
}

/// Formats a single field nested inside named or unnamed fields.
fn format_field(value: TokenStream2) -> TokenStream2 {
    quote! {
        turbo_tasks::macro_helpers::value_debug_format_field(#value.value_debug_format(depth.saturating_sub(1)))
    }
}

/// Formats a struct or enum variant with named fields (e.g. `struct Foo {
/// bar: u32 }`, `Foo::Bar { baz: u32 }`).
fn format_named(ident: TokenStream2, fields: &FieldsNamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.named.iter(), &filter_field);
    (
        captures,
        if fields_idents.is_empty() {
            // this can happen if all fields are ignored, we must special-case this to avoid
            // rustc being unable to infer the type of an empty vec of futures
            quote! {
                FormattingStruct::new_named(turbo_tasks::stringify_path!(#ident), vec![])
            }
        } else {
            let fields_values = fields_idents.iter().cloned().map(format_field);
            quote! {
                FormattingStruct::new_named_async(
                    turbo_tasks::stringify_path!(#ident),
                    vec![#(
                        AsyncFormattingField::new(
                            stringify!(#fields_idents),
                            #fields_values,
                        ),
                    )*],
                ).await
            }
        },
    )
}

/// Formats a struct or enum variant with unnamed fields (e.g. `struct
/// Foo(u32)`, `Foo::Bar(u32)`).
fn format_unnamed(ident: TokenStream2, fields: &FieldsUnnamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_destructuring(fields.unnamed.iter(), &filter_field);
    (
        captures,
        if fields_idents.is_empty() {
            // this can happen if all fields are ignored, we must special-case this to avoid
            // rustc being unable to infer the type of an empty vec of futures
            quote! {
                FormattingStruct::new_unnamed(turbo_tasks::stringify_path!(#ident), vec![])
            }
        } else {
            let fields_values = fields_idents.into_iter().map(format_field);
            quote! {
                FormattingStruct::new_unnamed_async(
                    turbo_tasks::stringify_path!(#ident),
                    vec![#(
                        #fields_values,
                    )*],
                ).await
            }
        },
    )
}

/// Formats a unit struct or enum variant (e.g. `struct Foo;`, `Foo::Bar`).
fn format_unit(ident: TokenStream2) -> TokenStream2 {
    quote! {
        FormattingStruct::new_unnamed(
            turbo_tasks::stringify_path!(#ident),
            vec![],
        )
    }
}
