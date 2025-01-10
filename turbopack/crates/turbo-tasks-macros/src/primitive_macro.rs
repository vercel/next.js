use proc_macro::TokenStream;
use quote::quote;
use syn::parse_macro_input;
use turbo_tasks_macros_shared::{get_type_ident, PrimitiveInput};

use crate::value_macro::value_type_and_register;

pub fn primitive(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as PrimitiveInput);

    let ty = input.ty;
    let Some(ident) = get_type_ident(&ty) else {
        return quote! {
            // An error occurred while parsing the ident.
        }
        .into();
    };

    let value_shrink_to_fit_impl = if input.manual_shrink_to_fit.is_none() {
        Some(quote! {
            impl turbo_tasks::ShrinkToFit for #ty {
                fn shrink_to_fit(&mut self) {}
            }
        })
    } else {
        None
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

    let value_type_and_register = value_type_and_register(
        &ident,
        quote! { #ty },
        None,
        quote! {
            turbo_tasks::VcTransparentRead<#ty, #ty, #ty>
        },
        quote! {
            turbo_tasks::VcCellSharedMode<#ty>
        },
        quote! {
            turbo_tasks::ValueType::new_with_any_serialization::<#ty>()
        },
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
        #value_shrink_to_fit_impl
        #value_default_impl
    }
    .into()
}
