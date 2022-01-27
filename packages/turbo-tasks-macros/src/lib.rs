#![feature(proc_macro_diagnostic)]

extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal};
use quote::quote;
use syn::{
    parenthesized,
    parse::{Parse, ParseStream},
    parse_macro_input, parse_quote,
    spanned::Spanned,
    Attribute, Error, Fields, FnArg, ImplItem, ImplItemMethod, ItemImpl, ItemStruct, Pat, PatIdent,
    PatType, Path, PathArguments, PathSegment, Result, Token, Type, TypePath,
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
pub fn value(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);

    if let ItemStruct {
        attrs: _,
        vis,
        generics: _,
        ident,
        semi_token: _,
        struct_token: _,
        fields: Fields::Named(_fields),
    } = item.clone()
    {
        let ref_ident = get_ref_ident(&ident);
        let node_type_ident = get_node_type_ident(&ident);
        let name_literal = Literal::string(&ident.to_string());
        let expanded = quote! {
            #item

            #[derive(Clone, Debug)]
            #vis struct #ref_ident {
                node: std::sync::Arc<turbo_tasks::macro_helpers::Node>,
            }

            lazy_static::lazy_static! {
                static ref #node_type_ident: turbo_tasks::NodeType =
                turbo_tasks::NodeType::new(#name_literal.to_string(), turbo_tasks::NodeReuseMode::GlobalInterning);
            }

            impl #ref_ident {
                pub fn from_node(node: std::sync::Arc<turbo_tasks::macro_helpers::Node>) -> Option<Self> {
                    if node.is_node_type(&#node_type_ident) {
                        Some(Self { node })
                    } else {
                        None
                    }
                }

                pub fn verify(node: &std::sync::Arc<turbo_tasks::macro_helpers::Node>) -> anyhow::Result<()> {
                    if node.is_node_type(&#node_type_ident) {
                        Ok(())
                    } else {
                        Err(anyhow::anyhow!(
                            "expected {:?} but got {:?}",
                            *#node_type_ident,
                            node.get_node_type()
                        ))
                    }
                }

                pub fn get(&self) -> std::sync::Arc<#ident> {
                    // unwrap is safe here since we ensure that it will be the correct node type
                    self.node.read::<#ident>().unwrap()
                }
            }

            impl From<#ref_ident> for std::sync::Arc<turbo_tasks::macro_helpers::Node> {
                fn from(node_ref: #ref_ident) -> Self {
                    node_ref.node
                }
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

#[derive(Eq, PartialEq)]
enum Allowance {
    Disabled,
    Auto,
    Enforced,
}

struct Constructor {
    intern: Allowance,
    previous: Allowance,
    update: Allowance,
    create: Allowance,
}

impl Parse for Constructor {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = Constructor {
            intern: Allowance::Auto,
            previous: Allowance::Auto,
            update: Allowance::Auto,
            create: Allowance::Auto,
        };
        if input.is_empty() {
            return Ok(result);
        }
        let content;
        parenthesized!(content in input);
        while !content.is_empty() {
            let not = content.peek(Token![!]);
            if not {
                content.parse::<Token![!]>()?;
            }
            let allowance = if not {
                Allowance::Disabled
            } else {
                Allowance::Enforced
            };
            let ident = content.parse::<Ident>()?;
            match ident.to_string().as_str() {
                "intern" => result.intern = allowance,
                "previous" => result.previous = allowance,
                "update" => result.update = allowance,
                "create" => result.create = allowance,
                _ => {
                    return Err(Error::new_spanned(
                        &ident,
                        format!(
                            "Invalid keyword {} in turbo_tasks::constructor",
                            &ident.to_string()
                        ),
                    ))
                }
            }
        }
        Ok(result)
    }
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
pub fn value_impl(_args: TokenStream, input: TokenStream) -> TokenStream {
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
                            block: _,
                        }) => {
                            if let Some(Attribute { tokens, .. }) =
                                attrs.iter().find(|attr| is_constructor(attr))
                            {
                                let constructor: Constructor = parse_quote! { #tokens };
                                // let constructor = Constructor {
                                //     intern: Allowance::Auto,
                                //     previous: Allowance::Auto,
                                //     update: Allowance::Auto,
                                //     create: Allowance::Auto,
                                // };
                                let fn_name = &sig.ident;
                                let inputs = &sig.inputs;
                                let mut input_names = Vec::new();
                                let mut inputs_for_intern_key = Vec::new();
                                for arg in inputs.iter() {
                                    if let FnArg::Typed(PatType { pat, ty, .. }) = arg {
                                        if let Pat::Ident(PatIdent { ident, .. }) = &**pat {
                                            input_names.push(ident.clone());
                                            inputs_for_intern_key.push(
                                                if let Type::Reference(_) = &**ty {
                                                    quote! { std::clone::Clone::clone(#ident) }
                                                } else {
                                                    quote! { std::clone::Clone::clone(&#ident) }
                                                },
                                            );
                                        } else {
                                            item.span()
                                                .unwrap()
                                                .error(format!(
                                                    "unsupported pattern syntax in {}: {}",
                                                    &ident.to_string(),
                                                    quote! { #pat }
                                                ))
                                                .emit();
                                        }
                                    }
                                }
                                let get_node = if constructor.create == Allowance::Disabled {
                                    quote! {
                                        panic!("Creating a new #ident node is not allowed");
                                    }
                                } else {
                                    quote! {
                                        std::sync::Arc::new(turbo_tasks::macro_helpers::Node::new(
                                            &#node_type_ident,
                                            std::sync::Arc::new(#ident::#fn_name(#(#input_names),*))
                                        ))
                                    }
                                };
                                // TODO handle previous and update
                                let get_node2 = quote! { #get_node };
                                let get_node3 = match constructor.intern {
                                    Allowance::Enforced => quote! {
                                        turbo_tasks::macro_helpers::new_node_intern::<#ident, _, _>(
                                            (#(#inputs_for_intern_key),*),
                                            || { #get_node2 }
                                        )
                                    },
                                    Allowance::Auto => quote! {
                                        turbo_tasks::macro_helpers::new_node_auto_intern::<#ident, _, _>(
                                            (#(#inputs_for_intern_key),*),
                                            || { #get_node2 }
                                        )
                                    },
                                    Allowance::Disabled => quote! { #get_node },
                                };
                                constructors.push(quote! {
                                    #(#attrs)*
                                    #vis #defaultness #sig {
                                        let node = #get_node3;
                                        Self {
                                            node
                                        }
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
pub fn constructor(_args: TokenStream, input: TokenStream) -> TokenStream {
    input
}
