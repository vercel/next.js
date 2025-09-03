use proc_macro2::TokenStream;
use quote::quote;

/// Composes an expression that will evaluate to a &'static str of the fully qualified name
///
/// The name is prefixed with the current crate name and module path
pub(crate) fn global_name(local_name: impl quote::ToTokens) -> TokenStream {
    let crate_name =
        std::env::var("CARGO_PKG_NAME").unwrap_or_else(|_| "unknown_crate".to_string());
    quote! { concat!(#crate_name, "@", module_path!(), "::", #local_name)}
}
