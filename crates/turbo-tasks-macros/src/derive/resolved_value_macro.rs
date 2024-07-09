use either::Either;
use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::{quote, quote_spanned};
use syn::{parse_macro_input, spanned::Spanned, Data, DeriveInput, Generics};

pub fn derive_resolved_value(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;

    let assertions = assert_fields_impl_resolved_value(&derive_input.generics, &derive_input.data);

    let (impl_generics, ty_generics, where_clause) = derive_input.generics.split_for_impl();
    quote! {
        unsafe impl #impl_generics ::turbo_tasks::ResolvedValue
            for #ident #ty_generics #where_clause {}
        #assertions
    }
    .into()
}

fn iter_data_fields(data: &Data) -> impl Iterator<Item = &syn::Field> {
    match data {
        Data::Struct(ds) => Either::Left(ds.fields.iter()),
        Data::Enum(de) => Either::Right(Either::Left(de.variants.iter().flat_map(|v| &v.fields))),
        Data::Union(du) => Either::Right(Either::Right(du.fields.named.iter())),
    }
}

fn assert_fields_impl_resolved_value(generics: &Generics, data: &Data) -> TokenStream2 {
    // this technique is based on the trick used by
    // `static_assertions::assert_impl_all`, but extended to support generics.
    let (impl_generics, ty_generics, where_clause) = generics.split_for_impl();
    let field_types: Vec<_> = iter_data_fields(data).map(|field| &field.ty).collect();
    let assertion_calls = field_types.iter().map(|ty| {
        quote_spanned! {
            // attribute type assertion errors to the line where the field is defined
            ty.span() =>
            // this call is only valid if ty is a ResolvedValue
            Self::assert_impl_resolved_value::<#ty>();
        }
    });
    quote! {
        const _: fn() = || {
            // create this struct just to hold onto our generics...
            // we reproduce the field types here to ensure any generics get used
            struct DeriveResolvedValueAssertion #impl_generics (#(#field_types),*) #where_clause;

            impl #impl_generics DeriveResolvedValueAssertion #ty_generics #where_clause {
                fn assert_impl_resolved_value<ExpectedResolvedValue: ResolvedValue + ?Sized>() {}
                fn field_types() {
                    #(#assertion_calls)*
                }
            }
        };
    }
}
