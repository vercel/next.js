use either::Either;
use proc_macro2::{Span, TokenStream};
use quote::{quote, quote_spanned};
use syn::{spanned::Spanned, Data, Field, Generics, Ident, Path};

/// Generates tokens for a [`syn::ItemConst`] that asserts every field on the struct, enum, or union
/// (represented by [`Data`]) is an instance of `trait_path`.
///
/// A filter function can be passed to filter out fields, such as those with certain
/// [`Attribute`][syn::Attribute]s.
///
/// This uses a technique based on the trick used by
/// [`static_assertions::assert_impl_all`][assert_impl_all], but extended to support generics.
///
/// [assert_impl_all]: https://docs.rs/static_assertions/latest/static_assertions/macro.assert_impl_all.html
pub fn assert_fields_impl_trait(
    trait_path: &Path,
    generics: &Generics,
    data: &Data,
    mut filter_field: impl FnMut(&Field) -> bool,
) -> TokenStream {
    let (impl_generics, ty_generics, where_clause) = generics.split_for_impl();
    let field_types = iter_data_fields(data).map(|field| &field.ty);

    // generate internal identifiers (shown in error messages) from the trait name
    let trait_name = trait_path.segments.last().unwrap().ident.to_string();
    let assertion_struct_ident =
        Ident::new(&format!("Derive{trait_name}Assertion"), Span::mixed_site());
    let assertion_fn_ident = Ident::new(&format!("assert_impl_{trait_name}"), Span::mixed_site());

    let assertion_calls = iter_data_fields(data)
        .filter(|field| filter_field(field))
        .map(|field| {
            let ty = &field.ty;
            quote_spanned! {
                // attribute type assertion errors to the line where the field is defined
                ty.span() =>
                // this call is only valid if ty is a NonLocalValue
                Self::#assertion_fn_ident::<#ty>();
            }
        });
    quote! {
        const _: fn() = || {
            // create this struct just to hold onto our generics...
            // we reproduce the field types here to ensure any generics get used
            struct #assertion_struct_ident #impl_generics (#(#field_types),*) #where_clause;

            impl #impl_generics #assertion_struct_ident #ty_generics #where_clause {
                fn #assertion_fn_ident<
                    Expected: #trait_path + ?Sized
                >() {}
                #[allow(non_snake_case)]
                fn field_types() {
                    #(#assertion_calls)*
                }
            }
        };
    }
}

fn iter_data_fields(data: &Data) -> impl Iterator<Item = &syn::Field> {
    match data {
        Data::Struct(ds) => Either::Left(ds.fields.iter()),
        Data::Enum(de) => Either::Right(Either::Left(de.variants.iter().flat_map(|v| &v.fields))),
        Data::Union(du) => Either::Right(Either::Right(du.fields.named.iter())),
    }
}
