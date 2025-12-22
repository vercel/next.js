use proc_macro::TokenStream;
use quote::quote;
use syn::parse_macro_input;

use crate::{
    global_name::global_name,
    ident::get_type_ident,
    primitive_input::{BincodeWrappers, PrimitiveInput},
    value_macro::value_type_and_register,
};

pub fn primitive(input: TokenStream) -> TokenStream {
    let PrimitiveInput {
        ty,
        bincode_wrappers,
    } = parse_macro_input!(input as PrimitiveInput);

    let Some(ident) = get_type_ident(&ty) else {
        return quote! {
            // An error occurred while parsing the ident.
        }
        .into();
    };

    let value_debug_impl = quote! {
        #[turbo_tasks::value_impl]
        impl turbo_tasks::debug::ValueDebug for #ty {
            #[turbo_tasks::function]
            async fn dbg(&self) -> anyhow::Result<turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString>> {
                use turbo_tasks::debug::ValueDebugFormat;
                self.value_debug_format(usize::MAX).try_to_value_debug_string().await
            }

            #[turbo_tasks::function]
            async fn dbg_depth(&self, depth: usize) -> anyhow::Result<turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString>> {
                use turbo_tasks::debug::ValueDebugFormat;
                self.value_debug_format(depth).try_to_value_debug_string().await
            }
        }
    };

    let name = global_name(quote!(stringify!(#ty)));
    let new_value_type = if let Some(bincode_wrappers) = bincode_wrappers {
        let BincodeWrappers {
            encode_ty,
            decode_ty,
        } = bincode_wrappers;
        quote! {
            turbo_tasks::ValueType::new_with_bincode_wrappers::<#ty, #encode_ty, #decode_ty>(#name)
        }
    } else {
        quote! {
            turbo_tasks::ValueType::new_with_bincode::<#ty>(#name)
        }
    };

    let value_type_and_register = value_type_and_register(
        &ident,
        quote! { #ty },
        None,
        quote! {
            turbo_tasks::VcTransparentRead<#ty, #ty, #ty>
        },
        quote! {
            turbo_tasks::VcCellCompareMode<#ty>
        },
        new_value_type,
        /* has_serialization */ quote! { true },
    );

    let value_default_impl = quote! {
        #[turbo_tasks::value_impl]
        impl turbo_tasks::ValueDefault for #ty {
            #[turbo_tasks::function]
            fn value_default() -> Vc<Self> {
                Vc::cell(Default::default())
            }
        }
    };

    quote! {
        #value_type_and_register

        #value_debug_impl
        #value_default_impl
    }
    .into()
}
