use proc_macro::TokenStream;
use quote::quote;
use rustc_hash::FxHashSet;
use syn::{GenericParam, Lifetime, Type, parse_macro_input, spanned::Spanned, visit_mut::VisitMut};
use turbo_tasks_macros_shared::{GenericTypeInput, get_type_ident};

use crate::{global_name::global_name, value_macro::value_type_and_register};

pub fn generic_type(input: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(input as GenericTypeInput);

    for param in &input.generics.params {
        match param {
            syn::GenericParam::Type(ty) => {
                if ty.ident == "Vc" {
                    ty.span()
                        .unwrap()
                        .error("Vc is a reserved name in generic_type")
                        .emit();
                }
            }
            syn::GenericParam::Lifetime(lt) => {
                lt.span()
                    .unwrap()
                    .error("lifetime parameters are not supported in generic_type")
                    .emit();
            }
            syn::GenericParam::Const(c) => {
                c.span()
                    .unwrap()
                    .error("const parameters are not supported in generic_type")
                    .emit();
            }
        }
    }

    // Add Send bound to input generics.

    for param in &mut input.generics.params {
        if let GenericParam::Type(param) = param {
            param.bounds.push(syn::parse_quote! { std::marker::Send });
        }
    }

    let (impl_generics, _, where_clause) = input.generics.split_for_impl();

    let ty = &input.ty;
    let repr = replace_generics_with_unit(input.generics.params.iter(), ty);

    let Some(ident) = get_type_ident(ty) else {
        return quote! {
            // An error occurred while parsing the ident.
        }
        .into();
    };

    let mut generics_with_static = input.generics.clone();
    for param in &mut generics_with_static.params {
        if let GenericParam::Type(param) = param {
            param.bounds.push(syn::TypeParamBound::Lifetime(Lifetime {
                ident: syn::Ident::new("static", param.ident.span()),
                apostrophe: param.ident.span(),
            }))
        }
    }

    let name = global_name(quote! {stringify!(#repr) });
    let value_type_and_register = value_type_and_register(
        &ident,
        quote! { #ty },
        Some(&generics_with_static),
        quote! {
            turbo_tasks::VcTransparentRead<#ty, #ty, #repr>
        },
        quote! {
            turbo_tasks::VcCellSharedMode<#ty>
        },
        quote! {
            turbo_tasks::ValueType::new_with_any_serialization::<#repr>(#name)
        },
    );

    quote! {
        #value_type_and_register

        impl #impl_generics Vc<#ty> #where_clause {
            /// Converts this `Vc` to a generic representation.
            fn to_repr(vc: Self) -> Vc<#repr> {
                unsafe {
                    turbo_tasks::Vc::from_raw(Vc::into_raw(vc))
                }
            }

            /// Converts a generic representation of this `Vc` to the proper `Vc` type.
            ///
            /// # Safety
            ///
            /// The caller must ensure that the `repr` is a valid representation of this `Vc`.
            unsafe fn from_repr(vc: Vc<#repr>) -> Self {
                unsafe {
                    turbo_tasks::Vc::from_raw(Vc::into_raw(vc))
                }
            }
        }
    }
    .into()
}

struct ReplaceGenericsVisitor<'a> {
    generics: &'a FxHashSet<String>,
}

impl VisitMut for ReplaceGenericsVisitor<'_> {
    fn visit_type_mut(&mut self, node: &mut Type) {
        if let Type::Path(type_path) = node
            && type_path.qself.is_none()
            && type_path.path.segments.len() == 1
            && type_path.path.segments[0].arguments.is_none()
            && self
                .generics
                .contains(&type_path.path.segments[0].ident.to_string())
        {
            // Replace the whole path with ()
            *node = syn::parse_quote! { () };
            return;
        }

        syn::visit_mut::visit_type_mut(self, node);
    }
}

/// Replaces all instances of `params` generic types in `ty` with the unit type
/// `()`.
fn replace_generics_with_unit<'a, P>(params: P, ty: &Type) -> Type
where
    P: IntoIterator<Item = &'a GenericParam>,
{
    let generics_set: FxHashSet<_> = params
        .into_iter()
        .filter_map(|param| {
            if let GenericParam::Type(type_param) = param {
                Some(type_param.ident.to_string())
            } else {
                None
            }
        })
        .collect();

    let mut new_ty = ty.clone();
    let mut visitor = ReplaceGenericsVisitor {
        generics: &generics_set,
    };

    syn::visit_mut::visit_type_mut(&mut visitor, &mut new_ty);

    new_ty
}
