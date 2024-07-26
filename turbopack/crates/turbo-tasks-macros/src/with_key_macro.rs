use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Ident, ItemEnum};

pub fn with_key(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as ItemEnum);

    let attrs = &input.attrs;
    let ident = &input.ident;
    let vis = &input.vis;
    let key_name = Ident::new(&format!("{}Key", input.ident), input.ident.span());
    let value_name = Ident::new(&format!("{}Value", input.ident), input.ident.span());

    let variant_names = input
        .variants
        .iter()
        .map(|variant| &variant.ident)
        .collect::<Vec<_>>();

    let key_fields = input
        .variants
        .iter()
        .map(|variant| {
            variant
                .fields
                .iter()
                .filter(|field| {
                    let Some(ident) = &field.ident else {
                        return false;
                    };
                    ident != "value"
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let value_fields = input
        .variants
        .iter()
        .map(|variant| {
            variant
                .fields
                .iter()
                .filter(|field| {
                    let Some(ident) = &field.ident else {
                        return false;
                    };
                    ident == "value"
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let key_decl = field_declarations(&key_fields);
    let key_pat = patterns(&key_fields);
    let key_clone_fields = clone_fields(&key_fields);

    let value_decl = field_declarations(&value_fields);
    let value_pat = patterns(&value_fields);
    let value_clone_fields = clone_fields(&value_fields);

    quote! {
        #input

        impl turbo_tasks::Keyed for #ident {
            type Key = #key_name;
            type Value = #value_name;

            fn key(&self) -> #key_name {
                match self {
                    #(
                        #ident::#variant_names { #key_pat .. } => #key_name::#variant_names { #key_clone_fields },
                    )*
                }
            }

            fn value(&self) -> #value_name {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_name::#variant_names { #value_clone_fields },
                    )*
                }
            }

            fn from_key_and_value(key: #key_name, value: #value_name) -> Self {
                match (key, value) {
                    #(
                        (#key_name::#variant_names { #key_pat }, #value_name::#variant_names { #value_pat }) => #ident::#variant_names { #key_pat #value_pat },
                    )*
                    _ => panic!("Invalid key and value combination"),
                }
            }
        }

        #(#attrs)*
        #vis enum #key_name {
            #(
                #variant_names {
                    #key_decl
                },
            )*
        }

        #(#attrs)*
        #vis enum #value_name {
            #(
                #variant_names {
                    #value_decl
                },
            )*
        }
    }
    .into()
}

fn patterns(fields: &Vec<Vec<&syn::Field>>) -> Vec<proc_macro2::TokenStream> {
    let variant_pat = fields
        .iter()
        .map(|fields| {
            let pat = fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#pat,)*
            }
        })
        .collect::<Vec<_>>();
    variant_pat
}

fn clone_fields(fields: &Vec<Vec<&syn::Field>>) -> Vec<proc_macro2::TokenStream> {
    let variant_pat = fields
        .iter()
        .map(|fields| {
            let pat = fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident: #ident.clone()
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#pat,)*
            }
        })
        .collect::<Vec<_>>();
    variant_pat
}

fn field_declarations(fields: &Vec<Vec<&syn::Field>>) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    let attrs = &field.attrs;
                    quote! {
                        #(#attrs)*
                        #ident: #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}
