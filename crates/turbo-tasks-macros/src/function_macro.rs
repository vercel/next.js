use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{parse_macro_input, ItemFn};
use turbo_tasks_macros_shared::get_function_ident;

use crate::func::{gen_native_function_code, split_signature};

fn get_function_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_FUNCTION_ID"),
        ident.span(),
    )
}

pub fn function(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);
    let ItemFn {
        attrs,
        vis,
        sig,
        block,
    } = &item;
    let (external_sig, inline_sig, output_type, convert_result_code) = split_signature(sig);
    let ident = &sig.ident;
    let function_ident = get_function_ident(ident);
    let function_id_ident = get_function_id_ident(ident);
    let inline_ident = &inline_sig.ident;

    let (native_function_code, input_raw_vc_arguments) = gen_native_function_code(
        quote! { stringify!(#ident) },
        quote! { #inline_ident },
        &function_ident,
        &function_id_ident,
        sig.asyncness.is_some(),
        &sig.inputs,
        &output_type,
        None,
    );

    quote! {
        #(#attrs)*
        #vis #external_sig {
            let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
            #convert_result_code
        }

        #(#attrs)*
        #vis #inline_sig #block

        #native_function_code
    }
    .into()
}
