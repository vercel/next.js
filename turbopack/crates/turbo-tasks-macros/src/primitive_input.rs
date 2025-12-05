use syn::{
    MacroDelimiter, Meta, MetaList, Result, Token, Type,
    parse::{Parse, ParseStream},
};

pub struct PrimitiveInput {
    pub ty: Type,
    pub bincode_wrappers: Option<BincodeWrappers>,
}

impl Parse for PrimitiveInput {
    fn parse(input: ParseStream) -> Result<Self> {
        let ty: Type = input.parse()?;
        let mut parsed_input = PrimitiveInput {
            ty,
            bincode_wrappers: None,
        };
        if input.parse::<Option<Token![,]>>()?.is_some() {
            let punctuated = input.parse_terminated(Meta::parse, Token![,])?;
            for meta in punctuated {
                match (
                    meta.path()
                        .get_ident()
                        .map(ToString::to_string)
                        .as_deref()
                        .unwrap_or_default(),
                    meta,
                ) {
                    ("bincode_wrappers", meta) => {
                        let Meta::List(MetaList {
                            tokens: wrapper_tokens,
                            delimiter: MacroDelimiter::Paren(..),
                            ..
                        }) = meta
                        else {
                            return Err(syn::Error::new_spanned(
                                meta,
                                "expected parenthesized (EncodeTy, DecodeTy) list",
                            ));
                        };
                        parsed_input.bincode_wrappers = Some(syn::parse2(wrapper_tokens)?);
                    }
                    (_, meta) => {
                        return Err(syn::Error::new_spanned(
                            meta,
                            "unexpected token, expected: \"bincode_wrappers\"",
                        ));
                    }
                }
            }
        }
        Ok(parsed_input)
    }
}

// TODO: wire this up in https://github.com/vercel/next.js/pull/86338
#[allow(dead_code)]
pub struct BincodeWrappers {
    pub encode_ty: Type,
    pub decode_ty: Type,
}

impl Parse for BincodeWrappers {
    fn parse(input: ParseStream) -> Result<Self> {
        let punctuated = input.parse_terminated(Type::parse, Token![,])?;
        let items: [Type; 2] = punctuated
            .into_iter()
            .collect::<Vec<_>>()
            .try_into()
            .map_err(|_| {
                syn::Error::new(input.span(), "expected exactly two comma-separated types")
            })?;
        let (encode_ty, decode_ty) = items.into();
        Ok(BincodeWrappers {
            encode_ty,
            decode_ty,
        })
    }
}
