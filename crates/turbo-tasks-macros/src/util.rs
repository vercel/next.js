use syn::{
    punctuated::Punctuated, token::Paren, AngleBracketedGenericArguments, GenericArgument, Ident,
    Path, PathArguments, PathSegment, ReturnType, Type, TypePath, TypeTuple,
};

pub fn unwrap_result_type(ty: &Type) -> (&Type, bool) {
    if let Type::Path(TypePath {
        qself: None,
        path: Path { segments, .. },
    }) = ty
    {
        if let Some(PathSegment {
            ident,
            arguments: PathArguments::AngleBracketed(AngleBracketedGenericArguments { args, .. }),
        }) = segments.last()
        {
            if &ident.to_string() == "Result" {
                if let Some(GenericArgument::Type(ty)) = args.first() {
                    return (ty, true);
                }
            }
        }
    }
    (ty, false)
}

pub fn is_empty_type(ty: &Type) -> bool {
    if let Type::Tuple(TypeTuple { elems, .. }) = ty {
        if elems.is_empty() {
            return true;
        }
    }
    false
}

pub fn get_return_type(output: &ReturnType) -> Type {
    match output {
        ReturnType::Default => Type::Tuple(TypeTuple {
            paren_token: Paren::default(),
            elems: Punctuated::new(),
        }),
        ReturnType::Type(_, ref output_type) => (**output_type).clone(),
    }
}

pub fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Vc"), ident.span())
}

pub fn get_internal_function_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "_inline"), ident.span())
}

pub fn get_ref_path(path: &Path) -> Path {
    let mut path = path.clone();
    if let Some(last_segment) = path.segments.last_mut() {
        last_segment.ident = get_ref_ident(&last_segment.ident);
    }
    path
}
