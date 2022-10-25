use proc_macro2::{Ident, TokenStream};
use quote::quote;
use syn::{
    spanned::Spanned, Data, DataEnum, DataStruct, DeriveInput, Field, Fields, FieldsNamed,
    FieldsUnnamed,
};

/// Handles the expansion of a struct/enum into a match statement that accesses
/// every field for procedural code generation.
///
/// Requires several Fn helpers which perform expand different structures:
///
/// - [expand_named] handles the expansion of a struct or enum variant with
/// named fields (e.g. `struct Foo { bar: u32 }`, `Foo::Bar { baz: u32 }`).
/// - [expand_unnamed] handles the expansion of a struct or enum variant with
/// unnamed fields (e.g. `struct Foo(u32)`, `Foo::Bar(u32)`).
/// - [expand_unit] handles the expansion of a unit struct or enum (e.g.
/// `struct Foo;`, `Foo::Bar`).
///
/// These helpers should themselves call [generate_destructuring] to generate
/// the destructure necessary to access the fields of the value.
pub fn match_expansion<
    EN: Fn(&Ident, &FieldsNamed) -> (TokenStream, TokenStream),
    EU: Fn(&Ident, &FieldsUnnamed) -> (TokenStream, TokenStream),
    U: Fn(&Ident) -> (TokenStream, TokenStream),
>(
    derive_input: &DeriveInput,
    expand_named: &EN,
    expand_unnamed: &EU,
    expand_unit: &U,
) -> TokenStream {
    let ident = &derive_input.ident;
    match &derive_input.data {
        Data::Enum(DataEnum { variants, .. }) => {
            let (variants_idents, (variants_fields_capture, expansion)): (
                Vec<_>,
                (Vec<_>, Vec<_>),
            ) = variants
                .iter()
                .map(|variant| {
                    (
                        &variant.ident,
                        expand_fields(
                            &variant.ident,
                            &variant.fields,
                            expand_named,
                            expand_unnamed,
                            expand_unit,
                        ),
                    )
                })
                .unzip();

            quote! {
                match self {
                    #(
                        #ident::#variants_idents #variants_fields_capture => #expansion,
                    )*
                }
            }
        }
        Data::Struct(DataStruct { fields, .. }) => {
            let (captures, expansion) =
                expand_fields(ident, fields, expand_named, expand_unnamed, expand_unit);

            quote! {
                match self {
                    #ident #captures => #expansion
                }
            }
        }
        _ => {
            derive_input
                .span()
                .unwrap()
                .error("unsupported syntax")
                .emit();

            quote! {}
        }
    }
}

/// Formats the fields of any structure or enum variant.
fn expand_fields<
    EN: Fn(&Ident, &FieldsNamed) -> (TokenStream, TokenStream),
    EU: Fn(&Ident, &FieldsUnnamed) -> (TokenStream, TokenStream),
    U: Fn(&Ident) -> (TokenStream, TokenStream),
>(
    ident: &Ident,
    fields: &Fields,
    expand_named: &EN,
    expand_unnamed: &EU,
    expand_unit: &U,
) -> (TokenStream, TokenStream) {
    match fields {
        Fields::Named(named) => expand_named(ident, named),
        Fields::Unnamed(unnamed) => expand_unnamed(ident, unnamed),
        Fields::Unit => expand_unit(ident),
    }
}

/// Generates a match arm destructuring pattern for the given fields.
///
/// Returns both the capture pattern token stream and the name of the bound
/// identifiers corresponding to the input fields.
pub fn generate_destructuring<'a, I: Fn(&Field) -> bool>(
    fields: impl Iterator<Item = &'a Field>,
    ignore_field: &I,
) -> (TokenStream, Vec<TokenStream>) {
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
