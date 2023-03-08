use proc_macro2::TokenStream;
use quote::quote;
use syn::{
    punctuated::Punctuated, token::Paren, AngleBracketedGenericArguments, GenericArgument, Ident,
    Path, PathArguments, PathSegment, ReturnType, Type, TypePath, TypeTuple,
};
use turbo_tasks_macros_shared::get_ref_ident;

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

pub fn get_internal_function_ident(ident: &Ident) -> Ident {
    Ident::new(&format!("{ident}_inline"), ident.span())
}

pub fn get_as_super_ident(ident: &Ident) -> Ident {
    use convert_case::{Case, Casing};
    Ident::new(
        &format!("as_{}", ident.to_string().to_case(Case::Snake)),
        ident.span(),
    )
}

pub fn get_ref_path(path: &Path) -> Path {
    let mut path = path.clone();
    if let Some(last_segment) = path.segments.last_mut() {
        last_segment.ident = get_ref_ident(&last_segment.ident);
    }
    path
}

pub fn strongly_consistent_doccomment() -> TokenStream {
    quote! {
        /// The invalidation of tasks due to changes is eventually consistent by default.
        /// Tasks will execute as early as any of their children has changed, even while
        /// other children or grandchildren are still computing (and may or may not result
        /// in a future invalidation). Tasks may execute multiple times until the graph
        /// reaches the end state. Partial applied changes might be visible to the user.
        /// But changes are available as fast as possible and won't be blocked by some
        /// slower parts of the graph (e. g. recomputation of blurred images, linting,
        /// etc).
        ///
        /// When you read a task with `.strongly_consistent()` it will make that one read
        /// operation strongly consistent. That means it will only return a result when all
        /// children and grandchildren in that graph have been settled. This means your
        /// current task will recompute less often, but it might also need to wait for
        /// slower operations in the graph and can't continue with partial applied changes.
        ///
        /// Reading strongly consistent is also far more expensive compared to normal
        /// reading, so it should be used with care.
        ///
    }
}
