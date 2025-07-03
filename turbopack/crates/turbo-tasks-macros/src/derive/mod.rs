mod deterministic_hash_macro;
mod key_value_pair_macro;
mod non_local_value_macro;
mod operation_value_macro;
mod task_input_macro;
mod trace_raw_vcs_macro;
mod value_debug_format_macro;
mod value_debug_macro;

pub use deterministic_hash_macro::derive_deterministic_hash;
pub use key_value_pair_macro::derive_key_value_pair;
pub use non_local_value_macro::derive_non_local_value;
pub use operation_value_macro::derive_operation_value;
use syn::{Attribute, Meta, Token, punctuated::Punctuated, spanned::Spanned};
pub use task_input_macro::derive_task_input;
pub use trace_raw_vcs_macro::derive_trace_raw_vcs;
pub use value_debug_format_macro::derive_value_debug_format;
pub use value_debug_macro::derive_value_debug;

struct FieldAttributes {
    trace_ignore: bool,
    debug_ignore: bool,
}

impl From<&[Attribute]> for FieldAttributes {
    fn from(attrs: &[Attribute]) -> Self {
        let mut result = Self {
            trace_ignore: false,
            debug_ignore: false,
        };

        for attr in attrs {
            if !attr
                .path()
                .get_ident()
                .map(|ident| *ident == "turbo_tasks")
                .unwrap_or_default()
            {
                continue;
            }
            let nested = match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
            {
                Ok(punctuated) => punctuated,
                Err(e) => {
                    attr.meta
                        .span()
                        .unwrap()
                        .error(format!(
                            "expected `trace_ignore` or `debug_ignore`, got: {e}"
                        ))
                        .emit();
                    Punctuated::default()
                }
            };
            for meta in nested {
                match meta {
                    Meta::Path(path) => {
                        if path.is_ident("trace_ignore") {
                            result.trace_ignore = true;
                        } else if path.is_ident("debug_ignore") {
                            result.debug_ignore = true;
                        } else {
                            path.span()
                                .span()
                                .unwrap()
                                .error("expected `trace_ignore` or `debug_ignore`")
                                .emit()
                        }
                    }
                    _ => meta
                        .path()
                        .span()
                        .unwrap()
                        .error("expected `trace_ignore` or `debug_ignore`")
                        .emit(),
                }
            }
        }

        result
    }
}
