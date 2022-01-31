#![feature(proc_macro_diagnostic)]

extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal, TokenStream as TokenStream2};
use quote::quote;
use syn::{
    parenthesized,
    parse::{Parse, ParseStream},
    parse_macro_input, parse_quote,
    punctuated::Punctuated,
    spanned::Spanned,
    token::Paren,
    Attribute, Error, Fields, FnArg, ImplItem, ImplItemMethod, ItemFn, ItemImpl, ItemStruct,
    ItemTrait, Pat, PatIdent, PatType, Path, PathArguments, PathSegment, Receiver, Result,
    ReturnType, Signature, Token, TraitItem, TraitItemMethod, Type, TypePath, TypeTuple,
};

fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Ref"), ident.span())
}

fn get_internal_function_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "_inline"), ident.span())
}

fn get_trait_mod_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "TurboTasksMethods"), ident.span())
}

fn get_node_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_NODE_TYPE"),
        ident.span(),
    )
}

fn get_trait_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_TRAIT_TYPE"),
        ident.span(),
    )
}

fn get_register_trait_methods_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &("__register_".to_string()
            + &struct_ident.to_string()
            + "_"
            + &trait_ident.to_string()
            + "_trait_methods"),
        trait_ident.span(),
    )
}

fn get_function_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_FUNCTION"),
        ident.span(),
    )
}

fn get_trait_impl_function_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &(struct_ident.to_string().to_uppercase()
            + "_IMPL_"
            + &ident.to_string().to_uppercase()
            + "_FUNCTION"),
        ident.span(),
    )
}

#[proc_macro_attribute]
pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);
    let traits = if args.is_empty() {
        Vec::new()
    } else {
        parse_macro_input!(args with Punctuated<Ident, Token![+]>::parse_terminated)
            .into_iter()
            .collect()
    };

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
        let trait_registrations: Vec<_> = traits
            .iter()
            .map(|trait_ident| {
                let register = get_register_trait_methods_ident(trait_ident, &ident);
                quote! {
                    #register(&mut node_type);
                }
            })
            .collect();
        let expanded = quote! {
            #item

            lazy_static::lazy_static! {
                static ref #node_type_ident: turbo_tasks::NodeType = {
                    let mut node_type = turbo_tasks::NodeType::new(std::any::type_name::<#ident>().to_string());
                    #(#trait_registrations)*
                    node_type
                };
            }

            #[derive(Clone, Debug, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq)]
            #vis struct #ref_ident {
                node: turbo_tasks::NodeRef,
            }

            impl #ref_ident {
                pub fn from_node(node: turbo_tasks::NodeRef) -> Option<Self> {
                    if node.is_node_type(&#node_type_ident) {
                        Some(Self { node })
                    } else {
                        None
                    }
                }

                pub fn verify(node: &turbo_tasks::NodeRef) -> anyhow::Result<()> {
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

                pub fn get(&self) -> impl std::ops::Deref<Target = #ident> {
                    // unwrap is safe here since we ensure that it will be the correct node type
                    self.node.read::<#ident>().unwrap()
                }
            }

            impl From<#ref_ident> for turbo_tasks::NodeRef {
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
pub fn value_trait(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemTrait);

    let ItemTrait {
        vis, ident, items, ..
    } = &item;

    let ref_ident = get_ref_ident(&ident);
    let mod_ident = get_trait_mod_ident(&ident);
    let trait_type_ident = get_trait_type_ident(&ident);
    let mut trait_mod_items = Vec::new();
    let mut trait_fns = Vec::new();

    for item in items.iter() {
        if let TraitItem::Method(TraitItemMethod {
            sig:
                Signature {
                    ident: method_ident,
                    inputs,
                    output,
                    ..
                },
            ..
        }) = item
        {
            trait_mod_items.push(quote! {
                #[inline]
                fn #method_ident(&self) -> (std::any::TypeId, &'static str) {
                    #[allow(non_camel_case_types)]
                    pub struct TraitFunction { _private: () }
                    (std::any::TypeId::of::<TraitFunction>(), std::any::type_name::<TraitFunction>())
                }
            });
            if let ReturnType::Type(_, ty) = output {
                let args = inputs.iter().filter_map(|arg| match arg {
                    FnArg::Receiver(_) => None,
                    FnArg::Typed(PatType { pat, .. }) => Some(quote! {
                        #pat.into()
                    }),
                });
                let method_args: Vec<_> = inputs.iter().collect();
                let convert_result_code = if is_empty_type(&ty) {
                    quote! { result.await; }
                } else {
                    quote! { #ty::from_node(result.await.unwrap()).unwrap() }
                };
                trait_fns.push(quote! {
                    pub fn #method_ident(#(#method_args),*) -> impl std::future::Future<Output = #ty> {
                        let trait_method = self.node.get_trait_method(#ident.#method_ident());
                        let result = turbo_tasks::dynamic_call(trait_method, vec![self.clone().into(), #(#args),*]).unwrap();
                        async { #convert_result_code }
                    }
                })
            }
        }
    }

    let expanded = quote! {
        #item

        lazy_static::lazy_static! {
            pub static ref #trait_type_ident: turbo_tasks::TraitType = turbo_tasks::TraitType::new(std::any::type_name::<dyn #ident>().to_string());
        }

        #vis struct #mod_ident {
            __private: ()
        }

        impl #mod_ident {
            #[inline]
            pub fn __type(&self) -> &'static turbo_tasks::TraitType {
                &*#trait_type_ident
            }
            #(#trait_mod_items)*
        }

        #[allow(non_upper_case_globals)]
        #vis static #ident: #mod_ident = #mod_ident { __private: () };

        #[derive(Clone, Debug, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq)]
        #vis struct #ref_ident {
            node: turbo_tasks::NodeRef,
        }

        impl #ref_ident {
            pub fn from_node(node: turbo_tasks::NodeRef) -> Option<Self> {
                if node.has_trait_type(&#trait_type_ident) {
                    Some(Self { node })
                } else {
                    None
                }
            }

            pub fn verify(node: &turbo_tasks::NodeRef) -> anyhow::Result<()> {
                if node.has_trait_type(&#trait_type_ident) {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!(
                        "expected {:?} but got {:?}",
                        &*#trait_type_ident,
                        node.get_node_type()
                    ))
                }
            }

            #(#trait_fns)*
        }

        impl From<#ref_ident> for turbo_tasks::NodeRef {
            fn from(node_ref: #ref_ident) -> Self {
                node_ref.node
            }
        }

    };
    expanded.into()
}

#[proc_macro_attribute]
pub fn value_impl(_args: TokenStream, input: TokenStream) -> TokenStream {
    fn generate_for_self_impl(ident: &Ident, items: &Vec<ImplItem>) -> TokenStream2 {
        let ref_ident = get_ref_ident(&ident);
        let node_type_ident = get_node_type_ident(&ident);
        let mut constructors = Vec::new();
        let mut i = 0;
        for item in items.iter() {
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
                        let index_literal = Literal::i32_unsuffixed(i);
                        let mut inputs_for_intern_key = vec![quote! { #index_literal }];
                        for arg in inputs.iter() {
                            if let FnArg::Typed(PatType { pat, ty, .. }) = arg {
                                if let Pat::Ident(PatIdent { ident, .. }) = &**pat {
                                    input_names.push(ident.clone());
                                    inputs_for_intern_key.push(if let Type::Reference(_) = &**ty {
                                        quote! { std::clone::Clone::clone(#ident) }
                                    } else {
                                        quote! { std::clone::Clone::clone(&#ident) }
                                    });
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
                                turbo_tasks::NodeRef::new(
                                    &#node_type_ident,
                                    std::sync::Arc::new(#ident::#fn_name(#(#input_names),*))
                                )
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
                        i += 1;
                    }
                }
                _ => {}
            };
        }

        return quote! {
            impl #ref_ident {
                #(#constructors)*
            }
        };
    }

    fn generate_for_trait_impl(
        trait_ident: &Ident,
        struct_ident: &Ident,
        items: &Vec<ImplItem>,
    ) -> TokenStream2 {
        let register = get_register_trait_methods_ident(trait_ident, struct_ident);
        let ref_ident = get_ref_ident(struct_ident);
        let mut trait_registers = Vec::new();
        let mut impl_functions = Vec::new();
        for item in items.iter() {
            match item {
                ImplItem::Method(ImplItemMethod {
                    sig:
                        Signature {
                            ident,
                            inputs,
                            output,
                            ..
                        },
                    ..
                }) => {
                    let output_type = match output {
                        ReturnType::Default => Type::Tuple(TypeTuple {
                            paren_token: Paren::default(),
                            elems: Punctuated::new(),
                        }),
                        ReturnType::Type(_, ref output_type) => (**output_type).clone(),
                    };
                    let function_ident = get_trait_impl_function_ident(struct_ident, ident);
                    trait_registers.push(quote! {
                        node_type.register_trait_method(#trait_ident.#ident(), &*#function_ident);
                    });
                    let native_function_code = gen_native_function_code(
                        quote! { stringify!(#trait_ident::#ident) },
                        quote! { #trait_ident::#ident },
                        &function_ident,
                        inputs,
                        &output_type,
                        Some(&ref_ident),
                    );
                    impl_functions.push(quote! {
                        #native_function_code
                    })
                }
                _ => {}
            }
        }
        quote! {
            #[allow(non_snake_case)]
            fn #register(node_type: &mut turbo_tasks::NodeType) {
                node_type.register_trait(#trait_ident.__type());
                #(#trait_registers)*
            }

            #(#impl_functions)*
        }
    }

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
                match &item.trait_ {
                    None => {
                        let code = generate_for_self_impl(ident, &item.items);
                        return quote! {
                            #item

                            #code
                        }
                        .into();
                    }
                    Some((_, Path { segments, .. }, _)) => {
                        if segments.len() == 1 {
                            if let Some(PathSegment {
                                arguments: PathArguments::None,
                                ident: trait_ident,
                            }) = segments.first()
                            {
                                let code = generate_for_trait_impl(trait_ident, ident, &item.items);
                                return quote! {
                                    #item

                                    #code
                                }
                                .into();
                            }
                        }
                    }
                }
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
    let output_type = match sig.output {
        ReturnType::Default => Type::Tuple(TypeTuple {
            paren_token: Paren::default(),
            elems: Punctuated::new(),
        }),
        ReturnType::Type(_, ref output_type) => (**output_type).clone(),
    };
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

    let native_function_code = gen_native_function_code(
        quote! { stringify!(#ident) },
        quote! { #inline_ident },
        &function_ident,
        &sig.inputs,
        &output_type,
        None,
    );

    let convert_result_code = if is_empty_type(&output_type) {
        quote! { result.await; }
    } else {
        quote! { #output_type::from_node(result.await.unwrap()).unwrap() }
    };

    return quote! {
        #(#attrs)*
        #vis #external_sig {
            let result = turbo_tasks::dynamic_call(&#function_ident, vec![#(#input_node_arguments),*]).unwrap();
            async { #convert_result_code }
        }

        #(#attrs)*
        #vis #inline_sig #block

        #native_function_code
    }
    .into();
}

fn is_empty_type(ty: &Type) -> bool {
    if let Type::Tuple(TypeTuple { elems, .. }) = ty {
        if elems.is_empty() {
            return true;
        }
    }
    false
}

fn gen_native_function_code(
    name_code: TokenStream2,
    original_function: TokenStream2,
    function_ident: &Ident,
    inputs: &Punctuated<FnArg, Token![,]>,
    output_type: &Type,
    self_ref_type: Option<&Ident>,
) -> TokenStream2 {
    let mut input_extraction = Vec::new();
    let mut input_verification = Vec::new();
    let mut input_clone = Vec::new();
    let mut input_from_node = Vec::new();
    let mut input_arguments = Vec::new();

    let mut index: i32 = 1;

    for input in inputs {
        match input {
            FnArg::Receiver(Receiver { mutability, .. }) => {
                if mutability.is_some() {
                    input.span().unwrap().error("mutable self is not supported in turbo_task traits (nodes are immutable)").emit();
                }
                let self_ref_type = self_ref_type.unwrap();
                input_extraction.push(quote! {
                    let __self = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!(concat!(#name_code, "() self argument missing")))?;
                });
                input_verification.push(quote! {
                    anyhow::Context::context(#self_ref_type::verify(&__self), concat!(#name_code, "() self argument invalid"))?;
                });
                input_clone.push(quote! {
                    let __self = std::clone::Clone::clone(&__self);
                });
                input_from_node.push(quote! {
                    let __self = #self_ref_type::from_node(__self).unwrap().get();
                });
                input_arguments.push(quote! {
                    &*__self
                });
            }
            FnArg::Typed(PatType { pat, ty, .. }) => {
                input_extraction.push(quote! {
                    let #pat = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!(concat!(#name_code, "() argument ", stringify!(#index), " (", stringify!(#pat), ") missing")))?;
                });
                input_verification.push(quote! {
                    anyhow::Context::context(#ty::verify(&#pat), concat!(#name_code, "() argument ", stringify!(#index), " (", stringify!(#pat), ") invalid"))?;
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
                index += 1;
            }
        }
    }
    let original_call_code = if is_empty_type(output_type) {
        quote! {
            #original_function(#(#input_arguments),*).await;
            None
        }
    } else {
        quote! { Some(#original_function(#(#input_arguments),*).await.into()) }
    };
    quote! {
        lazy_static::lazy_static! {
            static ref #function_ident: turbo_tasks::NativeFunction = turbo_tasks::NativeFunction::new(#name_code.to_string(), |inputs| {
                let mut __iter = inputs.into_iter();
                #(#input_extraction)*
                if __iter.next().is_some() {
                    return Err(anyhow::anyhow!(concat!(#name_code, "() called with too many arguments")));
                }
                #(#input_verification)*
                Ok(Box::new(move || {
                    #(#input_clone)*
                    Box::pin(async move {
                        #(#input_from_node)*
                        #original_call_code
                    })
                }))
            });
        }
    }
}
