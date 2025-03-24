use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::{quote, ToTokens};
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, parse_quote,
    punctuated::Punctuated,
    spanned::Spanned,
    Attribute, Error, Generics, ImplItem, ImplItemMethod, ItemImpl, Lit, LitStr, Meta,
    MetaNameValue, Path, Result, Token, Type,
};
use turbo_tasks_macros_shared::{
    get_inherent_impl_function_id_ident, get_inherent_impl_function_ident, get_path_ident,
    get_register_trait_methods_ident, get_trait_impl_function_id_ident,
    get_trait_impl_function_ident, get_type_ident,
};

use crate::func::{
    filter_inline_attributes, DefinitionContext, FunctionArguments, MaybeParenthesized, NativeFn,
    TurboFn,
};

fn is_attribute(attr: &Attribute, name: &str) -> bool {
    let path = &attr.path;
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident == "turbo_tasks" => match iter.next() {
            Some(seg) if seg.arguments.is_empty() && seg.ident == name => iter.next().is_none(),
            _ => false,
        },
        _ => false,
    }
}

fn split_function_attributes<'a>(
    item: &'a ImplItem,
    attrs: &'a [Attribute],
) -> (syn::Result<FunctionArguments>, Vec<&'a Attribute>) {
    let (func_attrs_vec, attrs): (Vec<_>, Vec<_>) = attrs
        .iter()
        // TODO(alexkirsz) Replace this with function
        .partition(|attr| is_attribute(attr, "function"));
    let func_args = if let Some(func_attr) = func_attrs_vec.first() {
        if func_attrs_vec.len() == 1 {
            syn::parse2::<MaybeParenthesized<FunctionArguments>>(func_attr.tokens.clone())
                .map(|a| a.parenthesized.map(|a| a.inner).unwrap_or_default())
        } else {
            Err(syn::Error::new(
                func_attr.span(),
                "Only one #[turbo_tasks::function] attribute is allowed per method",
            ))
        }
    } else {
        Err(syn::Error::new(
            item.span(),
            "#[turbo_tasks::function] attribute missing",
        ))
    };
    (func_args, attrs)
}

struct ValueImplArguments {
    ident: Option<LitStr>,
}

impl Parse for ValueImplArguments {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = ValueImplArguments { ident: None };
        let punctuated: Punctuated<Meta, Token![,]> = input.parse_terminated(Meta::parse)?;
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
                        lit: Lit::Str(lit), ..
                    }),
                ) => {
                    result.ident = Some(lit);
                }
                (_, meta) => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!("unexpected {:?}, expected \"ident\"", meta),
                    ))
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
            if let ImplItem::Method(ImplItemMethod {
                attrs,
                vis,
                defaultness: _,
                sig,
                block,
            }) = item
            {
                let ident = &sig.ident;
                let (func_args, attrs) = split_function_attributes(item, attrs);
                let func_args = func_args
                    .inspect_err(|err| errors.push(err.to_compile_error()))
                    .unwrap_or_default();
                let local = func_args.local.is_some();

                let Some(turbo_fn) =
                    TurboFn::new(sig, DefinitionContext::ValueInherentImpl, func_args)
                else {
                    return quote! {
                        // An error occurred while parsing the function signature.
                    };
                };
                let inline_function_ident = turbo_fn.inline_ident();
                let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(block);
                let inline_attrs = filter_inline_attributes(attrs.iter().copied());

                let native_fn = NativeFn {
                    function_path_string: format!("{ty}::{ident}", ty = ty.to_token_stream()),
                    function_path: parse_quote! { <#ty>::#inline_function_ident },
                    is_method: turbo_fn.is_method(),
                    filter_trait_call_args: None, // not a trait method
                    local,
                };

                let native_function_ident = get_inherent_impl_function_ident(ty_ident, ident);
                let native_function_ty = native_fn.ty();
                let native_function_def = native_fn.definition();

                let native_function_id_ident = get_inherent_impl_function_id_ident(ty_ident, ident);
                let native_function_id_ty = native_fn.id_ty();
                let native_function_id_def =
                    native_fn.id_definition(&native_function_ident.clone().into());

                let turbo_signature = turbo_fn.signature();
                let turbo_block = turbo_fn.static_block(&native_function_id_ident);
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

                    #[doc(hidden)]
                    pub(crate) static #native_function_ident:
                        turbo_tasks::macro_helpers::Lazy<#native_function_ty> =
                            turbo_tasks::macro_helpers::Lazy::new(|| #native_function_def);
                    #[doc(hidden)]
                    pub(crate) static #native_function_id_ident:
                        turbo_tasks::macro_helpers::Lazy<#native_function_id_ty> =
                            turbo_tasks::macro_helpers::Lazy::new(|| #native_function_id_def);
                })
            }
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

        let (impl_generics, _, where_clause) = generics.split_for_impl();

        let register = get_register_trait_methods_ident(&trait_ident, ty_ident);

        let mut trait_registers = Vec::new();
        let mut trait_functions = Vec::with_capacity(items.len());
        let mut all_definitions = Vec::with_capacity(items.len());
        let mut errors = Vec::new();

        for item in items.iter() {
            if let ImplItem::Method(ImplItemMethod {
                sig, attrs, block, ..
            }) = item
            {
                let ident = &sig.ident;

                let (func_args, attrs) = split_function_attributes(item, attrs);
                let func_args = func_args
                    .inspect_err(|err| errors.push(err.to_compile_error()))
                    .unwrap_or_default();
                let local = func_args.local.is_some();

                let Some(turbo_fn) =
                    TurboFn::new(sig, DefinitionContext::ValueTraitImpl, func_args)
                else {
                    return quote! {
                        // An error occurred while parsing the function signature.
                    };
                };

                let inline_function_ident = turbo_fn.inline_ident();
                let inline_extension_trait_ident = Ident::new(
                    &format!("{}_{}_{}_inline", ty_ident, trait_ident, ident),
                    ident.span(),
                );
                let (inline_signature, inline_block) = turbo_fn.inline_signature_and_block(block);
                let inline_attrs = filter_inline_attributes(attrs.iter().copied());

                let native_fn = NativeFn {
                    function_path_string: format!(
                        "<{ty} as {trait_path}>::{ident}",
                        ty = ty.to_token_stream(),
                        trait_path = trait_path.to_token_stream()
                    ),
                    function_path: parse_quote! {
                        <#ty as #inline_extension_trait_ident>::#inline_function_ident
                    },
                    is_method: turbo_fn.is_method(),
                    filter_trait_call_args: turbo_fn.filter_trait_call_args(),
                    local,
                };

                let native_function_ident =
                    get_trait_impl_function_ident(ty_ident, &trait_ident, ident);
                let native_function_ty = native_fn.ty();
                let native_function_def = native_fn.definition();

                let native_function_id_ident =
                    get_trait_impl_function_id_ident(ty_ident, &trait_ident, ident);
                let native_function_id_ty = native_fn.id_ty();
                let native_function_id_def =
                    native_fn.id_definition(&native_function_ident.clone().into());

                let turbo_signature = turbo_fn.signature();
                let turbo_block = turbo_fn.static_block(&native_function_id_ident);

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

                    #[doc(hidden)]
                    pub(crate) static #native_function_ident:
                        turbo_tasks::macro_helpers::Lazy<#native_function_ty> =
                            turbo_tasks::macro_helpers::Lazy::new(|| #native_function_def);
                    #[doc(hidden)]
                    pub(crate) static #native_function_id_ident:
                        turbo_tasks::macro_helpers::Lazy<#native_function_id_ty> =
                            turbo_tasks::macro_helpers::Lazy::new(|| #native_function_id_def);
                });

                trait_registers.push(quote! {
                    value.register_trait_method(<Box<dyn #trait_path> as turbo_tasks::VcValueTrait>::get_trait_type_id(), stringify!(#ident).into(), *#native_function_id_ident);
                });
            }
        }

        quote! {
            #[doc(hidden)]
            #[allow(non_snake_case)]
            pub(crate) fn #register(value: &mut turbo_tasks::ValueType) {
                value.register_trait(<Box<dyn #trait_path> as turbo_tasks::VcValueTrait>::get_trait_type_id());
                #(#trait_registers)*
            }

            // NOTE(alexkirsz) We can't have a general `turbo_tasks::Upcast<Box<dyn Trait>> for T where T: Trait` because
            // rustc complains: error[E0210]: type parameter `T` must be covered by another type when it appears before
            // the first local type (`dyn Trait`).
            unsafe impl #impl_generics turbo_tasks::Upcast<Box<dyn #trait_path>> for #ty #where_clause {}

            impl #impl_generics #trait_path for #ty #where_clause {
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
