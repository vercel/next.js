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
    Attribute, Error, Fields, FnArg, ImplItem, ImplItemMethod, ItemFn, ItemImpl, ItemStruct, Pat,
    PatIdent, PatType, Path, PathArguments, PathSegment, Result, ReturnType, Token, Type, TypePath,
};

fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Ref"), ident.span())
}

fn get_internal_function_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "_inline"), ident.span())
}

fn get_node_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_NODE_TYPE"),
        ident.span(),
    )
}

fn get_function_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_FUNCTION"),
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
                                        panic!(concat!("Creating a new ", stringify!(#ident), " node is not allowed"));
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

#[proc_macro_attribute]
pub fn function(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);
    let ItemFn {
        attrs,
        vis,
        sig,
        block,
    } = &item;
    if let ReturnType::Type(_, ref output_type) = sig.output {
        let ident = &sig.ident;
        let function_ident = get_function_ident(ident);
        let inline_ident = get_internal_function_ident(ident);

        let mut inline_sig = sig.clone();
        inline_sig.ident = inline_ident.clone();

        let mut external_sig = sig.clone();
        external_sig.asyncness = None;
        external_sig.output = parse_quote! { -> impl std::future::Future<Output = #output_type> };

        let mut input_extraction = Vec::new();
        let mut input_verification = Vec::new();
        let mut input_clone = Vec::new();
        let mut input_from_node = Vec::new();
        let mut input_arguments = Vec::new();
        let mut input_node_arguments = Vec::new();

        let mut index: i32 = 1;

        for input in sig.inputs.iter() {
            match input {
                FnArg::Receiver(_) => {
                    item.span()
                        .unwrap()
                        .error("functions referencing self are not supported yet")
                        .emit();
                }
                FnArg::Typed(PatType { pat, ty, .. }) => {
                    input_extraction.push(quote! {
                        let #pat = __iter
                            .next()
                            .ok_or_else(|| anyhow::anyhow!(concat!(stringify!(#ident), "() argument ", stringify!(#index), " (", stringify!(#pat), ") missing")))?;
                    });
                    input_verification.push(quote! {
                        anyhow::Context::context(#ty::verify(&#pat), concat!(stringify!(#ident), "() argument ", stringify!(#index), " (", stringify!(#pat), ") invalid"))?;
                    });
                    input_clone.push(quote! {
                        let #pat = std::clone::Clone::clone(&#pat);
                    });
                    input_from_node.push(quote! {
                        let #pat = #ty::from_node(#pat).unwrap();
                    });
                    input_arguments.push(quote! {
                        #pat
                    });
                    input_node_arguments.push(quote! {
                        #pat.into()
                    });
                    index += 1;
                }
            }
        }

        return quote! {
            #(#attrs)*
            #vis #external_sig {
                let result = turbo_tasks::dynamic_call(&#function_ident, vec![#(#input_node_arguments),*]).unwrap();
                async { #output_type::from_node(result.await).unwrap() }
            }

            #(#attrs)*
            #vis #inline_sig #block

            lazy_static::lazy_static! {
                static ref #function_ident: turbo_tasks::NativeFunction = turbo_tasks::NativeFunction::new(|inputs| {
                    let mut __iter = inputs.into_iter();
                    #(#input_extraction)*
                    if __iter.next().is_some() {
                        return Err(anyhow::anyhow!(concat!(stringify!(#ident), "() called with too many arguments")));
                    }
                    #(#input_verification)*
                    Ok(Box::new(move || {
                        #(#input_clone)*
                        Box::pin(async move {
                            #(#input_from_node)*
                            #inline_ident(#(#input_arguments),*).await.into()
                        })
                    }))
                });
            }
        }
        .into();
    }
    item.span().unwrap().error("unsupported syntax").emit();
    quote! {
        #item
    }
    .into()
}
