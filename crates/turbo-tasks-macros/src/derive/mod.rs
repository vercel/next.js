mod deterministic_hash_macro;
mod trace_raw_vcs_macro;
mod value_debug_format_macro;
mod value_debug_macro;

pub use deterministic_hash_macro::derive_deterministic_hash;
use syn::{spanned::Spanned, Attribute, Meta, MetaList, NestedMeta};
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
                .path
                .get_ident()
                .map(|ident| *ident == "turbo_tasks")
                .unwrap_or_default()
            {
                continue;
            }
            if let Ok(Meta::List(MetaList { nested, .. })) = attr
                .parse_meta()
                .map_err(|err| err.span().unwrap().error(err.to_string()).emit())
            {
                for meta in nested {
                    if let NestedMeta::Meta(Meta::Path(path)) = &meta {
                        match path.get_ident().map(|ident| ident.to_string()).as_deref() {
                            Some("trace_ignore") => result.trace_ignore = true,
                            Some("debug_ignore") => result.debug_ignore = true,
                            _ => path
                                .span()
                                .unwrap()
                                .error("expected `trace_ignore` or `debug_ignore`")
                                .emit(),
                        }
                    } else {
                        meta.span()
                            .unwrap()
                            .error("expected `trace_ignore` or `debug_ignore`")
                            .emit();
                    }
                }
            }
        }

        result
    }
}
