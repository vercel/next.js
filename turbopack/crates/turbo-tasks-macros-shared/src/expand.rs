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
/// - [expand_named] handles the expansion of a struct or enum variant with named fields (e.g.
///   `struct Foo { bar: u32 }`, `Foo::Bar { baz: u32 }`).
/// - [expand_unnamed] handles the expansion of a struct or enum variant with unnamed fields (e.g.
///   `struct Foo(u32)`, `Foo::Bar(u32)`).
/// - [expand_unit] handles the expansion of a unit struct or enum (e.g. `struct Foo;`, `Foo::Bar`).
///
/// These helpers should themselves call [generate_destructuring] to generate
/// the destructure necessary to access the fields of the value.
pub fn match_expansion<
    EN: Fn(TokenStream, &FieldsNamed) -> (TokenStream, TokenStream),
    EU: Fn(TokenStream, &FieldsUnnamed) -> (TokenStream, TokenStream),
    U: Fn(TokenStream) -> TokenStream,
>(
    derive_input: &DeriveInput,
    expand_named: &EN,
    expand_unnamed: &EU,
    expand_unit: &U,
) -> TokenStream {
    let ident = &derive_input.ident;
    let expand_unit = move |ident| (TokenStream::new(), expand_unit(ident));
    match &derive_input.data {
        Data::Enum(DataEnum { variants, .. }) => {
            let (idents, (variants_fields_capture, expansion)): (Vec<_>, (Vec<_>, Vec<_>)) =
                variants
                    .iter()
                    .map(|variant| {
                        let variants_idents = &variant.ident;
                        let ident = quote! { #ident::#variants_idents };
                        (
                            ident.clone(),
                            expand_fields(
                                ident,
                                &variant.fields,
                                expand_named,
                                expand_unnamed,
                                expand_unit,
                            ),
                        )
                    })
                    .unzip();

            if idents.is_empty() {
                let (_, expansion) = expand_unit(quote! { #ident });
                quote! {
                    #expansion
                }
            } else {
                quote! {
                    match self {
                        #(
                            #idents #variants_fields_capture => #expansion,
                        )*
                    }
                }
            }
        }
        Data::Struct(DataStruct { fields, .. }) => {
            let (captures, expansion) = expand_fields(
                quote! { #ident },
                fields,
                expand_named,
                expand_unnamed,
                expand_unit,
            );

            if fields.is_empty() {
                assert!(captures.is_empty());
                // a match expression here doesn't make sense as there's no fields to capture,
                // just pass through the inner expression.
                expansion
            } else {
                match fields {
                    Fields::Named(_) | Fields::Unnamed(_) => quote! {
                        match self {
                            #ident #captures => #expansion
                        }
                    },
                    Fields::Unit => unreachable!(),
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
///
/// Empty lists of named or unnamed fields are treated as unit structs, as they
/// are semantically identical, and the `expand_unit` codepath can usually
/// generate better code.
pub fn expand_fields<
    'ident,
    'fields,
    EN: Fn(TokenStream, &'fields FieldsNamed) -> R,
    EU: Fn(TokenStream, &'fields FieldsUnnamed) -> R,
    U: Fn(TokenStream) -> R,
    R,
>(
    ident: TokenStream,
    fields: &'fields Fields,
    expand_named: EN,
    expand_unnamed: EU,
    expand_unit: U,
) -> R {
    if fields.is_empty() {
        // any empty struct (regardless of the syntax used during declaration) is
        // equivalent to a unit struct
        return expand_unit(ident);
    }
    match fields {
        Fields::Named(named) => expand_named(ident, named),
        Fields::Unnamed(unnamed) => expand_unnamed(ident, unnamed),
        Fields::Unit => unreachable!(),
    }
}

/// Generates a match arm destructuring pattern for the given fields.
///
/// If no `filter_field` function is provided, all fields are included in the
/// pattern. If a `filter_field` function is provided, only fields for which
/// the function returns `true` are included in the pattern. If any field is
/// ignored, a wildcard pattern is added to the end of the pattern, making it
/// non-exhaustive.
///
/// Returns both the capture pattern token stream and the name of the bound
/// identifiers corresponding to the input fields.
pub fn generate_destructuring<'a, I: Fn(&Field) -> bool>(
    fields: impl ExactSizeIterator<Item = &'a Field>,
    filter_field: &I,
) -> (TokenStream, Vec<TokenStream>) {
    let fields_len = fields.len();
    let (captures, fields_idents): (Vec<_>, Vec<_>) = fields
        // We need to enumerate first to capture the indexes of the fields before filtering has
        // changed them.
        .enumerate()
        .filter(|(_i, field)| filter_field(field))
        .map(|(i, field)| match &field.ident {
            Some(ident) => (quote! { #ident }, quote! { #ident }),
            None => {
                let ident = Ident::new(&format!("field_{}", i), field.span());
                let index = syn::Index::from(i);
                (quote! { #index: #ident }, quote! { #ident })
            }
        })
        .unzip();
    // Only add the wildcard pattern if we're ignoring some fields.
    let wildcard = if fields_idents.len() != fields_len {
        quote! { .. }
    } else {
        quote! {}
    };
    (
        quote! {
            { #(#captures,)* #wildcard }
        },
        fields_idents,
    )
}

/// Generates an exhaustive match arm destructuring pattern for the given
/// fields. This is equivalent to calling [`generate_destructuring`] with a
/// `filter_field` function that always returns `true`.
///
/// Returns both the capture pattern token stream and the name of the bound
/// identifiers corresponding to the input fields.
pub fn generate_exhaustive_destructuring<'a>(
    fields: impl ExactSizeIterator<Item = &'a Field>,
) -> (TokenStream, Vec<TokenStream>) {
    generate_destructuring(fields, &|_| true)
}
