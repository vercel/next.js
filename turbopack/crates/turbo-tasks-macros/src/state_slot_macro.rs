use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{Expr, GenericArgument, ItemStatic, PathArguments, Type, parse_macro_input};

/// Attach a distinct, named link-time registry entry to a typed state slot.
pub fn state(input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStatic);
    let ident = &item.ident;
    let vis = &item.vis;
    let ty = &item.ty;
    let Type::Path(type_path) = ty.as_ref() else {
        return syn::Error::new_spanned(ty, "expected StateSlot<T>")
            .to_compile_error()
            .into();
    };
    let Some(last) = type_path.path.segments.last() else {
        return syn::Error::new_spanned(ty, "expected StateSlot<T>")
            .to_compile_error()
            .into();
    };
    if last.ident != "StateSlot" {
        return syn::Error::new_spanned(ty, "expected StateSlot<T>")
            .to_compile_error()
            .into();
    }
    let PathArguments::AngleBracketed(arguments) = &last.arguments else {
        return syn::Error::new_spanned(ty, "expected StateSlot<T>")
            .to_compile_error()
            .into();
    };
    let Some(GenericArgument::Type(value_ty)) = arguments.args.first() else {
        return syn::Error::new_spanned(ty, "expected StateSlot<T>")
            .to_compile_error()
            .into();
    };
    if arguments.args.len() != 1 {
        return syn::Error::new_spanned(ty, "expected exactly one state value type")
            .to_compile_error()
            .into();
    }
    let Expr::Call(initializer) = item.expr.as_ref() else {
        return syn::Error::new_spanned(&item.expr, "expected StateSlot::new()")
            .to_compile_error()
            .into();
    };
    if !initializer.args.is_empty()
        || !matches!(initializer.func.as_ref(), Expr::Path(path)
            if path.path.segments.last().is_some_and(|segment| segment.ident == "new"))
    {
        return syn::Error::new_spanned(&item.expr, "expected StateSlot::new()")
            .to_compile_error()
            .into();
    }
    let marker = format_ident!("__{ident}_state_slot_marker");
    let definition = format_ident!("__{ident}_state_slot_definition");
    let attrs = &item.attrs;
    let cfg_attrs = attrs
        .iter()
        .filter(|attr| attr.path().is_ident("cfg") || attr.path().is_ident("cfg_attr"))
        .collect::<Vec<_>>();
    quote! {
        #(#cfg_attrs)*
        #[allow(non_camel_case_types)]
        struct #marker;
        #(#cfg_attrs)*
        turbo_tasks::register_state!(#definition =
            turbo_tasks::backend_state::StateFactory::new::<#marker, #value_ty>(
                stringify!(#ident),
                concat!(module_path!(), "::", stringify!(#ident)),
            )
        );
        #(#attrs)*
        #vis static #ident: #ty = turbo_tasks::StateSlot::with_factory(&#definition);
    }
    .into()
}
