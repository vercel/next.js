use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{ToTokens, quote};
use syn::{
    Error, Expr, ExprLit, Generics, ImplItem, ImplItemFn, ItemImpl, Lit, LitStr, Meta,
    MetaNameValue, Path, Token, Type,
    parse::{Parse, ParseStream},
    parse_macro_input,
    spanned::Spanned,
};

use crate::{
    func::{
        DefinitionContext, FunctionArguments, NativeFn, TurboFn, filter_inline_attributes,
        split_function_attributes,
    },
    global_name::{global_name_for_method, global_name_for_trait_method_impl},
    ident::{
        get_inherent_impl_function_ident, get_path_ident, get_trait_impl_function_ident,
        get_type_ident, get_vtable_register_fn_ident,
    },
    self_filter::is_self_used,
};

struct ValueImplArguments {
    ident: Option<LitStr>,
}

impl Parse for ValueImplArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut result = ValueImplArguments { ident: None };
        let punctuated = input.parse_terminated(Meta::parse, Token![,])?;
        for meta in punctuated {
            match (
                meta.path()
                    .get_ident()
                    .map(ToString::to_string)
                    .as_deref()
                    .unwrap_or_default(),
                meta,
            ) {
                (
                    "ident",
                    Meta::NameValue(MetaNameValue {
                        value:
                            Expr::Lit(ExprLit {
                                lit: Lit::Str(lit), ..
                            }),
                        ..
                    }),
                ) => {
                    result.ident = Some(lit);
                }
                (_, meta) => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!("unexpected {meta:?}, expected \"ident\""),
                    ));
                }
            }
        }

        Ok(result)
    }
}

pub fn value_impl(args: TokenStream, input: TokenStream) -> TokenStream {
    let ValueImplArguments { ident } = parse_macro_input!(args as ValueImplArguments);

    fn inherent_value_impl(ty: &Type, ty_ident: &Ident, items: &[ImplItem]) -> TokenStream2 {
        let mut all_definitions = Vec::new();
        let mut exposed_impl_items = Vec::new();
        let mut errors = Vec::new();

        for item in items.iter() {
            let ImplItem::Fn(ImplItemFn {
                attrs,
                vis,
                defaultness: _,
                sig,
                block,
            }) = item
            else {
                continue;
            };

            let ident = &sig.ident;
            let (func_args, attrs) = split_function_attributes(attrs);
            let func_args = match func_args {
                Ok(None) => {
                    item.span()
                        .unwrap()
                        .error("#[turbo_tasks::function] attribute missing")
                        .emit();
                    FunctionArguments::default()
                }
                Ok(Some(func_args)) => func_args,
                Err(error) => {
                    errors.push(error.to_compile_error());
                    FunctionArguments::default()
                }
            };
            let is_self_used = func_args.operation.is_some() || is_self_used(block);
            let is_root = func_args.root.is_some();

            let Some(turbo_fn) = TurboFn::new(
                sig,
                DefinitionContext::ValueInherentImpl,
                func_args,
                is_self_used,
            ) else {
                return quote! {
                    // An error occurred while parsing the function signature.
                };
            };
            let inline_function_ident = turbo_fn.inline_ident();
            let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(block);
            let inline_attrs = filter_inline_attributes(attrs.iter().copied());
            let native_fn = NativeFn {
                function_global_name: global_name_for_method(ty, ident),
                function_path_string: format!("{ty}::{ident}", ty = ty.to_token_stream()),
                function_path: quote! { <#ty>::#inline_function_ident },
                is_method: turbo_fn.is_method(),
                is_self_used,
                filter_trait_call_args: None, // not a trait method
                is_root,
            };

            let native_function_ident = get_inherent_impl_function_ident(ty_ident, ident);
            let native_function_ty = native_fn.ty();
            let native_function_def = native_fn.definition();

            let turbo_signature = turbo_fn.signature();
            let turbo_block = turbo_fn.static_block(&native_function_ident);
            exposed_impl_items.push(quote! {
                #(#attrs)*
                #vis #turbo_signature #turbo_block
            });

            all_definitions.push(quote! {
                    #[doc(hidden)]
                    impl #ty {
                        // By declaring the native function's body within an `impl` block, we ensure
                        // that `Self` refers to `#ty`. This is necessary because the function's
                        // body is originally declared within an `impl` block already.
                        #(#inline_attrs)*
                        #[doc(hidden)]
                        #[deprecated(note = "This function is only exposed for use in macros. Do not call it directly.")]
                        pub(self) #inline_signature #inline_block
                    }

                    turbo_tasks::macro_helpers::turbo_register!(
                        #native_function_ident: #native_function_ty = #native_function_def
                    );
                })
        }

        quote! {
            impl #ty {
                #(#exposed_impl_items)*
            }

            #(#all_definitions)*
            #(#errors)*
        }
    }

    fn trait_value_impl(
        ty: &Type,
        generics: &Generics,
        ty_ident: &Ident,
        trait_path: &Path,
        items: &[ImplItem],
    ) -> TokenStream2 {
        let trait_ident = get_path_ident(trait_path);
        let vtable_register_ident = get_vtable_register_fn_ident(ty_ident, &trait_ident);

        let (impl_generics, _, where_clause) = generics.split_for_impl();

        let mut trait_methods = Vec::new();
        let mut trait_functions = Vec::with_capacity(items.len());
        let mut trait_items = Vec::new();
        let mut all_definitions = Vec::with_capacity(items.len());
        let mut errors = Vec::new();

        for item in items.iter() {
            if let ImplItem::Fn(ImplItemFn {
                sig, attrs, block, ..
            }) = item
            {
                let ident = &sig.ident;

                let (func_args, attrs) = split_function_attributes(attrs);
                let func_args = match func_args {
                    Ok(None) => {
                        // Missing annotations are allowed if a turbo tasks trait has a trait item
                        // that is not a turbo tasks function.
                        trait_items.push(item);
                        continue;
                    }
                    Ok(Some(func_args)) => func_args,
                    Err(error) => {
                        errors.push(error.to_compile_error());
                        continue;
                    }
                };
                // operations are not currently compatible with methods
                let is_self_used = func_args.operation.is_some() || is_self_used(block);
                let is_root = func_args.root.is_some();

                let Some(turbo_fn) = TurboFn::new(
                    sig,
                    DefinitionContext::ValueTraitImpl,
                    func_args,
                    is_self_used,
                ) else {
                    return quote! {
                        // An error occurred while parsing the function signature.
                    };
                };

                let inline_function_ident = turbo_fn.inline_ident();
                let inline_extension_trait_ident = Ident::new(
                    &format!("{ty_ident}_{trait_ident}_{ident}_inline"),
                    ident.span(),
                );
                let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(block);
                let inline_attrs = filter_inline_attributes(attrs.iter().copied());
                let native_fn = NativeFn {
                    function_global_name: global_name_for_trait_method_impl(ty, trait_path, ident),
                    function_path_string: format!(
                        "<{ty} as {trait_path}>::{ident}",
                        ty = ty.to_token_stream(),
                        trait_path = trait_path.to_token_stream()
                    ),
                    function_path: quote! {
                        <#ty as #inline_extension_trait_ident>::#inline_function_ident
                    },
                    is_method: turbo_fn.is_method(),
                    is_self_used,
                    filter_trait_call_args: turbo_fn.filter_trait_call_args(),
                    is_root,
                };

                let native_function_ident =
                    get_trait_impl_function_ident(ty_ident, &trait_ident, ident);
                let native_function_ty = native_fn.ty();
                let native_function_def = native_fn.definition();

                let turbo_signature = turbo_fn.signature();
                let turbo_block = turbo_fn.static_block(&native_function_ident);

                trait_functions.push(quote! {
                    #(#attrs)*
                    #turbo_signature #turbo_block
                });

                all_definitions.push(quote! {
                    #[doc(hidden)]
                    #[allow(non_camel_case_types)]
                    trait #inline_extension_trait_ident: std::marker::Send {
                        #(#inline_attrs)*
                        #[doc(hidden)]
                        #inline_signature;
                    }

                    #[doc(hidden)]
                    impl #impl_generics #inline_extension_trait_ident for #ty #where_clause  {
                        #(#inline_attrs)*
                        #[doc(hidden)]
                        #[deprecated(note = "This function is only exposed for use in macros. Do not call it directly.")]
                        #inline_signature #inline_block
                    }

                    turbo_tasks::macro_helpers::turbo_register!(
                        #native_function_ident: #native_function_ty = #native_function_def
                    );
                });

                let method_name_str = syn::LitStr::new(&ident.to_string(), ident.span());
                trait_methods.push(quote! {
                    (#method_name_str, &#native_function_ident)
                });
            }
        }
        quote! {
            // Register all the function impls so the ValueType can find them
            // This means objects resolve as
            // 1 NativeFunctions
            // 2 TraitTypes (requires functions)
            // 3 ValueTypes (requires functions and TraitTypeIds)
            // 4.VTableRegistries (requires ValueTypeIds)
            turbo_tasks::macro_helpers::inventory_submit!{{
                const LEN: usize = <::std::boxed::Box<dyn #trait_path> as turbo_tasks::macro_helpers::TraitVtablePrototype>::LEN;
                static METHODS: [&turbo_tasks::macro_helpers::NativeFunction; LEN] = turbo_tasks::macro_helpers::build_trait_vtable::<::std::boxed::Box<dyn #trait_path>, LEN>(&[#(#trait_methods),*]);

                turbo_tasks::macro_helpers::CollectableTraitMethods {
                    value_type: <#ty as turbo_tasks::macro_helpers::RegistryDef::<turbo_tasks::ValueType>>::DEF,
                    trait_type: <::std::boxed::Box<dyn #trait_path> as turbo_tasks::macro_helpers::RegistryDef::<turbo_tasks::TraitType>>::DEF,
                    methods: &METHODS,
                    finalize_vtable_registry: || {
                        <::std::boxed::Box<dyn #trait_path> as turbo_tasks::VcValueTrait>::IMPL_VTABLES
                            .finalize();
                    },
                }
            }}

            // Queue this `impl Trait for Concrete` into the trait's `VTableRegistry` at program
            // load. The ctor runs before `ValueType` ids are assigned, so it just appends to a
            // `Vec`; the map keyed by `ValueTypeId` is built lazily inside the `VALUES`
            // `LazyLock` initializer (via `CollectableTraitMethods::finalize_vtable_registry`).
            // The vtable pointer is materialized at compile time via the null-fat-ptr trick, so
            // there's no runtime `transmute` or indirect fn call.
            #[turbo_tasks::macro_helpers::ctor::ctor(
                crate_path = turbo_tasks::macro_helpers::ctor,
            )]
            #[allow(non_snake_case)]
            fn #vtable_register_ident() {
                <::std::boxed::Box<dyn #trait_path> as turbo_tasks::VcValueTrait>::IMPL_VTABLES
                    .register(
                        <#ty as turbo_tasks::macro_helpers::RegistryDef::<turbo_tasks::ValueType>>::DEF,
                        {
                            let p: *const #ty = ::std::ptr::null();
                            // This attaches a fat pointer to the null pointer.
                            let fat: *const dyn #trait_path = p;
                            fat
                        },
                    );
            }

            // NOTE(alexkirsz) We can't have a general `turbo_tasks::Upcast<Box<dyn Trait>> for T where T: Trait` because
            // rustc complains: error[E0210]: type parameter `T` must be covered by another type when it appears before
            // the first local type (`dyn Trait`).
            #[automatically_derived]
            unsafe impl #impl_generics turbo_tasks::Upcast<::std::boxed::Box<dyn #trait_path>> for #ty #where_clause {}
            #[automatically_derived]
            unsafe impl #impl_generics turbo_tasks::UpcastStrict<::std::boxed::Box<dyn #trait_path>> for #ty #where_clause {}

            impl #impl_generics #trait_path for #ty #where_clause {
                #(#trait_items)*
                #(#trait_functions)*
            }

            #(#all_definitions)*
            #(#errors)*
        }
    }

    let item = parse_macro_input!(input as ItemImpl);

    let Some(ty_ident) = ident
        .map(|ident| Ident::new(&ident.value(), ident.span()))
        .or_else(|| get_type_ident(&item.self_ty))
    else {
        return quote! {
            // An error occurred while parsing the type.
        }
        .into();
    };

    match &item.trait_ {
        None => inherent_value_impl(&item.self_ty, &ty_ident, &item.items).into(),
        Some((_, trait_path, _)) => trait_value_impl(
            &item.self_ty,
            &item.generics,
            &ty_ident,
            trait_path,
            &item.items,
        )
        .into(),
    }
}
