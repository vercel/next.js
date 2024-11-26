use proc_macro2::Span;
use syn::{
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    spanned::Spanned,
    Meta, Result, Token, Type,
};

#[derive(Debug)]
pub struct PrimitiveInput {
    pub ty: Type,
    pub manual_shrink_to_fit: Option<Span>,
}

impl Parse for PrimitiveInput {
    fn parse(input: ParseStream) -> Result<Self> {
        let ty: Type = input.parse()?;
        let mut parsed_input = PrimitiveInput {
            ty,
            manual_shrink_to_fit: None,
        };
        if input.parse::<Option<Token![,]>>()?.is_some() {
            let punctuated: Punctuated<Meta, Token![,]> = input.parse_terminated(Meta::parse)?;
            for meta in punctuated {
                match (
                    meta.path()
                        .get_ident()
                        .map(ToString::to_string)
                        .as_deref()
                        .unwrap_or_default(),
                    &meta,
                ) {
                    ("manual_shrink_to_fit", Meta::Path(_)) => {
                        parsed_input.manual_shrink_to_fit = Some(meta.span())
                    }
                    (_, meta) => {
                        return Err(syn::Error::new_spanned(
                            meta,
                            "unexpected token, expected: \"manual_shrink_to_fit\"",
                        ))
                    }
                }
            }
        }
        Ok(parsed_input)
    }
}
