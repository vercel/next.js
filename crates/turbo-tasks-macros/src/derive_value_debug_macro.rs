use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{
    parse_macro_input, spanned::Spanned, Field, Fields, FieldsNamed, FieldsUnnamed, Item, ItemEnum,
    ItemStruct,
};

/// This macro generates the implementation of the `ValueDebug` trait for a
/// given type.
///
/// Fields annotated with `#[debug_ignore]` will not appear in the
/// `ValueDebug` representation of the type.
pub fn derive_value_debug(input: TokenStream) -> TokenStream {
    fn ignore_field(field: &Field) -> bool {
        field
            .attrs
            .iter()
            .any(|attr| attr.path.is_ident("debug_ignore"))
    }

    let item = parse_macro_input!(input as Item);

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

    let (ident, formatting_logic) = match &item {
        Item::Enum(ItemEnum {
            ident, variants, ..
        }) => {
            let variants_idents = variants
                .iter()
                .map(|variant| &variant.ident)
                .collect::<Vec<_>>();
            let (variants_fields_capture, variants_formatting): (Vec<_>, Vec<_>) = variants
                .iter()
                .map(|variant| format_fields(&variant.ident, &variant.fields))
                .unzip();
            (
                ident,
                quote! {
                    match this {
                        #(
                            #ident::#variants_idents #variants_fields_capture => #variants_formatting,
                        )*
                    }
                },
            )
        }
        Item::Struct(ItemStruct { ident, fields, .. }) => {
            let (captures, formatting) = format_fields(ident, fields);
            (
                ident,
                quote! {
                    match this {
                        #ident #captures => #formatting
                    }
                },
            )
        }
        _ => {
            item.span().unwrap().error("unsupported syntax").emit();

            return quote! {
                #item
            }
            .into();
        }
    };

    let value_debug_format_ident =
        Ident::new(&format!("__value_debug_format_{}", ident), ident.span());

    quote! {
        #[doc(hidden)]
        #[allow(non_snake_case)]
        async fn #value_debug_format_ident(this: &#ident) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
            use turbo_tasks::debug::internal::*;
            Ok(turbo_tasks::debug::ValueDebugStringVc::new(format!("{:#?}", #formatting_logic)))
        }

        impl turbo_tasks::debug::internal::ValueDebugFormat for #ident {
            fn value_debug_format<'a>(&'a self) -> turbo_tasks::debug::internal::ValueDebugFormatString<'a> {
                turbo_tasks::debug::internal::ValueDebugFormatString::Async(
                    Box::pin(async move {
                        Ok(#value_debug_format_ident(self).await?.await?.to_string())
                    })
                )
            }
        }

        #[turbo_tasks::value_impl]
        impl turbo_tasks::debug::ValueDebug for #ident {
            #[turbo_tasks::function]
            async fn dbg(&self) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
                #value_debug_format_ident(self).await
            }
        }
    }
    .into()
}
