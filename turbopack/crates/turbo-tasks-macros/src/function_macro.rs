use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, parse_quote, ItemFn};
use turbo_tasks_macros_shared::{get_native_function_id_ident, get_native_function_ident};

use crate::func::{
    filter_inline_attributes, DefinitionContext, FunctionArguments, NativeFn, TurboFn,
};

/// This macro generates the virtual function that powers turbo tasks.
/// An annotated task is replaced with a stub function that returns a
/// lazy completion (Vc), and stamps out the concrete implementation
/// of the task alongside that the Vc uses to resolve itself.
///
/// Functions support being tagged for informational purposes. This
/// is currently only used in turbo-static for doing static analysis
/// of tasks.
///
/// # Examples
///
/// ```rust
/// use turbo_tasks::{Vc};
///
/// #[turbo_tasks::function(fs)]
/// async fn my_task() -> Vc<usize> {
///     // access filesystem
/// }
/// ```
pub fn function(args: TokenStream, input: TokenStream) -> TokenStream {
    let mut errors = Vec::new();

    let ItemFn {
        attrs,
        vis,
        sig,
        block,
    } = parse_macro_input!(input as ItemFn);

    let args = syn::parse::<FunctionArguments>(args)
        .inspect_err(|err| errors.push(err.to_compile_error()))
        .unwrap_or_default();
    let local = args.local.is_some();

    let Some(turbo_fn) = TurboFn::new(&sig, DefinitionContext::NakedFn, args) else {
        return quote! {
            // An error occurred while parsing the function signature.
        }
        .into();
    };

    let ident = &sig.ident;

    let inline_function_ident = turbo_fn.inline_ident();
    let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(&block);
    let inline_attrs = filter_inline_attributes(&attrs[..]);

    let native_fn = NativeFn {
        function_path_string: ident.to_string(),
        function_path: parse_quote! { #inline_function_ident },
        is_method: turbo_fn.is_method(),
        filter_trait_call_args: None, // not a trait method
        local,
    };
    let native_function_ident = get_native_function_ident(ident);
    let native_function_ty = native_fn.ty();
    let native_function_def = native_fn.definition();

    let native_function_id_ident = get_native_function_id_ident(ident);
    let native_function_id_ty = native_fn.id_ty();
    let native_function_id_def = native_fn.id_definition(&native_function_ident.clone().into());

    let exposed_signature = turbo_fn.signature();
    let exposed_block = turbo_fn.static_block(&native_function_id_ident);

    quote! {
        #(#attrs)*
        #vis #exposed_signature #exposed_block

        #(#inline_attrs)*
        #[doc(hidden)]
        #inline_signature #inline_block

        #[doc(hidden)]
        pub(crate) static #native_function_ident:
            turbo_tasks::macro_helpers::Lazy<#native_function_ty> =
                turbo_tasks::macro_helpers::Lazy::new(|| #native_function_def);

        #[doc(hidden)]
        pub(crate) static #native_function_id_ident:
            turbo_tasks::macro_helpers::Lazy<#native_function_id_ty> =
                turbo_tasks::macro_helpers::Lazy::new(|| #native_function_id_def);

        #(#errors)*
    }
    .into()
}
