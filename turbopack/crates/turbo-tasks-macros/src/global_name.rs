use proc_macro2::TokenStream;
use quote::quote;

pub(crate) fn global_name_for_type(ty: impl quote::ToTokens) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name_for_type!(#ty)
    }
}

pub(crate) fn global_name_for_method(
    ty: impl quote::ToTokens,
    method: impl quote::ToTokens,
) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name_for_method!(#ty, #method)
    }
}

pub(crate) fn global_name_for_trait_method(
    trait_: impl quote::ToTokens,
    method: impl quote::ToTokens,
) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name_for_trait_method!(#trait_, #method)
    }
}

pub(crate) fn global_name_for_trait_method_impl(
    ty: impl quote::ToTokens,
    trait_: impl quote::ToTokens,
    method: impl quote::ToTokens,
) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name_for_trait_method_impl!(#ty, #trait_, #method)
    }
}

/// Composes an expression that will evaluate to a &'static str of the fully qualified name
///
/// The name is prefixed with the current crate name and module path
pub(crate) fn global_name_for_scope(depth: usize, local_name: impl quote::ToTokens) -> TokenStream {
    quote! {
        turbo_tasks::macro_helpers::global_name_for_scope!(#depth, #local_name)
    }
}
