use syn::{
    parse::{Parse, ParseStream},
    Result, Type,
};

#[derive(Debug)]
pub struct PrimitiveInput {
    pub ty: Type,
}

impl Parse for PrimitiveInput {
    fn parse(input: ParseStream) -> Result<Self> {
        let ty: Type = input.parse()?;
        Ok(PrimitiveInput { ty })
    }
}
