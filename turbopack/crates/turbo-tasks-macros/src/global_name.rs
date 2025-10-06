use proc_macro2::TokenStream;
use quote::quote;

/// Composes an expression that will evaluate to a &'static str of the fully qualified name
///
/// The name is prefixed with the current crate name and module path
pub(crate) fn global_name(local_name: impl quote::ToTokens) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name!(#local_name)
    }
}
