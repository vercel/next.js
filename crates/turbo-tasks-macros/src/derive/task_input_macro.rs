use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal, TokenStream as TokenStream2};
use quote::quote;
use syn::{
    parse_macro_input, spanned::Spanned, Data, DataEnum, DataStruct, DeriveInput, FieldsNamed,
    FieldsUnnamed,
};
use turbo_tasks_macros_shared::{expand_fields, generate_exhaustive_destructuring};

pub fn derive_task_input(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let generics = &derive_input.generics;

    if let Some(where_clause) = &generics.where_clause {
        // NOTE(alexkirsz) We could support where clauses and generic parameters bounds
        // in the future, but for simplicity's sake, we don't support them yet.
        where_clause
            .span()
            .unwrap()
            .error("the TaskInput derive macro does not support where clauses yet")
            .emit();
    }

    for param in &generics.params {
        match param {
            syn::GenericParam::Type(param) => {
                if !param.bounds.is_empty() {
                    // NOTE(alexkirsz) See where clause above.
                    param
                        .span()
                        .unwrap()
                        .error(
                            "the TaskInput derive macro does not support generic parameters \
                             bounds yet",
                        )
                        .emit();
                }
            }
            syn::GenericParam::Lifetime(param) => {
                param
                    .span()
                    .unwrap()
                    .error("the TaskInput derive macro does not support generic lifetimes")
                    .emit();
            }
            syn::GenericParam::Const(param) => {
                // NOTE(alexkirsz) Ditto: not supported yet for simplicity's sake.
                param
                    .span()
                    .unwrap()
                    .error("the TaskInput derive macro does not support const generics yet")
                    .emit();
            }
        }
    }

    let inputs_list_ident = Ident::new(
        &format!("__{}_inputs_list", ident),
        derive_input.ident.span(),
    );

    let expand_named = |ident, fields| expand_named(ident, fields, &inputs_list_ident);
    let expand_unnamed = |ident, fields| expand_unnamed(ident, fields, &inputs_list_ident);

    let (try_from_impl, from_impl) = match &derive_input.data {
        Data::Enum(DataEnum { variants, .. }) => {
            let mut variants_idents = vec![];
            let mut variants_fields_len = vec![];
            let mut variants_fields_destructuring = vec![];
            let mut variants_try_from_expansion = vec![];
            let mut variants_from_expansion = vec![];

            for variant in variants {
                let variant_ident = &variant.ident;
                let (fields_destructuring, try_from_expansion, from_expansion) = expand_fields(
                    &variant.ident,
                    &variant.fields,
                    expand_named,
                    expand_unnamed,
                    expand_unit,
                );
                variants_idents.push(variant_ident);
                variants_fields_len.push(variant.fields.len());
                variants_fields_destructuring.push(fields_destructuring);
                variants_try_from_expansion.push(try_from_expansion);
                variants_from_expansion.push(from_expansion);
            }

            // This is similar to what Rust does for enums (configurable via the `repr`
            // attribute). We use the smallest possible integer type that can
            // represent all the variants. However, for now, this is not
            // configurable for TaskInput enums.
            let repr_bits = usize::BITS - variants.len().leading_zeros();
            let repr = match repr_bits {
                0..=8 => quote! { u8 },
                9..=16 => quote! { u16 },
                17..=32 => quote! { u32 },
                33..=64 => quote! { u64 },
                _ => panic!("too many variants"),
            };

            let variants_discriminants: Vec<_> = (0..variants_idents.len())
                .map(Literal::usize_unsuffixed)
                .collect();

            (
                quote! {
                    match value {
                        turbo_tasks::ConcreteTaskInput::List(value) => {
                            let mut #inputs_list_ident = value.iter();

                            let discriminant = #inputs_list_ident.next().ok_or_else(|| anyhow::anyhow!(concat!("missing discriminant for ", stringify!(#ident))))?;
                            let discriminant: #repr = turbo_tasks::TaskInput::try_from_concrete(discriminant)?;

                            Ok(match discriminant {
                                #(
                                    #variants_discriminants => {
                                        #variants_try_from_expansion
                                        #ident::#variants_idents #variants_fields_destructuring
                                    },
                                )*
                                _ => return Err(anyhow::anyhow!("invalid discriminant for {}", stringify!(#ident))),
                            })
                        },
                        _ => Err(anyhow::anyhow!("invalid task input type, expected list (enum)")),
                    }
                },
                quote! {
                    match self {
                        #(
                            #ident::#variants_idents #variants_fields_destructuring => {
                                let mut #inputs_list_ident = Vec::with_capacity(1 + #variants_fields_len);
                                let discriminant: #repr = #variants_discriminants;
                                let discriminant = discriminant.into_concrete();
                                #inputs_list_ident.push(discriminant);
                                #variants_from_expansion
                                turbo_tasks::ConcreteTaskInput::List(#inputs_list_ident)
                            }
                        )*
                    }
                },
            )
        }
        Data::Struct(DataStruct { fields, .. }) => {
            let (destructuring, try_from_expansion, from_expansion) =
                expand_fields(ident, fields, expand_named, expand_unnamed, expand_unit);
            let fields_len = fields.len();

            (
                quote! {
                    match value {
                        turbo_tasks::ConcreteTaskInput::List(value) => {
                            let mut #inputs_list_ident = value.iter();
                            #try_from_expansion
                            Ok(#ident #destructuring)
                        },
                        _ => Err(anyhow::anyhow!("invalid task input type, expected list (struct)")),
                    }
                },
                quote! {
                    let mut #inputs_list_ident = Vec::with_capacity(#fields_len);
                    let #ident #destructuring = self;
                    #from_expansion
                    turbo_tasks::ConcreteTaskInput::List(#inputs_list_ident)
                },
            )
        }
        _ => {
            derive_input
                .span()
                .unwrap()
                .error("unsupported syntax")
                .emit();

            (quote! {}, quote! {})
        }
    };

    let generic_params: Vec<_> = generics
        .params
        .iter()
        .filter_map(|param| match param {
            syn::GenericParam::Type(param) => Some(param),
            _ => {
                // We already report an error for this above.
                None
            }
        })
        .collect();

    quote! {
        impl #generics turbo_tasks::TaskInput for #ident #generics
        where
            #(#generic_params: turbo_tasks::TaskInput,)*
        {
            #[allow(non_snake_case)]
            #[allow(unreachable_code)] // This can occur for enums with no variants.
            fn try_from_concrete(value: &turbo_tasks::ConcreteTaskInput) -> turbo_tasks::Result<Self> {
                #try_from_impl
            }

            #[allow(non_snake_case)]
            #[allow(unreachable_code)] // This can occur for enums with no variants.
            fn into_concrete(self) -> turbo_tasks::ConcreteTaskInput {
                #from_impl
            }
        }
    }
    .into()
}

fn expand_named(
    _ident: &Ident,
    fields: &FieldsNamed,
    inputs_list_ident: &Ident,
) -> (TokenStream2, TokenStream2, TokenStream2) {
    let (destructuring, fields_idents) = generate_exhaustive_destructuring(fields.named.iter());
    (
        destructuring,
        quote! {
            #(
                let #fields_idents = #inputs_list_ident.next().ok_or_else(|| anyhow::anyhow!(concat!("missing element for ", stringify!(#fields_idents))))?;
                let #fields_idents = turbo_tasks::TaskInput::try_from_concrete(#fields_idents)?;
            )*
        },
        quote! {
            #(
                let #fields_idents = #fields_idents.into_concrete();
                #inputs_list_ident.push(#fields_idents);
            )*
        },
    )
}

fn expand_unnamed(
    _ident: &Ident,
    fields: &FieldsUnnamed,
    inputs_list_ident: &Ident,
) -> (TokenStream2, TokenStream2, TokenStream2) {
    let (destructuring, fields_idents) = generate_exhaustive_destructuring(fields.unnamed.iter());
    (
        destructuring,
        quote! {
            #(
                let #fields_idents = #inputs_list_ident.next().ok_or_else(|| anyhow::anyhow!(concat!("missing element for ", stringify!(#fields_idents))))?;
                let #fields_idents = turbo_tasks::TaskInput::try_from_concrete(#fields_idents)?;
            )*
        },
        quote! {
            #(
                let #fields_idents = #fields_idents.into_concrete();
                #inputs_list_ident.push(#fields_idents);
            )*
        },
    )
}

fn expand_unit(_ident: &Ident) -> (TokenStream2, TokenStream2, TokenStream2) {
    (quote! {}, quote! {}, quote! {})
}
