use syn::{
    parse::{Parse, ParseStream},
    Generics, Result, Token, Type,
};

/// The input of the `generic_type` macro.
#[derive(Debug)]
pub struct GenericTypeInput {
    pub generics: Generics,
    pub ty: Type,
}

impl Parse for GenericTypeInput {
    fn parse(input: ParseStream) -> Result<Self> {
        let generics: Generics = input.parse()?;
        let _comma: Token![,] = input.parse()?;
        let ty: Type = input.parse()?;

        Ok(GenericTypeInput { generics, ty })
    }
}
