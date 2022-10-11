use syn::Ident;

pub fn get_register_value_type_ident(struct_ident: &Ident) -> Ident {
    Ident::new(
        &format!("__register_{struct_ident}_value_type"),
        struct_ident.span(),
    )
}

pub fn get_register_trait_methods_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &format!("__register_{struct_ident}_{trait_ident}_trait_methods"),
        trait_ident.span(),
    )
}

pub fn get_function_ident(ident: &Ident) -> Ident {
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

pub fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Vc"), ident.span())
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
