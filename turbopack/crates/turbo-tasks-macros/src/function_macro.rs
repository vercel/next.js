use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{parse_macro_input, parse_quote, ExprPath, ItemFn};
use turbo_tasks_macros_shared::{get_native_function_id_ident, get_native_function_ident};

use crate::func::{DefinitionContext, FunctionArguments, NativeFn, TurboFn};

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
    let local_cells = args.local_cells.is_some();

    let Some(turbo_fn) = TurboFn::new(&sig, DefinitionContext::NakedFn, args) else {
        return quote! {
            // An error occurred while parsing the function signature.
        }
        .into();
    };

    let ident = &sig.ident;

    let inline_function_ident = Ident::new(&format!("{ident}_inline_function"), ident.span());
    let inline_function_path: ExprPath = parse_quote! { #inline_function_ident };
    let mut inline_signature = sig.clone();
    inline_signature.ident = inline_function_ident;

    let native_fn = NativeFn::new(
        &ident.to_string(),
        &inline_function_path,
        turbo_fn.is_method(),
        local_cells,
    );
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

        #(#attrs)*
        #[doc(hidden)]
        #inline_signature #block

        #[doc(hidden)]
        pub(crate) static #native_function_ident: #native_function_ty = #native_function_def;

        #[doc(hidden)]
        pub(crate) static #native_function_id_ident: #native_function_id_ty = #native_function_id_def;

        #(#errors)*
    }
    .into()
}
