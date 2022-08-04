use syn::{Ident, Path};

pub fn get_register_trait_methods_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &format!("__register_{struct_ident}_{trait_ident}_trait_methods"),
        trait_ident.span(),
    )
}

pub fn get_last_ident(path: &Path) -> Option<&Ident> {
    path.segments.last().map(|s| &s.ident)
}

pub fn get_value_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

pub fn get_value_type_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE_ID", ident.to_string().to_uppercase()),
        ident.span(),
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

pub fn get_trait_impl_function_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "{}_IMPL_{}_FUNCTION",
            struct_ident.to_string().to_uppercase(),
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
