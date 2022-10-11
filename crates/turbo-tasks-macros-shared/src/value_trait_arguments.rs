use syn::{
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    Meta, Token,
};

/// Arguments to the `#[turbo_tasks::value_trait]` attribute macro.
#[derive(Debug)]
pub struct ValueTraitArguments {
    /// Whether the macro should generate a `ValueDebug`-like `dbg()`
    /// implementation on the trait's `Vc`.
    pub debug: bool,
}

impl Default for ValueTraitArguments {
    fn default() -> Self {
        Self { debug: true }
    }
}

impl Parse for ValueTraitArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut result = Self::default();
        if input.is_empty() {
            return Ok(result);
        }

        let punctuated: Punctuated<Meta, Token![,]> = input.parse_terminated(Meta::parse)?;
        for meta in punctuated {
            match meta.path().get_ident().map(ToString::to_string).as_deref() {
                Some("no_debug") => {
                    result.debug = false;
                }
                _ => {
                    return Err(syn::Error::new_spanned(meta, "unknown parameter"));
                }
            }
        }

        Ok(result)
    }
}
