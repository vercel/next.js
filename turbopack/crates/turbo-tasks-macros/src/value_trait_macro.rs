use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{quote, quote_spanned};
use syn::{
    FnArg, ItemTrait, Pat, Receiver, TraitItem, TraitItemFn, parse_macro_input, parse_quote,
    spanned::Spanned,
};
use turbo_tasks_macros_shared::{
    ValueTraitArguments, get_trait_default_impl_function_ident, get_trait_type_ident, is_self_used,
};

use crate::{
    func::{
        DefinitionContext, FunctionArguments, NativeFn, TurboFn, filter_inline_attributes,
        get_receiver_style, split_function_attributes,
    },
    global_name::global_name,
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
    let mut native_functions = Vec::new();
    let mut items = Vec::with_capacity(raw_items.len());
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
                items.push(item.clone());
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
        let dynamic_block = turbo_fn.dynamic_block(&trait_type_ident);
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
            let inline_attrs = filter_inline_attributes(attrs.iter().copied());

            let function_path_string = format!("{trait_ident}::{ident}");
            let native_function = NativeFn {
                function_global_name: global_name(&function_path_string),
                function_path_string,
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

            trait_methods.push(quote! {
                (stringify!(#ident), Some(&#native_function_ident)),
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

                static #native_function_ident:
                    turbo_tasks::macro_helpers::Lazy<#native_function_ty> =
                        turbo_tasks::macro_helpers::Lazy::new(|| #native_function_def);

                // Register the function for deserialization
                turbo_tasks::macro_helpers::inventory_submit! {
                    turbo_tasks::macro_helpers::CollectableFunction(&#native_function_ident)
                }
            });

            Some(turbo_fn.static_block(&native_function_ident))
        } else {
            trait_methods.push(quote! {
                (stringify!(#ident), None),
            });
            None
        };

        items.push(TraitItem::Fn(TraitItemFn {
            sig: turbo_fn.trait_signature(),
            default,
            attrs: attrs.iter().map(|a| (*a).clone()).collect(),
            semi_token: Default::default(),
        }));
    }

    let value_debug_impl = if debug {
        quote! {
            unsafe impl turbo_tasks::Dynamic<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
            unsafe impl turbo_tasks::Upcast<Box<dyn turbo_tasks::debug::ValueDebug>> for Box<dyn #trait_ident> {}
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

    let trait_name = global_name(quote! {stringify!(#trait_ident)});
    let expanded = quote! {
        #[must_use]
        #(#attrs)*
        #vis #trait_token #trait_ident: #(#supertraits +)* #(#extended_supertraits +)*
        {
            #(#items)*
        }

        #(#native_functions)*

        static #trait_type_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitType> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                turbo_tasks::TraitType::new(
                    stringify!(#trait_ident),
                    #trait_name,
                    vec![#(#trait_methods)*])
            });

        // Register the trait for deserialization
        turbo_tasks::macro_helpers::inventory_submit! {
            turbo_tasks::macro_helpers::CollectableTrait(&#trait_type_ident)
        }

        impl turbo_tasks::VcValueTrait for Box<dyn #trait_ident> {
            type ValueTrait = dyn #trait_ident;

            fn get_trait_type_id() -> turbo_tasks::TraitTypeId {
                static ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitTypeId> =
                    turbo_tasks::macro_helpers::Lazy::new(|| {
                        turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)
                    });

                *ident
            }

            fn get_impl_vtables() -> &'static turbo_tasks::macro_helpers::VTableRegistry<Self::ValueTrait> {
                static registry: turbo_tasks::macro_helpers::Lazy<turbo_tasks::macro_helpers::VTableRegistry<dyn # trait_ident>> =
                    turbo_tasks::macro_helpers::Lazy::new(|| turbo_tasks::macro_helpers::VTableRegistry::new(turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)));

                &*registry
            }
        }

        unsafe impl turbo_tasks::Dynamic<Box<dyn #trait_ident>> for Box<dyn #trait_ident> {}
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
            unsafe impl turbo_tasks::UpcastStrict<Box<dyn #supertraits>> for Box<dyn #trait_ident> {
            }
        )*

        #value_debug_impl

        #(#errors)*
    };
    expanded.into()
}
