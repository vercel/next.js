use proc_macro::TokenStream;
use proc_macro2::{Ident, TokenStream as TokenStream2};
use quote::quote;
use syn::{
    parse_macro_input, ItemTrait, Path, PathSegment, Signature, TraitBound, TraitItem,
    TraitItemMethod, TypeParamBound,
};
use turbo_tasks_macros_shared::{
    get_ref_ident, get_trait_default_impl_function_ident, get_trait_type_ident, ValueTraitArguments,
};

use crate::{
    func::{gen_native_function_code, split_signature, SelfType},
    util::*,
};

fn get_trait_type_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_TRAIT_TYPE_ID", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

fn get_trait_default_impl_function_id_ident(trait_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_DEFAULT_IMPL_{}_FUNCTION_ID",
            trait_ident.to_string().to_uppercase(),
            ident.to_string().to_uppercase()
        ),
        ident.span(),
    )
}

pub fn value_trait(args: TokenStream, input: TokenStream) -> TokenStream {
    let ValueTraitArguments { debug } = parse_macro_input!(args as ValueTraitArguments);

    let mut item = parse_macro_input!(input as ItemTrait);

    let ItemTrait {
        vis,
        ident,
        items,
        supertraits,
        attrs,
        trait_token,
        colon_token,
        ..
    } = &mut item;

    let supertraits = supertraits.into_iter().collect::<Vec<_>>();

    let supertrait_refs: Vec<_> = supertraits
        .iter()
        .filter_map(|ident| {
            if let TypeParamBound::Trait(TraitBound {
                path: Path { segments, .. },
                ..
            }) = ident
            {
                let PathSegment { ident, .. } = segments.iter().next()?;
                Some(get_ref_ident(ident))
            } else {
                None
            }
        })
        .collect();

    let as_supertrait_methods: Vec<_> = supertraits
        .iter()
        .filter_map(|ident| {
            if let TypeParamBound::Trait(TraitBound {
                path: Path { segments, .. },
                ..
            }) = ident
            {
                let PathSegment { ident, .. } = segments.iter().next()?;
                Some(get_as_super_ident(ident))
            } else {
                None
            }
        })
        .collect();

    let ref_ident = get_ref_ident(ident);
    let trait_type_ident = get_trait_type_ident(ident);
    let trait_type_id_ident = get_trait_type_id_ident(ident);
    let mut trait_fns = Vec::new();
    let mut default_method_registers: Vec<TokenStream2> = Vec::new();
    let mut native_functions = Vec::new();

    for item in items.iter_mut() {
        if let TraitItem::Method(TraitItemMethod { sig, default, .. }) = item {
            let Signature {
                ident: method_ident,
                inputs,
                ..
            } = &*sig;

            let (external_sig, _inline_sig, output_type, convert_result_code) =
                split_signature(sig);
            let function_ident = get_trait_default_impl_function_ident(ident, method_ident);
            let function_id_ident = get_trait_default_impl_function_id_ident(ident, method_ident);
            let inline_ident = get_internal_function_ident(method_ident);

            let mut inline_sig = sig.clone();
            inline_sig.ident = inline_ident.clone();

            let (native_function_code, input_raw_vc_arguments) = gen_native_function_code(
                quote! { format!(concat!("{}::", stringify!(#method_ident)), std::any::type_name::<#ref_ident>()) },
                quote! { #ref_ident::#inline_ident },
                &function_ident,
                &function_id_ident,
                sig.asyncness.is_some(),
                inputs,
                &output_type,
                Some((&ref_ident, SelfType::ValueTrait)),
            );

            trait_fns.push(quote! {
                #external_sig {
                    let result = turbo_tasks::trait_call(*#trait_type_id_ident, std::borrow::Cow::Borrowed(stringify!(#method_ident)), vec![#(#input_raw_vc_arguments),*]);
                    #convert_result_code
                }
            });

            if let Some(block) = default.take() {
                default_method_registers.push(quote! {
                    trait_type.register_default_trait_method(stringify!(#method_ident).to_string(), *#function_id_ident);
                });
                native_functions.push(quote! {
                    impl #ref_ident {
                        #(#attrs)*
                        #vis #inline_sig #block
                    }

                    #native_function_code
                });

                *sig = external_sig;
            }
        }
    }

    let value_debug_impl = if debug {
        quote! {
            #[turbo_tasks::value_impl]
            impl #ref_ident {
                #[turbo_tasks::function]
                pub async fn dbg(self) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
                    use turbo_tasks::debug::ValueDebugFormat;
                    self.value_debug_format().try_to_value_debug_string().await
                }
            }
        }
    } else {
        quote! {}
    };

    let value_debug_format_impl = quote! {
        impl turbo_tasks::debug::ValueDebugFormat for #ref_ident {
            fn value_debug_format(&self) -> turbo_tasks::debug::ValueDebugFormatString {
                turbo_tasks::debug::ValueDebugFormatString::Async(Box::pin(async move {
                    Ok(if let Some(value_debug) = turbo_tasks::debug::ValueDebugVc::resolve_from(self).await? {
                        format!(concat!(stringify!(#ident), "({})"), value_debug.dbg().await?.as_str())
                    } else {
                        // This case means the `Vc` pointed to by this `Vc` does not implement `ValueDebug`.
                        // This could happen if we provide a way to opt-out of the default `ValueDebug` derive,
                        // or if we make the derive opt-in. However, we can still print useful information
                        // like the resolved type.
                        "<unimplemented>".to_string()
                    })
                }))
            }
        }
    };

    let expanded = quote! {
        #(#attrs)*
        #vis #trait_token #ident #colon_token #(#supertraits)+* {
            #(#items)*
        }

        #(#native_functions)*

        #[doc(hidden)]
        pub(crate) static #trait_type_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitType> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                let mut trait_type = turbo_tasks::TraitType::new(std::any::type_name::<#ref_ident>().to_string());;
                #(#default_method_registers)*
                trait_type
            });
        #[doc(hidden)]
        static #trait_type_id_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::TraitTypeId> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                turbo_tasks::registry::get_trait_type_id(&#trait_type_ident)
            });

        #[derive(Clone, Copy, Debug, std::cmp::PartialOrd, std::cmp::Ord, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq, serde::Serialize, serde::Deserialize)]
        #vis struct #ref_ident {
            node: turbo_tasks::RawVc,
        }

        impl #ref_ident {
            /// see [turbo_tasks::RawVc::resolve]
            pub async fn resolve(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve().await? })
            }

            /// see [turbo_tasks::RawVc::resolve_strongly_consistent]
            pub async fn resolve_strongly_consistent(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve_strongly_consistent().await? })
            }

            /// see [turbo_tasks::RawVc::cell_local]
            pub async fn cell_local(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.cell_local().await? })
            }

            /// see [turbo_tasks::RawVc::keyed_cell_local]
            pub async fn keyed_cell_local<
                K: std::fmt::Debug + std::cmp::Eq + std::cmp::Ord + std::hash::Hash + turbo_tasks::Typed + turbo_tasks::TypedForInput + Send + Sync + 'static,
            >(self, key: K) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.keyed_cell_local(key).await? })
            }

            pub async fn resolve_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Result<Option<Self>, turbo_tasks::ResolveTypeError> {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                let raw_vc = raw_vc.resolve_trait(*#trait_type_id_ident).await?;
                Ok(raw_vc.map(|raw_vc| #ref_ident { node: raw_vc }))
            }

            pub fn cast_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Self {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                #ref_ident { node: raw_vc }
            }

            #(pub #trait_fns)*
        }

        impl turbo_tasks::CollectiblesSource for #ref_ident {
            fn take_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> turbo_tasks::CollectiblesFuture<T> {
                self.node.take_collectibles()
            }

            fn peek_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> turbo_tasks::CollectiblesFuture<T> {
                self.node.peek_collectibles()
            }
        }

        impl turbo_tasks::ValueTraitVc for #ref_ident {
            #[inline]
            fn get_trait_type_id() -> turbo_tasks::TraitTypeId {
                *#trait_type_id_ident
            }
        }

        impl<T> #ident for T where #ref_ident: std::convert::From<T>, turbo_tasks::TaskInput: for<'a> std::convert::From<&'a T> #(, #supertrait_refs: std::convert::From<T>)* {
            #(default #trait_fns)*
        }

        #(
            impl From<#ref_ident> for #supertrait_refs {
                fn from(node_ref: #ref_ident) -> Self {
                    node_ref.node.into()
                }
            }

            impl #ref_ident {
                pub fn #as_supertrait_methods(self) -> #supertrait_refs {
                    self.node.into()
                }
            }
        )*

        impl turbo_tasks::FromTaskInput<'_> for #ref_ident {
            type Error = turbo_tasks::Error;

            fn try_from(value: &turbo_tasks::TaskInput) -> Result<Self, Self::Error> {
                Ok(Self { node: std::convert::TryFrom::try_from(value)? })
            }
        }

        impl From<turbo_tasks::RawVc> for #ref_ident {
            fn from(node: turbo_tasks::RawVc) -> Self {
                Self { node }
            }
        }

        impl From<#ref_ident> for turbo_tasks::RawVc {
            fn from(node_ref: #ref_ident) -> Self {
                node_ref.node
            }
        }

        impl From<&#ref_ident> for turbo_tasks::RawVc {
            fn from(node_ref: &#ref_ident) -> Self {
                node_ref.node.clone()
            }
        }

        impl From<#ref_ident> for turbo_tasks::TaskInput {
            fn from(node_ref: #ref_ident) -> Self {
                node_ref.node.into()
            }
        }

        impl From<&#ref_ident> for turbo_tasks::TaskInput {
            fn from(node_ref: &#ref_ident) -> Self {
                node_ref.node.clone().into()
            }
        }

        impl turbo_tasks::trace::TraceRawVcs for #ref_ident {
            fn trace_raw_vcs(&self, context: &mut turbo_tasks::trace::TraceRawVcsContext) {
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.node, context);
            }
        }

        #value_debug_impl
        #value_debug_format_impl
    };
    expanded.into()
}
