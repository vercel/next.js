use proc_macro2::Span;
use syn::{
    parse::{Parse, ParseStream},
    punctuated::Punctuated,
    spanned::Spanned,
    Meta, Token,
};

/// Arguments to the `#[turbo_tasks::value_trait]` attribute macro.
#[derive(Debug)]
pub struct ValueTraitArguments {
    /// Whether the macro should generate a `ValueDebug`-like `dbg()`
    /// implementation on the trait's `Vc`.
    pub debug: bool,
    /// Should the trait have a `turbo_tasks::NonLocalValue` constraint?
    ///
    /// `Some(...)` if enabled, containing the span that enabled the constraint.
    pub non_local: Option<Span>,
    /// Should the trait have a `turbo_tasks::OperationValue` constraint?
    pub operation: Option<Span>,
}

impl Default for ValueTraitArguments {
    fn default() -> Self {
        Self {
            debug: true,
            non_local: None,
            operation: None,
        }
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
                Some("non_local") => {
                    result.non_local = Some(meta.span());
                }
                Some("operation") => {
                    result.operation = Some(meta.span());
                }
                _ => {
                    return Err(syn::Error::new_spanned(meta, "unknown parameter"));
                }
            }
        }

        Ok(result)
    }
}
