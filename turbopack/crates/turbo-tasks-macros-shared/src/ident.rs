use quote::ToTokens;
use syn::{GenericArgument, Ident, Path, PathArguments, Type, TypeParamBound, spanned::Spanned};

pub fn get_cast_to_fat_pointer_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &format!("_cast_to_fat_pointer_{struct_ident}_{trait_ident}"),
        trait_ident.span(),
    )
}

pub fn get_native_function_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_FUNCTION", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

pub fn get_trait_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_TRAIT_TYPE", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

pub fn get_impl_function_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_{}_FUNCTION",
            struct_ident.to_string().to_uppercase(),
            ident.to_string().to_uppercase()
        ),
        ident.span(),
    )
}

pub fn get_inherent_impl_function_ident(ty_ident: &Ident, fn_ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_{}_FUNCTION",
            ty_ident.to_string().to_uppercase(),
            fn_ident.to_string().to_uppercase()
        ),
        fn_ident.span(),
    )
}

pub fn get_inherent_impl_function_id_ident(ty_ident: &Ident, fn_ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_{}_FUNCTION_ID",
            ty_ident.to_string().to_uppercase(),
            fn_ident.to_string().to_uppercase()
        ),
        fn_ident.span(),
    )
}

pub fn get_trait_impl_function_ident(
    struct_ident: &Ident,
    trait_ident: &Ident,
    ident: &Ident,
) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_TRAIT_{}_{}_FUNCTION",
            struct_ident.to_string().to_uppercase(),
            trait_ident.to_string().to_uppercase(),
            ident.to_string().to_uppercase()
        ),
        ident.span(),
    )
}

pub fn get_trait_impl_function_id_ident(
    struct_ident: &Ident,
    trait_ident: &Ident,
    ident: &Ident,
) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_TRAIT_{}_{}_FUNCTION_ID",
            struct_ident.to_string().to_uppercase(),
            trait_ident.to_string().to_uppercase(),
            ident.to_string().to_uppercase()
        ),
        ident.span(),
    )
}

pub fn get_path_ident(path: &Path) -> Ident {
    let mut result = String::new();

    for (i, segment) in path.segments.iter().enumerate() {
        let ident = segment.ident.to_string();

        if i > 0 {
            result.push('_');
        }

        result.push_str(&ident);

        match &segment.arguments {
            PathArguments::AngleBracketed(args) => {
                for arg in &args.args {
                    match arg {
                        GenericArgument::Type(ty) => {
                            if let Type::Path(type_path) = ty {
                                let type_ident = get_path_ident(&type_path.path);
                                result.push('_');
                                result.push_str(&type_ident.to_string());
                            } else if let Type::TraitObject(trait_obj) = ty {
                                for bound in &trait_obj.bounds {
                                    if let TypeParamBound::Trait(bound_trait) = bound {
                                        let bound_ident = get_path_ident(&bound_trait.path);
                                        result.push_str("_dyn_");
                                        result.push_str(&bound_ident.to_string());
                                    }
                                }
                            } else {
                                arg.span()
                                    .unwrap()
                                    .error(
                                        "#[turbo_tasks::value_impl] does not support this type \
                                         argument",
                                    )
                                    .emit();
                            }
                        }
                        _ => arg
                            .span()
                            .unwrap()
                            .error("#[turbo_tasks::value_impl] does not support this type argument")
                            .emit(),
                    }
                }
            }
            PathArguments::None => {}
            _ => {
                segment
                    .span()
                    .unwrap()
                    .error("#[turbo_tasks::value_impl] does not support this type argument")
                    .emit();
            }
        }
    }

    Ident::new(&result, path.span())
}

pub fn get_type_ident(ty: &Type) -> Option<Ident> {
    match ty {
        Type::Path(path) => Some(get_path_ident(&path.path)),
        Type::Tuple(tuple) => Some(Ident::new("unit", tuple.span())),
        _ => {
            ty.span()
                .unwrap()
                .error(format!(
                    "#[turbo_tasks::value_impl] does not support the type {}, expected T or \
                     Box<dyn Trait>",
                    ty.to_token_stream()
                ))
                .emit();
            None
        }
    }
}
pub fn get_trait_default_impl_function_ident(trait_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_DEFAULT_IMPL_{}_FUNCTION",
            trait_ident.to_string().to_uppercase(),
            ident.to_string().to_uppercase()
        ),
        ident.span(),
    )
}

pub fn get_value_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE", ident.to_string().to_uppercase()),
        ident.span(),
    )
}
