use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

use super::value_debug_format_macro::get_value_debug_format_ident;

/// This macro generates the implementation of the `ValueDebug` trait for a
/// given type.
///
/// This requires the type to implement the `ValueDebugFormat` trait.
pub fn derive_value_debug(input: TokenStream) -> TokenStream {
    let derive_input = parse_macro_input!(input as DeriveInput);
    let ident = &derive_input.ident;
    let value_debug_format_ident = get_value_debug_format_ident(ident);
    quote! {
        #[turbo_tasks::value_impl]
        impl turbo_tasks::debug::ValueDebug for #ident {
            #[turbo_tasks::function]
            async fn dbg(&self) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
                self.#value_debug_format_ident().await
            }
        }
    }
    .into()
}
