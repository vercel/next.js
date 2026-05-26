mod deterministic_hash_macro;
mod is_transient_macro;
mod non_local_value_macro;
mod operation_value_macro;
mod task_input_macro;
mod task_storage_macro;
mod trace_raw_vcs_macro;
mod value_debug_format_macro;
mod value_debug_macro;
pub(crate) mod value_to_string_macro;

pub use deterministic_hash_macro::derive_deterministic_hash;
pub use is_transient_macro::derive_is_transient;
pub use non_local_value_macro::derive_non_local_value;
pub use operation_value_macro::derive_operation_value;
use syn::{Attribute, Meta, Token, punctuated::Punctuated, spanned::Spanned};
pub use task_input_macro::derive_task_input;
pub use task_storage_macro::task_storage;
pub use trace_raw_vcs_macro::derive_trace_raw_vcs;
pub use value_debug_format_macro::derive_value_debug_format;
pub use value_debug_macro::derive_value_debug;

/// Emits compile errors for unsupported generic parameter shapes shared by the `TaskInput` and
/// `IsTransient` derives. Both derives need plain type parameters with no bounds (the impl will
/// add the trait bound itself) and no lifetimes or const generics.
///
/// `derive_name` is the human-readable derive name used in error messages ("TaskInput",
/// "IsTransient", etc.).
pub(crate) fn check_supported_generics(generics: &syn::Generics, derive_name: &str) {
    if let Some(where_clause) = &generics.where_clause {
        where_clause
            .span()
            .unwrap()
            .error(format!(
                "the {derive_name} derive macro does not support where clauses yet"
            ))
            .emit();
    }
    for param in &generics.params {
        match param {
            syn::GenericParam::Type(param) => {
                if !param.bounds.is_empty() {
                    param
                        .span()
                        .unwrap()
                        .error(format!(
                            "the {derive_name} derive macro does not support generic parameters \
                             bounds yet"
                        ))
                        .emit();
                }
            }
            syn::GenericParam::Lifetime(param) => {
                param
                    .span()
                    .unwrap()
                    .error(format!(
                        "the {derive_name} derive macro does not support generic lifetimes"
                    ))
                    .emit();
            }
            syn::GenericParam::Const(param) => {
                param
                    .span()
                    .unwrap()
                    .error(format!(
                        "the {derive_name} derive macro does not support const generics yet"
                    ))
                    .emit();
            }
        }
    }
}

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
