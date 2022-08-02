use syn::{
    parse::{Parse, ParseStream},
    Ident, Token,
};

/// Arguments to the `#[turbo_tasks::value_trait]` attribute macro.
pub struct ValueTraitArguments {
    /// Whether the macro should generate a `ValueDebug`-like `dbg()`
    /// implementation on the trait's `Vc`.
    pub no_debug: bool,
}

impl Parse for ValueTraitArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut result = ValueTraitArguments { no_debug: false };
        if input.is_empty() {
            return Ok(result);
        }
        loop {
            let path = input.parse::<Ident>()?;
            match path.to_string().as_ref() {
                "no_debug" => {
                    result.no_debug = true;
                }
                _ => {
                    return Err(input.error("unknown parameter"));
                }
            }
            if input.is_empty() {
                return Ok(result);
            } else if input.peek(Token![,]) {
                input.parse::<Token![,]>()?;
            } else {
                return Err(input.error("expected \",\" or end of attribute"));
            }
        }
    }
}
