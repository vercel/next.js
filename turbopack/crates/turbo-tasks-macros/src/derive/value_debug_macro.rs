use proc_macro::TokenStream;
use quote::quote;
use syn::{DeriveInput, parse_macro_input};

/// This macro generates the implementation of the `ValueDebug` trait for a
/// given type.
///
/// This requires the type to implement the `ValueDebugFormat` trait.
pub fn derive_value_debug(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    quote! {
        #[cfg(debug_assertions)]
        #[turbo_tasks::value_impl]
        impl turbo_tasks::debug::ValueDebug for #ident {
            fn dbg_depth<'a>(
                &'a self,
                depth: usize,
            ) -> ::std::pin::Pin<
                ::std::boxed::Box<
                    dyn ::std::future::Future<Output = ::anyhow::Result<::std::string::String>>
                        + ::std::marker::Send
                        + 'a,
                >,
            > {
                ::std::boxed::Box::pin(async move {
                    turbo_tasks::debug::ValueDebugFormat::value_debug_format(self, depth)
                        .try_to_string()
                        .await
                })
            }
        }
    }
    .into()
}
