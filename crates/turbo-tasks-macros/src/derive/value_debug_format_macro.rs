use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{
    parse_macro_input, spanned::Spanned, Data, DataEnum, DataStruct, DeriveInput, Field, Fields,
    FieldsNamed, FieldsUnnamed,
};

use super::FieldAttributes;

fn ignore_field(field: &Field) -> bool {
    FieldAttributes::from(field.attrs.as_slice()).debug_ignore
}

/// This macro generates the implementation of the `ValueDebugFormat` trait for
/// a given type.
///
/// Fields annotated with `#[debug_ignore]` will not appear in the
/// `ValueDebugFormat` representation of the type.
pub fn derive_value_debug_format(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);

    let ident = &derive_input.ident;
    let formatting_logic = match &derive_input.data {
        Data::Enum(DataEnum { variants, .. }) => {
            let (variants_idents, (variants_fields_capture, variants_formatting)): (
                Vec<_>,
                (Vec<_>, Vec<_>),
            ) = variants
                .iter()
                .map(|variant| {
                    (
                        &variant.ident,
                        format_fields(&variant.ident, &variant.fields),
                    )
                })
                .unzip();

            quote! {
                match self {
                    #(
                        #ident::#variants_idents #variants_fields_capture => #variants_formatting,
                    )*
                }
            }
        }
        Data::Struct(DataStruct { fields, .. }) => {
            let (captures, formatting) = format_fields(ident, fields);

            quote! {
                match self {
                    #ident #captures => #formatting
                }
            }
        }
        _ => {
            derive_input
                .span()
                .unwrap()
                .error("unsupported syntax")
                .emit();

            return quote! {}.into();
        }
    };

    let value_debug_format_ident = get_value_debug_format_ident(ident);

    quote! {
        impl #ident {
            #[doc(hidden)]
            #[allow(non_snake_case)]
            async fn #value_debug_format_ident(&self) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
                use turbo_tasks::debug::internal::*;
                use turbo_tasks::debug::ValueDebugFormat;
                Ok(turbo_tasks::debug::ValueDebugStringVc::new(format!("{:#?}", #formatting_logic)))
            }
        }

        impl turbo_tasks::debug::ValueDebugFormat for #ident {
            fn value_debug_format<'a>(&'a self) -> turbo_tasks::debug::ValueDebugFormatString<'a> {
                turbo_tasks::debug::ValueDebugFormatString::Async(
                    Box::pin(async move {
                        Ok(self.#value_debug_format_ident().await?.await?.to_string())
                    })
                )
            }
        }
    }
    .into()
}

/// Generates a match arm destructuring pattern for the given fields.
///
/// Returns both the capture pattern token stream and the name of the bound
/// identifiers corresponding to the input fields.
fn generate_destructuring<'a>(
    fields: impl Iterator<Item = &'a Field>,
) -> (proc_macro2::TokenStream, Vec<proc_macro2::TokenStream>) {
    let (captures, fields_idents): (Vec<_>, Vec<_>) = fields
        .enumerate()
        .filter(|(_i, field)| !ignore_field(field))
        .map(|(i, field)| match &field.ident {
            Some(ident) => (quote! { #ident }, quote! { #ident }),
            None => {
                let ident = Ident::new(&format!("field_{}", i), field.span());
                let index = syn::Index::from(i);
                (quote! { #index: #ident }, quote! { #ident })
            }
        })
        .unzip();
    (
        quote! {
            { #(#captures,)* .. }
        },
        fields_idents,
    )
}

/// Formats a struct or enum variant with named fields (e.g. `struct Foo {
/// bar: u32 }`, `Foo::Bar { baz: u32 }`).
fn format_named<'a>(
    ident: &'a Ident,
    fields: &'a FieldsNamed,
) -> (proc_macro2::TokenStream, proc_macro2::TokenStream) {
    let (captures, fields_idents) = generate_destructuring(fields.named.iter());
    (
        captures,
        quote! {
            FormattingStruct::new_named(
                stringify!(#ident),
                vec![#(
                    FormattingField::new(
                        stringify!(#fields_idents),
                        #fields_idents.value_debug_format().try_to_value_debug_string().await?.await?.to_string(),
                    ),
                )*],
            )
        },
    )
}

/// Formats a struct or enum variant with unnamed fields (e.g. `struct
/// Foo(u32)`, `Foo::Bar(u32)`).
fn format_unnamed(
    ident: &Ident,
    fields: &FieldsUnnamed,
) -> (proc_macro2::TokenStream, proc_macro2::TokenStream) {
    let (captures, fields_idents) = generate_destructuring(fields.unnamed.iter());
    (
        captures,
        quote! {
            FormattingStruct::new_unnamed(
                stringify!(#ident),
                vec![#(
                    #fields_idents.value_debug_format().try_to_value_debug_string().await?.await?.to_string(),
                )*],
            )
        },
    )
}

/// Formats a unit struct or enum variant (e.g. `struct Foo;`, `Foo::Bar`).
fn format_unit(ident: &Ident) -> (proc_macro2::TokenStream, proc_macro2::TokenStream) {
    (
        quote! {},
        quote! {
            FormattingStruct::new_unnamed(
                stringify!(#ident),
                vec![],
            )
        },
    )
}

/// Formats the fields of any structure or enum variant.
fn format_fields(
    ident: &Ident,
    fields: &Fields,
) -> (proc_macro2::TokenStream, proc_macro2::TokenStream) {
    match fields {
        Fields::Named(named) => format_named(ident, named),
        Fields::Unnamed(unnamed) => format_unnamed(ident, unnamed),
        Fields::Unit => format_unit(ident),
    }
}

pub(crate) fn get_value_debug_format_ident(ident: &Ident) -> Ident {
    Ident::new(&format!("__value_debug_format_{}", ident), ident.span())
}
