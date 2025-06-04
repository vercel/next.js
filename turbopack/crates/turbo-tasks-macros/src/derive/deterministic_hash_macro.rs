use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{Data, DeriveInput, FieldsNamed, FieldsUnnamed, parse_macro_input};
use turbo_tasks_macros_shared::{generate_exhaustive_destructuring, match_expansion};

/// This macro generates the implementation of the `DeterministicHash` trait for
/// a given type.
///
/// This requires that every contained value also implement `DeterministicHash`.
pub fn derive_deterministic_hash(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);

    let ident = &derive_input.ident;
    let match_hash = match_expansion(&derive_input, &hash_named, &hash_unnamed, &hash_unit);
    let discriminant = match derive_input.data {
        Data::Enum(_) => {
            quote! {
                turbo_tasks_hash::DeterministicHash::deterministic_hash(&std::mem::discriminant(self), __state__);
            }
        }
        _ => quote! {},
    };

    quote! {
        impl turbo_tasks_hash::DeterministicHash for #ident {
            fn deterministic_hash<H: turbo_tasks_hash::DeterministicHasher>(&self, __state__: &mut H) {
                #discriminant
                #match_hash
            }
        }
    }
    .into()
}

/// Hashes a struct or enum variant with named fields (e.g. `struct Foo {
/// bar: u32 }`, `Foo::Bar { baz: u32 }`).
fn hash_named(_ident: TokenStream2, fields: &FieldsNamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_exhaustive_destructuring(fields.named.iter());
    (
        captures,
        quote! {
            {#(
                #fields_idents.deterministic_hash(__state__);
            )*}
        },
    )
}

/// Hashes a struct or enum variant with unnamed fields (e.g. `struct
/// Foo(u32)`, `Foo::Bar(u32)`).
fn hash_unnamed(_ident: TokenStream2, fields: &FieldsUnnamed) -> (TokenStream2, TokenStream2) {
    let (captures, fields_idents) = generate_exhaustive_destructuring(fields.unnamed.iter());
    (
        captures,
        quote! {
            {#(
                #fields_idents.deterministic_hash(__state__);
            )*}
        },
    )
}

/// Hashes a unit struct or enum variant (e.g. `struct Foo;`, `Foo::Bar`).
fn hash_unit(_ident: TokenStream2) -> TokenStream2 {
    quote! { { } }
}
