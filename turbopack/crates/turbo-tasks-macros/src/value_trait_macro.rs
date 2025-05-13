use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{quote, quote_spanned};
use syn::{
    Attribute, ItemTrait, TraitItem, TraitItemFn, parse_macro_input, parse_quote, spanned::Spanned,
};
use turbo_tasks_macros_shared::{
    ValueTraitArguments, get_trait_default_impl_function_id_ident,
    get_trait_default_impl_function_ident, get_trait_type_id_ident, get_trait_type_ident,
    is_self_used,
};

use crate::{
    func::{
        DefinitionContext, FunctionArguments, NativeFn, TurboFn, filter_inline_attributes,
        parse_with_optional_parens,
    },
    value_impl_macro::is_attribute,
};

pub fn value_trait(args: TokenStream, input: TokenStream) -> TokenStream {
    let ValueTraitArguments { debug, operation } = parse_macro_input!(args as ValueTraitArguments);

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
        restriction: _,
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
    let mut trait_methods: Vec<TokenStream2> = Vec::new();
    let mut native_functions = Vec::new();
    let mut items = Vec::with_capacity(raw_items.len());

    for item in raw_items.iter() {
        let TraitItem::Fn(TraitItemFn {
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

        let func_attr = {
            let func_args: Vec<&Attribute> = attrs
                .iter()
                .filter(|a| is_attribute(a, "function"))
                .collect();
            if func_args.is_empty() {
                item.span()
                    .unwrap()
                    .error("value_trait items must be annotated with #[turbo_tasks::function]")
                    .emit();
                continue;
            }
            if func_args.len() > 1 {
                // annotate the second one
                func_args[1]
                    .span()
                    .unwrap()
                    .error("only one #[turbo_tasks::function]")
                    .emit();
                continue;
            }
            func_args[0]
        };
        let args = match parse_with_optional_parens::<FunctionArguments>(func_attr) {
            Ok(args) => args,
            Err(err) => {
                err.span().unwrap().error("").emit();
                continue;
            }
        };
        if !args.is_default() {
            func_attr
                .span()
                .unwrap()
                .error("turbo_task functions in value_traits cannot be parameterized")
                .emit();
            continue;
        }

        let Some(turbo_fn) = TurboFn::new(
            sig,
            DefinitionContext::ValueTrait,
            FunctionArguments::default(),
        ) else {
            return quote! {
                // An error occurred while parsing the function signature.
            }
            .into();
        };

        let turbo_signature = turbo_fn.signature();
        let arg_types = turbo_fn.exposed_input_types();
        let dynamic_block = turbo_fn.dynamic_block(&trait_type_id_ident);
        dynamic_trait_fns.push(quote! {
            #turbo_signature #dynamic_block
        });

        let default = if let Some(default) = default {
            let is_self_used = is_self_used(default);
            let inline_function_ident = turbo_fn.inline_ident();
            let inline_extension_trait_ident =
                Ident::new(&format!("{trait_ident}_{ident}_inline"), ident.span());
            let (inline_signature, inline_block) =
                turbo_fn.inline_signature_and_block(default, is_self_used);
            let inline_attrs = filter_inline_attributes(&attrs[..]);

            let native_function = NativeFn {
                function_path_string: format!("{trait_ident}::{ident}"),
                function_path: parse_quote! {
                    <Box<dyn #trait_ident> as #inline_extension_trait_ident>::#inline_function_ident
                },
                is_method: turbo_fn.is_method(),
                is_self_used,
                filter_trait_call_args: turbo_fn.filter_trait_call_args(),
                // `local` is currently unsupported here because:
                // - The `#[turbo_tasks::function]` macro needs to be present for us to read this
                //   argument. (This could be fixed)
                // - This only makes sense when a default implementation is present.
                local: false,
            };

            let native_function_ident = get_trait_default_impl_function_ident(trait_ident, ident);
            let native_function_ty = native_function.ty();
            let native_function_def = native_function.definition();

            let native_function_id_ident =
                get_trait_default_impl_function_id_ident(trait_ident, ident);
            let native_function_id_ty = native_function.id_ty();
            let native_function_id_def =
                native_function.id_definition(&native_function_ident.clone().into());

            trait_methods.push(quote! {
                trait_type.register_default_trait_method::<(#(#arg_types,)*)>(stringify!(#ident).into(), *#native_function_id_ident);
            });

            native_functions.push(quote! {
                #[doc(hidden)]
                #[allow(non_camel_case_types)]
                trait #inline_extension_trait_ident: std::marker::Send {
                    #(#inline_attrs)*
                    #inline_signature;
                }

                #[doc(hidden)]
                // Needs to be explicit 'static here, otherwise we can get a lifetime error
                // in the inline signature.
                impl #inline_extension_trait_ident for Box<dyn #trait_ident> {
                    // put the function body here so that `Self` points to `Box<dyn ...>`
                    #(#inline_attrs)*
                    #inline_signature #inline_block
                }

                #[doc(hidden)]
                pub(crate) static #native_function_ident:
                    turbo_tasks::macro_helpers::Lazy<#native_function_ty> =
                        turbo_tasks::macro_helpers::Lazy::new(|| #native_function_def);
                #[doc(hidden)]
                pub(crate) static #native_function_id_ident:
                    turbo_tasks::macro_helpers::Lazy<#native_function_id_ty> =
                        turbo_tasks::macro_helpers::Lazy::new(|| #native_function_id_def);
            });

            Some(turbo_fn.static_block(&native_function_id_ident))
        } else {
            trait_methods.push(quote! {
                trait_type.register_trait_method::<(#(#arg_types,)*)>(stringify!(#ident).into());
            });
            None
        };

        items.push(TraitItem::Fn(TraitItemFn {
            sig: turbo_fn.trait_signature(),
            default,
            attrs: attrs.clone(),
            semi_token: Default::default(),
        }));
    }

    let value_debug_impl = if debug {
        quote! {
            unsafe impl turbo_tasks::Dynamic<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
            unsafe impl turbo_tasks::Upcast<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
        }
    } else {
        quote! {}
    };

    let mut extended_supertraits = vec![
        quote!(::std::marker::Send),
        quote!(::std::marker::Sync),
        quote!(turbo_tasks::NonLocalValue),
    ];
    if let Some(span) = operation {
        extended_supertraits.push(quote_spanned! {
            span => turbo_tasks::OperationValue
        });
    }
    if debug {
        extended_supertraits.push(quote!(turbo_tasks::debug::ValueDebug));
    }

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
                #(#trait_methods)*
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
