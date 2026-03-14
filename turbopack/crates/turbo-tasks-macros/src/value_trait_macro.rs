use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{ToTokens, quote, quote_spanned};
use syn::{
    FnArg, ItemTrait, Pat, Receiver, TraitItem, TraitItemFn, parse_macro_input, spanned::Spanned,
};

use crate::{
    func::{
        DefinitionContext, FunctionArguments, NativeFn, TurboFn, filter_inline_attributes,
        get_receiver_style, split_function_attributes,
    },
    global_name::{global_name_for_trait_method, global_name_for_type},
    ident::{get_trait_default_impl_function_ident, get_trait_type_ident},
    self_filter::is_self_used,
    value_trait_arguments::ValueTraitArguments,
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
    let mut dynamic_trait_fns = Vec::new();
    let mut trait_methods: Vec<TokenStream2> = Vec::new();
    let mut method_names: Vec<TokenStream2> = Vec::new();
    let mut default_methods: Vec<TokenStream2> = Vec::new();
    let mut native_functions = Vec::new();
    let mut items: Vec<TokenStream2> = Vec::with_capacity(raw_items.len());
    let mut errors = Vec::new();

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
        // This effectively parses and removes the function annotation ensuring that that macro
        // doesn't run after us.
        let (func_args, attrs) = split_function_attributes(attrs);
        let func_args = match func_args {
            Ok(None) => {
                // There is no turbo_tasks::function annotation, preserve this item as is in the
                // trait
                items.push(item.to_token_stream());
                // But we still need to add a forwarding implementation to the
                // impl for `turbo_tasks::Dynamic<Box<dyn T>>`
                // This will have the same signature, but simply forward the call
                let mut args = Vec::new();
                let mut is_vc_receiver = false;
                for arg in &sig.inputs {
                    let ident = match arg {
                        FnArg::Receiver(Receiver { ty, .. }) => {
                            match get_receiver_style(ty, &DefinitionContext::ValueTrait) {
                                crate::func::ReceiverStyle::Reference => {
                                    is_vc_receiver = false;
                                }
                                crate::func::ReceiverStyle::Vc => {
                                    is_vc_receiver = true;
                                }
                                crate::func::ReceiverStyle::Error => {}
                            }
                            // We allow either `&self` or `self: Vc<Self>`
                            // we cannot really validate Vc<Self> so instead we simply assume that
                            // any type that isn't a reference is Vc<Self>
                            continue;
                        }
                        FnArg::Typed(pat) => match &*pat.pat {
                            Pat::Ident(pat_ident) => &pat_ident.ident,
                            // We could support more complex patterns without too much effort just
                            // as we do for normal functions.  For now we just disallow them.
                            _ => {
                                pat.span()
                                    .unwrap()
                                    .error("can only support simple patterns")
                                    .emit();
                                continue;
                            }
                        },
                    };
                    args.push(ident);
                }
                if is_vc_receiver {
                    item.span()
                        .unwrap()
                        .error(
                            "`self: Vc<Self>` is only supported on trait items with a \
                             `turbo-tasks::function` annotation",
                        )
                        .emit();
                }
                // Add a dummy implementation that derefences the box and delegates to the
                // actual implementation.  We need to conditionally add an await if it is async
                dynamic_trait_fns.push(if sig.asyncness.is_some() {
                    quote! {
                        #sig {
                            let reference: &dyn #trait_ident = &*self;
                            reference.#ident(#(#args),*).await
                        }
                    }
                } else {
                    quote! {
                        #sig {
                            let reference: &dyn #trait_ident = &*self;
                            reference.#ident(#(#args),*)
                        }
                    }
                });
                continue;
            }
            Ok(Some(func_args)) => func_args,
            Err(err) => {
                errors.push(err.to_compile_error());
                continue;
            }
        };

        if let Some(span) = func_args.operation {
            span.unwrap()
                .error("trait items cannot be operations")
                .emit();
        }

        let is_self_used = default.as_ref().map(is_self_used).unwrap_or(false);
        let Some(turbo_fn) = TurboFn::new(
            sig,
            DefinitionContext::ValueTrait,
            FunctionArguments::default(),
            is_self_used,
        ) else {
            return quote! {
                // An error occurred while parsing the function signature.
            }
            .into();
        };

        let turbo_signature = turbo_fn.signature();
        let dynamic_block = turbo_fn.dynamic_block(&trait_type_ident);
        dynamic_trait_fns.push(quote! {
            #turbo_signature #dynamic_block
        });

        let default_block = if let Some(default) = default {
            let inline_function_ident = turbo_fn.inline_ident();
            let inline_extension_trait_ident =
                Ident::new(&format!("{trait_ident}_{ident}_inline"), ident.span());
            let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(default);
            let inline_attrs = filter_inline_attributes(attrs.iter().copied());

            let function_path_string = format!("{trait_ident}::{ident}");
            let native_function = NativeFn {
                function_global_name: global_name_for_trait_method(trait_ident, ident),
                function_path_string,
                function_path: quote! {
                    <Box<dyn #trait_ident> as #inline_extension_trait_ident>::#inline_function_ident
                },
                is_method: turbo_fn.is_method(),
                is_self_used,
                filter_trait_call_args: turbo_fn.filter_trait_call_args(),
                is_root: false,
            };

            let native_function_ident = get_trait_default_impl_function_ident(trait_ident, ident);
            let native_function_ty = native_function.ty();
            let native_function_def = native_function.definition();

            let method_name_str = syn::LitStr::new(&ident.to_string(), ident.span());
            let index = trait_methods.len() as u8;
            trait_methods.push(quote! {
                #method_name_str => turbo_tasks::TraitMethod {
                    trait_type: &#trait_type_ident,
                    trait_name: stringify!(#trait_ident),
                    method_name: #method_name_str,
                    default_method: Some(&#native_function_ident),
                    index: #index,
                },
            });
            method_names.push(quote! { #method_name_str });
            default_methods.push(quote! { Some(&#native_function_ident) });

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

                turbo_tasks::macro_helpers::turbo_register!(
                    #native_function_ident: #native_function_ty = #native_function_def
                );
            });

            turbo_fn.static_block(&native_function_ident)
        } else {
            let method_name_str = syn::LitStr::new(&ident.to_string(), ident.span());
            let index = trait_methods.len() as u8;
            trait_methods.push(quote! {
                #method_name_str => turbo_tasks::TraitMethod {
                    trait_type: &#trait_type_ident,
                    trait_name: stringify!(#trait_ident),
                    method_name: #method_name_str,
                    default_method: None,
                    index: #index,
                },
            });
            method_names.push(quote! { #method_name_str });
            default_methods.push(quote! { None });
            quote! { ; }
        };

        let trait_sig = turbo_fn.trait_signature();
        items.push(quote! {
            #(#attrs)*
            #trait_sig #default_block
        });
    }

    let value_debug_impl = if debug {
        quote! {
            #[automatically_derived]
            unsafe impl turbo_tasks::Dynamic<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
            #[automatically_derived]
            unsafe impl turbo_tasks::Upcast<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
            #[automatically_derived]
            unsafe impl turbo_tasks::UpcastStrict<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
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

    let num_methods = method_names.len();
    let trait_name = global_name_for_type(quote! { dyn #trait_ident });
    let expanded = quote! {
        #[must_use]
        #(#attrs)*
        #vis #trait_token #trait_ident: #(#supertraits +)* #(#extended_supertraits +)*
        {
            #(#items)*
        }

        #(#native_functions)*

        turbo_tasks::macro_helpers::turbo_register!(
            Box<dyn #trait_ident> => #trait_type_ident: turbo_tasks::TraitType = {
                use turbo_tasks::macro_helpers::{phf, phf::phf_map};
                turbo_tasks::TraitType::new::<&'static dyn #trait_ident>(
                    stringify!(#trait_ident),
                    #trait_name,
                    phf_map! {
                        #(#trait_methods)*
                    },
                    &[#(#method_names),*],
                    &[#(#default_methods),*]
                )
            }
        );

        impl turbo_tasks::macro_helpers::TraitVtablePrototype for Box<dyn #trait_ident> {
            const LEN: usize = #num_methods;
            const NAMES: &[&str] = &[#(#method_names),*];
            const DEFAULTS: &[Option<&turbo_tasks::macro_helpers::NativeFunction>] = &[#(#default_methods),*];
        }

        #[automatically_derived]
        impl turbo_tasks::VcValueTrait for Box<dyn #trait_ident> {
            type ValueTrait = dyn #trait_ident;

            fn get_trait_type_id() -> turbo_tasks::TraitTypeId {
                turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)
            }

            // TODO: Remove this Lazy VTableRegistry once trait resolution is fully migrated
            fn get_impl_vtables() -> &'static turbo_tasks::macro_helpers::VTableRegistry<Self::ValueTrait> {
                static registry: turbo_tasks::macro_helpers::Lazy<turbo_tasks::macro_helpers::VTableRegistry<dyn # trait_ident>> =
                    turbo_tasks::macro_helpers::Lazy::new(|| turbo_tasks::macro_helpers::VTableRegistry::new(turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)));

                &*registry
            }
        }

        #[automatically_derived]
        unsafe impl turbo_tasks::Dynamic<Box<dyn #trait_ident>> for Box<dyn #trait_ident> {}
        #[automatically_derived]
        unsafe impl turbo_tasks::Upcast<Box<dyn #trait_ident>> for Box<dyn #trait_ident> {}

        #[automatically_derived]
        impl<T> #trait_ident for T
        where
            T: turbo_tasks::Dynamic<Box<dyn #trait_ident>> + #(#supertraits +)* #(#extended_supertraits +)*,
        {
            #(#dynamic_trait_fns)*
        }

        #(
            #[automatically_derived]
            unsafe impl turbo_tasks::Dynamic<Box<dyn #supertraits>> for Box<dyn #trait_ident> {}
            #[automatically_derived]
            unsafe impl turbo_tasks::Upcast<Box<dyn #supertraits>> for Box<dyn #trait_ident> {}
            #[automatically_derived]
            unsafe impl turbo_tasks::UpcastStrict<Box<dyn #supertraits>> for Box<dyn #trait_ident> {
            }
        )*

        #value_debug_impl

        #(#errors)*
    };
    expanded.into()
}
