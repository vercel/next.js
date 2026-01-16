use proc_macro::TokenStream;
use quote::quote;
use syn::{Ident, ItemEnum, parse_macro_input};

pub fn derive_key_value_pair(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as ItemEnum);

    let ident = &input.ident;
    let vis = &input.vis;
    let type_name = Ident::new(&format!("{}Type", input.ident), input.ident.span());
    let key_name = Ident::new(&format!("{}Key", input.ident), input.ident.span());
    let value_name = Ident::new(&format!("{}Value", input.ident), input.ident.span());
    let value_ref_name = Ident::new(&format!("{}ValueRef", input.ident), input.ident.span());
    let value_ref_mut_name = Ident::new(&format!("{}ValueRefMut", input.ident), input.ident.span());

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

    let value_ref_decl = ref_field_declarations(&value_fields);
    let value_ref_mut_decl = mut_ref_field_declarations(&value_fields);
    let value_ref_fields = ref_fields(&value_fields);

    quote! {
        #[automatically_derived]
        impl turbo_tasks::KeyValuePair for #ident {
            type Type = #type_name;
            type Key = #key_name;
            type Value = #value_name;
            type ValueRef<'l> = #value_ref_name<'l> where Self: 'l;
            type ValueRefMut<'l> = #value_ref_mut_name<'l> where Self: 'l;

            fn ty(&self) -> #type_name {
                match self {
                    #(
                        #ident::#variant_names { .. } => #type_name::#variant_names,
                    )*
                }
            }

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

            fn value_ref(&self) -> #value_ref_name<'_> {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_ref_name::#variant_names { #value_ref_fields },
                    )*
                }
            }

            fn value_mut(&mut self) -> #value_ref_mut_name<'_> {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_ref_mut_name::#variant_names { #value_ref_fields },
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

            fn from_key_and_value_ref(key: #key_name, value_ref: #value_ref_name) -> Self {
                match (key, value_ref) {
                    #(
                        (#key_name::#variant_names { #key_pat }, #value_ref_name::#variant_names { #value_pat }) => #ident::#variant_names { #key_pat #value_clone_fields },
                    )*
                    _ => panic!("Invalid key and value combination"),
                }
            }

            fn into_key_and_value(self) -> (#key_name, #value_name) {
                match self {
                    #(
                        #ident::#variant_names { #key_pat #value_pat } => (#key_name::#variant_names { #key_pat }, #value_name::#variant_names { #value_pat }),
                    )*
                }
            }
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        #vis enum #type_name {
            #(
                #variant_names,
            )*
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        #vis enum #key_name {
            #(
                #variant_names {
                    #key_decl
                },
            )*
        }

        #[derive(Debug, Clone, Default, PartialEq, Eq)]
        #vis enum #value_name {
            #(
                #variant_names {
                    #value_decl
                },
            )*
            #[default]
            Reserved,
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq)]
        #vis enum #value_ref_name<'l> {
            #(
                #variant_names {
                    #value_ref_decl
                },
            )*
        }

        #[derive(Debug, PartialEq, Eq)]
        #vis enum #value_ref_mut_name<'l> {
            #(
                #variant_names {
                    #value_ref_mut_decl
                },
            )*
        }

        #[automatically_derived]
        impl #key_name {
            pub fn ty(&self) -> #type_name {
                match self {
                    #(
                        #key_name::#variant_names { .. } => #type_name::#variant_names,
                    )*
                }
            }
        }

        #[automatically_derived]
        impl #value_name {
            pub fn as_ref(&self) -> #value_ref_name<'_> {
                match self {
                    #(
                        #value_name::#variant_names { #value_pat .. } => #value_ref_name::#variant_names { #value_ref_fields },
                    )*
                    #value_name::Reserved => unreachable!(),
                }
            }

            pub fn as_mut(&mut self) -> #value_ref_mut_name<'_> {
                match self {
                    #(
                        #value_name::#variant_names { #value_pat .. } => #value_ref_mut_name::#variant_names { #value_ref_fields },
                    )*
                    #value_name::Reserved => unreachable!(),
                }
            }
        }

    }
    .into()
}

fn patterns(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
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
        .collect::<Vec<_>>()
}

fn clone_fields(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
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
        .collect::<Vec<_>>()
}

fn ref_fields(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
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
        .collect::<Vec<_>>()
}

fn field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    // we don't preserve attrs here because we don't copy over the derives, so the
                    // attributes are likely irrelevant to the generated type
                    quote! {
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

fn ref_field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    // don't preserve attrs because we don't copy over the derives either
                    quote! {
                        #ident: &'l #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}

fn mut_ref_field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    // don't preserve attrs because we don't copy over the derives either
                    quote! {
                        #ident: &'l mut #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}
