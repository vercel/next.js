use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal, Span, TokenStream as TokenStream2};
use quote::quote;
use syn::{
    parse_macro_input, spanned::Spanned, Attribute, FnArg, ImplItem, ImplItemMethod, ItemImpl,
    Path, Receiver, ReturnType, Signature, Token, Type, TypePath,
};
use turbo_tasks_macros_shared::{
    get_ref_ident, get_register_trait_methods_ident, get_trait_impl_function_ident,
};

use crate::{
    func::{gen_native_function_code, split_signature, SelfType},
    util::*,
    value_macro::get_check_trait_method_ident,
};

fn get_internal_trait_impl_function_ident(trait_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &("__trait_call_".to_string() + &trait_ident.to_string() + "_" + &ident.to_string()),
        ident.span(),
    )
}

fn get_trait_impl_function_id_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &(struct_ident.to_string().to_uppercase()
            + "_IMPL_"
            + &ident.to_string().to_uppercase()
            + "_FUNCTION_ID"),
        ident.span(),
    )
}

fn is_attribute(attr: &Attribute, name: &str) -> bool {
    let path = &attr.path;
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident == "turbo_tasks" => match iter.next() {
            Some(seg) if seg.arguments.is_empty() && seg.ident == name => iter.next().is_none(),
            _ => false,
        },
        _ => false,
    }
}

pub fn value_impl(_args: TokenStream, input: TokenStream) -> TokenStream {
    fn generate_for_vc_impl(vc_ident: &Ident, items: &[ImplItem]) -> TokenStream2 {
        let mut functions = Vec::new();

        for item in items.iter() {
            if let ImplItem::Method(ImplItemMethod {
                attrs,
                vis,
                defaultness: _,
                sig,
                block,
            }) = item
            {
                let function_attr = attrs.iter().find(|attr| is_attribute(attr, "function"));
                let attrs = if function_attr.is_none() {
                    item.span()
                        .unwrap()
                        .error("#[turbo_tasks::function] attribute missing")
                        .emit();
                    attrs.clone()
                } else {
                    attrs
                        .iter()
                        .filter(|attr| !is_attribute(attr, "function"))
                        .cloned()
                        .collect()
                };
                let Signature { ident, .. } = sig;

                let (external_sig, inline_sig, output_type, convert_result_code) =
                    split_signature(sig);

                let inline_ident = &inline_sig.ident;
                let function_ident = get_trait_impl_function_ident(vc_ident, ident);
                let function_id_ident = get_trait_impl_function_id_ident(vc_ident, ident);

                let (native_function_code, input_raw_vc_arguments) = gen_native_function_code(
                    // use const string
                    quote! { format!(concat!("{}::", stringify!(#ident)), std::any::type_name::<#vc_ident>()) },
                    quote! { #vc_ident::#inline_ident },
                    &function_ident,
                    &function_id_ident,
                    sig.asyncness.is_some(),
                    &sig.inputs,
                    &output_type,
                    Some((vc_ident, SelfType::Ref)),
                );

                functions.push(quote! {
                    impl #vc_ident {
                        #(#attrs)*
                        #vis #external_sig {
                            let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
                            #convert_result_code
                        }

                        #(#attrs)*
                        #[doc(hidden)]
                        #vis #inline_sig #block
                    }

                    #native_function_code
                })
            }
        }

        quote! {
            #(#functions)*
        }
    }

    fn generate_for_trait_impl(
        trait_path: &Path,
        struct_ident: &Ident,
        items: &[ImplItem],
    ) -> TokenStream2 {
        let trait_ident = &trait_path.segments.last().unwrap().ident;
        let register = get_register_trait_methods_ident(trait_ident, struct_ident);
        let check = get_check_trait_method_ident(trait_ident, struct_ident);
        let ref_ident = get_ref_ident(struct_ident);
        let trait_ref_path = get_ref_path(trait_path);
        let mut trait_registers = Vec::new();
        let mut impl_functions = Vec::new();
        let mut trait_functions = Vec::new();
        let mut trait_impl_functions = Vec::new();
        for item in items.iter() {
            if let ImplItem::Method(ImplItemMethod {
                sig, attrs, block, ..
            }) = item
            {
                let function_attr = attrs.iter().find(|attr| is_attribute(attr, "function"));
                let attrs = if function_attr.is_none() {
                    item.span()
                        .unwrap()
                        .error("#[turbo_tasks::function] attribute missing")
                        .emit();
                    attrs.clone()
                } else {
                    attrs
                        .iter()
                        .filter(|attr| !is_attribute(attr, "function"))
                        .cloned()
                        .collect()
                };
                let Signature {
                    ident,
                    inputs,
                    output,
                    asyncness,
                    ..
                } = sig;
                let output_type = get_return_type(output);
                let function_ident = get_trait_impl_function_ident(struct_ident, ident);
                let function_id_ident = get_trait_impl_function_id_ident(struct_ident, ident);
                let internal_function_ident =
                    get_internal_trait_impl_function_ident(trait_ident, ident);
                trait_registers.push(quote! {
                    value_type.register_trait_method(<#trait_ref_path as turbo_tasks::ValueTraitVc>::get_trait_type_id(), stringify!(#ident).to_string(), *#function_id_ident);
                });
                let name = Literal::string(&(struct_ident.to_string() + "::" + &ident.to_string()));
                let (native_function_code, mut input_raw_vc_arguments) = gen_native_function_code(
                    quote! { #name },
                    quote! { #struct_ident::#internal_function_ident },
                    &function_ident,
                    &function_id_ident,
                    asyncness.is_some(),
                    inputs,
                    &output_type,
                    Some((&ref_ident, SelfType::Value(struct_ident))),
                );
                let mut new_sig = sig.clone();
                new_sig.ident = internal_function_ident;
                let mut external_sig = sig.clone();
                external_sig.asyncness = None;
                let external_self = external_sig.inputs.first_mut().unwrap();
                let custom_self_type = matches!(sig.inputs.first().unwrap(), FnArg::Typed(..));
                if custom_self_type {
                    *external_self = FnArg::Receiver(Receiver {
                        attrs: Vec::new(),
                        reference: Some((Token![&](Span::call_site()), None)),
                        mutability: None,
                        self_token: Token![self](Span::call_site()),
                    });
                    input_raw_vc_arguments[0] = quote! { self.into() };
                }
                impl_functions.push(quote! {
                    impl #struct_ident {
                        #(#attrs)*
                        #[allow(non_snake_case)]
                        #[doc(hidden)]
                        #new_sig #block
                    }

                    #native_function_code
                });

                let (raw_output_type, _) = unwrap_result_type(&output_type);
                let convert_result_code = if is_empty_type(raw_output_type) {
                    external_sig.output = ReturnType::Default;
                    quote! {}
                } else {
                    external_sig.output = ReturnType::Type(
                        Token![->](raw_output_type.span()),
                        Box::new(raw_output_type.clone()),
                    );
                    quote! { std::convert::From::<turbo_tasks::RawVc>::from(result) }
                };

                trait_functions.push(quote!{
                    #(#attrs)*
                    pub #external_sig {
                        let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
                        #convert_result_code
                    }
                });

                let args = inputs
                    .iter()
                    .enumerate()
                    .map(|(i, input)| match input {
                        FnArg::Receiver(_) => {
                            quote! { self }
                        }
                        FnArg::Typed(arg) => {
                            if i == 0 {
                                quote! { self }
                            } else {
                                let pat = &arg.pat;
                                quote! { #pat }
                            }
                        }
                    })
                    .collect::<Vec<_>>();

                trait_impl_functions.push(quote! {
                    #(#attrs)*
                    #external_sig {
                        #ref_ident::#ident(#(#args),*)
                    }
                });
            }
        }
        quote! {
            #[allow(non_snake_case)]
            fn #register(value_type: &mut turbo_tasks::ValueType) {
                if false { #ref_ident::#check(); }
                value_type.register_trait(<#trait_ref_path as turbo_tasks::ValueTraitVc>::get_trait_type_id());
                #(#trait_registers)*
            }

            #(#impl_functions)*

            impl #ref_ident {
                #(#trait_functions)*
            }

            impl #trait_path for #ref_ident {
                #(#trait_impl_functions)*
            }
        }
    }

    let item = parse_macro_input!(input as ItemImpl);

    if let Type::Path(TypePath { qself: None, path }) = &*item.self_ty {
        if let Some(ident) = path.get_ident() {
            match &item.trait_ {
                None => {
                    let code = generate_for_vc_impl(ident, &item.items);
                    return quote! {
                        #code
                    }
                    .into();
                }
                Some((_, trait_path, _)) => {
                    let code = generate_for_trait_impl(trait_path, ident, &item.items);
                    return quote! {
                        #code
                    }
                    .into();
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
