use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{quote, quote_spanned};
use syn::{
    parse_macro_input, parse_quote, spanned::Spanned, ExprPath, ItemTrait, TraitItem,
    TraitItemMethod,
};
use turbo_tasks_macros_shared::{
    get_trait_default_impl_function_id_ident, get_trait_default_impl_function_ident,
    get_trait_type_id_ident, get_trait_type_ident, ValueTraitArguments,
};

use crate::func::{DefinitionContext, NativeFn, TurboFn};

pub fn value_trait(args: TokenStream, input: TokenStream) -> TokenStream {
    let ValueTraitArguments { debug, resolved } = parse_macro_input!(args as ValueTraitArguments);

    let item = parse_macro_input!(input as ItemTrait);

    let ItemTrait {
        vis,
        ident: trait_ident,
        items: raw_items,
        supertraits,
        attrs,
        trait_token,
        colon_token: _,
        unsafety,
        auto_token,
        generics,
        brace_token: _,
    } = &item;

    if unsafety.is_some() {
        item.span()
            .unwrap()
            .error("unsafe traits are not supported in #[turbo_tasks::value_trait]")
            .emit();
    }

    if auto_token.is_some() {
        item.span()
            .unwrap()
            .error("auto traits are not supported in #[turbo_tasks::value_trait]")
            .emit();
    }

    if !generics.params.is_empty() {
        item.span()
            .unwrap()
            .error("generic traits are not supported in #[turbo_tasks::value_trait]")
            .emit();
    }

    if generics.where_clause.is_some() {
        item.span()
            .unwrap()
            .error("where clauses are not supported in #[turbo_tasks::value_trait]")
            .emit();
    }

    let supertraits = supertraits.iter().collect::<Vec<_>>();

    let trait_type_ident = get_trait_type_ident(trait_ident);
    let trait_type_id_ident = get_trait_type_id_ident(trait_ident);
    let mut dynamic_trait_fns = Vec::new();
    let mut default_method_registers: Vec<TokenStream2> = Vec::new();
    let mut native_functions = Vec::new();
    let mut items = Vec::with_capacity(raw_items.len());

    for item in raw_items.iter() {
        let TraitItem::Method(TraitItemMethod {
            sig,
            default,
            attrs,
            semi_token: _,
        }) = item
        else {
            item.span()
                .unwrap()
                .error("only methods are allowed in a #[turbo_tasks::value_trait] trait")
                .emit();
            continue;
        };

        let ident = &sig.ident;

        let Some(turbo_fn) = TurboFn::new(sig, DefinitionContext::ValueTrait) else {
            return quote! {
                // An error occurred while parsing the function signature.
            }
            .into();
        };

        let turbo_signature = turbo_fn.signature();
        let dynamic_block = turbo_fn.dynamic_block(&trait_type_id_ident);
        dynamic_trait_fns.push(quote! {
            #turbo_signature #dynamic_block
        });

        let default = if let Some(block) = default {
            // TODO(alexkirsz) These should go into their own utilities.
            let inline_function_ident: Ident =
                Ident::new(&format!("{}_inline", ident), ident.span());
            let inline_extension_trait_ident =
                Ident::new(&format!("{}_{}_inline", trait_ident, ident), ident.span());
            let inline_function_path: ExprPath = parse_quote! { <Box<dyn #trait_ident> as #inline_extension_trait_ident>::#inline_function_ident };
            let mut inline_signature = sig.clone();
            inline_signature.ident = inline_function_ident;

            let native_function =
                NativeFn::new(&format!("{trait_ident}::{ident}"), &inline_function_path);

            let native_function_ident = get_trait_default_impl_function_ident(trait_ident, ident);
            let native_function_ty = native_function.ty();
            let native_function_def = native_function.definition();
            let native_function_id_ident =
                get_trait_default_impl_function_id_ident(trait_ident, ident);
            let native_function_id_ty = native_function.id_ty();
            let native_function_id_def = native_function.id_definition(&parse_quote! {
                #native_function_ident
            });

            default_method_registers.push(quote! {
                trait_type.register_default_trait_method(stringify!(#ident).into(), *#native_function_id_ident);
            });

            native_functions.push(quote! {
                #[doc(hidden)]
                #[allow(non_camel_case_types)]
                // #[turbo_tasks::async_trait]
                trait #inline_extension_trait_ident: std::marker::Send {
                    #[allow(declare_interior_mutable_const)]
                    const #native_function_ident: #native_function_ty;
                    #[allow(declare_interior_mutable_const)]
                    const #native_function_id_ident: #native_function_id_ty;

                    #(#attrs)*
                    #inline_signature;
                }

                #[doc(hidden)]
                // #[turbo_tasks::async_trait]
                // Needs to be explicit 'static here, otherwise we can get a lifetime error
                // in the inline signature.
                impl #inline_extension_trait_ident for Box<dyn #trait_ident> {
                    #[allow(declare_interior_mutable_const)]
                    const #native_function_ident: #native_function_ty = #native_function_def;
                    #[allow(declare_interior_mutable_const)]
                    const #native_function_id_ident: #native_function_id_ty = #native_function_id_def;

                    #(#attrs)*
                    #inline_signature #block
                }

                #[doc(hidden)]
                pub(crate) static #native_function_ident: #native_function_ty = <Box<dyn #trait_ident> as #inline_extension_trait_ident>::#native_function_ident;
                #[doc(hidden)]
                pub(crate) static #native_function_id_ident: #native_function_id_ty = <Box<dyn #trait_ident> as #inline_extension_trait_ident>::#native_function_id_ident;
            });

            Some(turbo_fn.static_block(&native_function_id_ident))
        } else {
            None
        };

        items.push(TraitItem::Method(TraitItemMethod {
            sig: turbo_fn.trait_signature(),
            default,
            attrs: attrs.clone(),
            semi_token: Default::default(),
        }));
    }

    let value_debug_impl = if debug {
        quote! {
            #[turbo_tasks::value_impl]
            impl turbo_tasks::debug::ValueDebug for Box<dyn #trait_ident> {
                #[turbo_tasks::function]
                pub fn dbg(self: turbo_tasks::Vc<Self>) -> turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString> {
                    use turbo_tasks::debug::ValueDebug;
                    self.dbg_depth(usize::MAX)
                }

                #[turbo_tasks::function]
                pub async fn dbg_depth(self: turbo_tasks::Vc<Self>, depth: usize) -> anyhow::Result<turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString>> {
                    use turbo_tasks::debug::ValueDebugFormat;
                    let string = self.value_debug_format(depth).try_to_value_debug_string().await?.await?;
                    Ok(turbo_tasks::debug::ValueDebugString::new(format!(concat!(stringify!(#trait_ident), "({})"), string)))
                }
            }
        }
    } else {
        quote! {}
    };

    let mut extended_supertraits = Vec::new();
    if let Some(span) = resolved {
        extended_supertraits.push(quote_spanned! {
            span => turbo_tasks::ResolvedValue
        });
    }
    extended_supertraits.push(quote!(::std::marker::Send));

    let expanded = quote! {
        #[must_use]
        #(#attrs)*
        #vis #trait_token #trait_ident: #(#supertraits +)* #(#extended_supertraits +)*
        {
            #(#items)*
        }

        #(#native_functions)*

        #[doc(hidden)]
        pub(crate) static #trait_type_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitType> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                let mut trait_type = turbo_tasks::TraitType::new(stringify!(#trait_ident).to_string());;
                #(#default_method_registers)*
                trait_type
            });
        #[doc(hidden)]
        static #trait_type_id_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitTypeId> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)
            });

        impl turbo_tasks::VcValueTrait for Box<dyn #trait_ident> {
            fn get_trait_type_id() -> turbo_tasks::TraitTypeId {
                *#trait_type_id_ident
            }
        }

        unsafe impl turbo_tasks::Dynamic<Box<dyn #trait_ident>> for Box<dyn #trait_ident> {}
        // TODO(alexkirsz) It would be great to have the following identity. However, I run into an ICE when I attempt this,
        // so tabling it for now.
        unsafe impl turbo_tasks::Upcast<Box<dyn #trait_ident>> for Box<dyn #trait_ident> {}

        impl<T> #trait_ident for T
        where
            T: turbo_tasks::Dynamic<Box<dyn #trait_ident>> + #(#supertraits +)* #(#extended_supertraits +)*,
        {
            #(#dynamic_trait_fns)*
        }

        #(
            unsafe impl turbo_tasks::Dynamic<Box<dyn #supertraits>> for Box<dyn #trait_ident> {}
            unsafe impl turbo_tasks::Upcast<Box<dyn #supertraits>> for Box<dyn #trait_ident> {}
        )*

        #value_debug_impl
    };
    expanded.into()
}
