#![feature(proc_macro_diagnostic)]

extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal};
use quote::quote;
use syn::{
    parse_macro_input, spanned::Spanned, Attribute, Block, Fields, FieldsNamed, ImplItem,
    ImplItemMethod, ItemFn, ItemImpl, ItemStruct, Path, PathArguments, PathSegment, Type, TypePath,
};

fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Ref"), ident.span())
}

fn get_node_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_NODE_TYPE"),
        ident.span(),
    )
}

#[proc_macro_attribute]
pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);

    if let ItemStruct {
        attrs,
        vis,
        generics,
        ident,
        semi_token: _,
        struct_token: _,
        fields: Fields::Named(fields),
    } = item.clone()
    {
        let ref_ident = get_ref_ident(&ident);
        let node_type_ident = get_node_type_ident(&ident);
        let name_literal = Literal::string(&ident.to_string());
        let expanded = quote! {
            #item

            #vis struct #ref_ident {
                // node: std::sync::Arc<turbo_tasks::macro_helpers::Node>,
            }

            lazy_static::lazy_static! {
                static ref #node_type_ident: turbo_tasks::NodeType =
                turbo_tasks::NodeType::new(#name_literal.to_string(), turbo_tasks::NodeReuseMode::GlobalInterning);
            }
        };

        return expanded.into();
    }
    item.span().unwrap().error("unsupported syntax").emit();

    quote! {
        #item
    }
    .into()
}

fn is_constructor(attr: &Attribute) -> bool {
    let path = &attr.path;
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident.to_string() == "turbo_tasks" => {
            match iter.next() {
                Some(seg) if seg.arguments.is_empty() && seg.ident.to_string() == "constructor" => {
                    iter.next().is_none()
                }
                _ => false,
            }
        }
        _ => false,
    }
}

#[proc_macro_attribute]
pub fn value_impl(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemImpl);

    if let Type::Path(TypePath {
        qself: None,
        path: Path { segments, .. },
    }) = &*item.self_ty
    {
        if segments.len() == 1 {
            if let Some(PathSegment {
                arguments: PathArguments::None,
                ident,
            }) = segments.first()
            {
                let ref_ident = get_ref_ident(&ident);
                let node_type_ident = get_node_type_ident(&ident);
                let mut constructors = Vec::new();
                for item in item.items.iter() {
                    match item {
                        ImplItem::Method(ImplItemMethod {
                            attrs,
                            vis,
                            defaultness,
                            sig,
                            block,
                        }) => {
                            if let Some(attr) = attrs.iter().find(|attr| is_constructor(attr)) {
                                let inputs = &sig.inputs;
                                constructors.push(quote! {
                                    #(#attrs)*
                                    #vis #defaultness #sig {
                                        Self {  }
                                    }
                                });
                            }
                        }
                        _ => {}
                    };
                }

                return quote! {
                    #item

                    impl #ref_ident {
                        #(#constructors)*
                    }
                }
                .into();
            }
        }
    }
    item.span().unwrap().error("unsupported syntax").emit();
    quote! {
        #item
    }
    .into()
}

#[proc_macro_attribute]
pub fn constructor(args: TokenStream, input: TokenStream) -> TokenStream {
    input
}
