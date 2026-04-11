use std::sync::OnceLock;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Span};
use quote::{ToTokens, quote, quote_spanned};
use regex::Regex;
use syn::{
    Error, Expr, ExprLit, Fields, FieldsUnnamed, Generics, Item, ItemEnum, ItemStruct, Lit, LitStr,
    Meta, MetaNameValue, Token,
    parse::{Parse, ParseStream},
    parse_macro_input,
    spanned::Spanned,
};

use crate::{global_name::global_name_for_type, ident::get_value_type_ident};

enum CellMode {
    KeyedCompare,
    Compare,
    New,
}

impl Parse for CellMode {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let ident = input.parse::<LitStr>()?;
        Self::try_from(ident)
    }
}

impl TryFrom<LitStr> for CellMode {
    type Error = Error;

    fn try_from(lit: LitStr) -> Result<Self, Self::Error> {
        match lit.value().as_str() {
            "keyed" => Ok(CellMode::KeyedCompare),
            "compare" => Ok(CellMode::Compare),
            "new" => Ok(CellMode::New),
            _ => Err(Error::new_spanned(
                &lit,
                "expected \"new\", \"keyed\", or \"compare\"",
            )),
        }
    }
}

enum SerializationMode {
    None,
    /// Like `None` (no bincode serialization), but also stores a hash of the cell value so that
    /// changes can be detected even when the transient cell data has been evicted from memory.
    /// Only valid with `cell = "compare"` (or the default).
    Hash,
    Auto,
    Custom,
}

impl Parse for SerializationMode {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let ident = input.parse::<LitStr>()?;
        Self::try_from(ident)
    }
}

impl TryFrom<LitStr> for SerializationMode {
    type Error = Error;

    fn try_from(lit: LitStr) -> Result<Self, Self::Error> {
        match lit.value().as_str() {
            "none" => Ok(SerializationMode::None),
            "hash" => Ok(SerializationMode::Hash),
            "auto" => Ok(SerializationMode::Auto),
            "custom" => Ok(SerializationMode::Custom),
            _ => Err(Error::new_spanned(
                &lit,
                "expected \"none\", \"hash\", \"auto\", or \"custom\"",
            )),
        }
    }
}

struct ValueArguments {
    serialization_mode: SerializationMode,
    shared: bool,
    cell_mode: CellMode,
    manual_eq: bool,
    manual_hash: bool,
    transparent: bool,
    /// Should we `#[derive(turbo_tasks::OperationValue)]`?
    operation: Option<Span>,
}

impl Parse for ValueArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut result = ValueArguments {
            serialization_mode: SerializationMode::Auto,
            shared: false,
            cell_mode: CellMode::Compare,
            manual_eq: false,
            manual_hash: false,
            transparent: false,
            operation: None,
        };
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
                ("shared", Meta::Path(_)) => {
                    result.shared = true;
                }
                (
                    "serialization",
                    Meta::NameValue(MetaNameValue {
                        value:
                            Expr::Lit(ExprLit {
                                lit: Lit::Str(str), ..
                            }),
                        ..
                    }),
                ) => {
                    result.serialization_mode = SerializationMode::try_from(str)?;
                }
                (
                    "cell",
                    Meta::NameValue(MetaNameValue {
                        value:
                            Expr::Lit(ExprLit {
                                lit: Lit::Str(str), ..
                            }),
                        ..
                    }),
                ) => {
                    result.cell_mode = CellMode::try_from(str)?;
                }
                (
                    "eq",
                    Meta::NameValue(MetaNameValue {
                        value:
                            Expr::Lit(ExprLit {
                                lit: Lit::Str(str), ..
                            }),
                        ..
                    }),
                ) => {
                    result.manual_eq = if str.value() == "manual" {
                        true
                    } else {
                        return Err(Error::new_spanned(&str, "expected \"manual\""));
                    };
                }
                (
                    "hash",
                    Meta::NameValue(MetaNameValue {
                        value:
                            Expr::Lit(ExprLit {
                                lit: Lit::Str(str), ..
                            }),
                        ..
                    }),
                ) => {
                    result.manual_hash = if str.value() == "manual" {
                        true
                    } else {
                        return Err(Error::new_spanned(&str, "expected \"manual\""));
                    };
                }
                ("transparent", Meta::Path(_)) => {
                    result.transparent = true;
                }
                ("operation", Meta::Path(path)) => {
                    result.operation = Some(path.span());
                }
                (_, meta) => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!(
                            "unexpected {meta:?}, expected \"shared\", \"into\", \
                             \"serialization\", \"cell\", \"eq\", \"hash\", \"transparent\", or \
                             \"operation\""
                        ),
                    ));
                }
            }
        }

        Ok(result)
    }
}

pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as Item);
    let ValueArguments {
        serialization_mode,
        shared,
        cell_mode,
        manual_eq,
        manual_hash,
        transparent,
        operation,
    } = parse_macro_input!(args as ValueArguments);

    // `serialization = "hash"` only makes sense with `cell = "compare"` (the default).
    if matches!(serialization_mode, SerializationMode::Hash)
        && !matches!(cell_mode, CellMode::Compare)
    {
        return syn::Error::new(
            proc_macro2::Span::call_site(),
            "serialization = \"hash\" only makes sense with cell = \"compare\" (or default)",
        )
        .to_compile_error()
        .into();
    }

    // `hash = "manual"` only makes sense with `serialization = "hash"`.
    if manual_hash && !matches!(serialization_mode, SerializationMode::Hash) {
        return syn::Error::new(
            proc_macro2::Span::call_site(),
            "hash = \"manual\" only makes sense with serialization = \"hash\"",
        )
        .to_compile_error()
        .into();
    }

    let mut struct_attributes = vec![quote! {
        #[derive(
            turbo_tasks::ShrinkToFit,
            turbo_tasks::trace::TraceRawVcs,
            turbo_tasks::NonLocalValue,
        )]
        #[shrink_to_fit(crate = "turbo_tasks::macro_helpers::shrink_to_fit")]
    }];

    let mut inner_type = None;
    if transparent {
        if let Item::Struct(ItemStruct {
            fields: Fields::Unnamed(FieldsUnnamed { unnamed, .. }),
            ..
        }) = &item
            && unnamed.len() == 1
        {
            let field = unnamed.iter().next().unwrap();
            inner_type = Some(field.ty.clone());

            // generate a type string to add to the docs
            let inner_type_string = inner_type.to_token_stream().to_string();

            // HACK: proc_macro2 inserts whitespace between every token. It's ugly, so
            // remove it, assuming these whitespace aren't syntactically important. Using
            // prettyplease (or similar) would be more correct, but slower and add another
            // dependency.
            static WHITESPACE_RE: OnceLock<Regex> = OnceLock::new();
            // Remove whitespace, as long as there is a non-word character (e.g. `>` or `,`)
            // on either side. Try not to remove whitespace between `dyn Trait`.
            let whitespace_re = WHITESPACE_RE
                .get_or_init(|| Regex::new(r"\b \B|\B \b|\B \B").expect("WHITESPACE_RE is valid"));
            let inner_type_string = whitespace_re.replace_all(&inner_type_string, "");

            // Add a couple blank lines in case there's already a doc comment we're
            // effectively appending to. If there's not, rustdoc will strip
            // the leading whitespace.
            let doc_str = format!(
                "\n\nThis is a [transparent value type][turbo_tasks::value#transparent] wrapping \
                 [`{inner_type_string}`].",
            );

            struct_attributes.push(quote! {
                #[doc = #doc_str]
            });
        }
        if inner_type.is_none() {
            item.span()
                .unwrap()
                .error(
                    "#[turbo_tasks::value(transparent)] is only valid with single-item unit \
                     structs",
                )
                .emit();
        }
    }

    let ident = match &item {
        Item::Enum(ItemEnum { ident, .. }) => ident,
        Item::Struct(ItemStruct { ident, .. }) => ident,
        _ => {
            item.span().unwrap().error("unsupported syntax").emit();

            return quote! {
                #item
            }
            .into();
        }
    };

    let (cell_prefix, cell_access_content, read) = if let Some(inner_type) = &inner_type {
        (
            quote! { pub },
            quote! {
                content.0
            },
            quote! {
                turbo_tasks::VcTransparentRead::<#ident, #inner_type>
            },
        )
    } else {
        (
            if shared {
                quote! { pub }
            } else {
                quote! {}
            },
            quote! { content },
            quote! {
                turbo_tasks::VcDefaultRead::<#ident>
            },
        )
    };

    let cell_mode = match cell_mode {
        CellMode::New => quote! {
            turbo_tasks::VcCellNewMode<#ident>
        },
        CellMode::Compare if matches!(serialization_mode, SerializationMode::Hash) => quote! {
            turbo_tasks::VcCellHashedCompareMode<#ident>
        },
        CellMode::Compare => quote! {
            turbo_tasks::VcCellCompareMode<#ident>
        },
        CellMode::KeyedCompare => quote! {
            turbo_tasks::VcCellKeyedCompareMode<#ident>
        },
    };

    let cell_struct = quote! {
        /// Places a value in a cell of the current task.
        ///
        /// Cell is selected based on the value type and call order of `cell`.
        #cell_prefix fn cell(self) -> turbo_tasks::Vc<Self> {
            let content = self;
            turbo_tasks::Vc::cell_private(#cell_access_content)
        }

        /// Places a value in a cell of the current task. Returns a
        /// [`ResolvedVc`][turbo_tasks::ResolvedVc].
        ///
        /// Cell is selected based on the value type and call order of `cell`.
        #cell_prefix fn resolved_cell(self) -> turbo_tasks::ResolvedVc<Self> {
            let content = self;
            turbo_tasks::ResolvedVc::cell_private(#cell_access_content)
        }
    };

    match serialization_mode {
        SerializationMode::Auto => {
            struct_attributes.push(quote! {
                #[derive(
                    turbo_tasks::macro_helpers::bincode::Encode,
                    turbo_tasks::macro_helpers::bincode::Decode,
                )]
                #[bincode(crate = "turbo_tasks::macro_helpers::bincode")]
            });
        }
        SerializationMode::None | SerializationMode::Hash | SerializationMode::Custom => {}
    };
    if inner_type.is_some() {
        // Transparent structs have their own manual `ValueDebug` implementation.
        struct_attributes.push(quote! {
            #[repr(transparent)]
        });
    } else {
        struct_attributes.push(quote! {
            #[derive(turbo_tasks::debug::ValueDebugFormat)]
            #[cfg_attr(debug_assertions, derive(turbo_tasks::debug::internal::ValueDebug))]
        });
    }
    if !manual_eq {
        struct_attributes.push(quote! {
            #[derive(PartialEq, Eq)]
        });
    }
    if matches!(serialization_mode, SerializationMode::Hash) && !manual_hash {
        struct_attributes.push(quote! {
            #[derive(turbo_tasks::DeterministicHash)]
        });
    }
    if let Some(span) = operation {
        struct_attributes.push(quote_spanned! {
            span =>
            #[derive(turbo_tasks::OperationValue)]
        });
    }

    let name = global_name_for_type(ident);
    let new_value_type = match serialization_mode {
        SerializationMode::None | SerializationMode::Hash => quote! {
            turbo_tasks::ValueType::new::<#ident>(#name)
        },
        SerializationMode::Auto | SerializationMode::Custom => {
            quote! {
                turbo_tasks::ValueType::new_with_bincode::<#ident>(#name)
            }
        }
    };
    let has_serialization = match serialization_mode {
        SerializationMode::None | SerializationMode::Hash => quote! { false },
        SerializationMode::Auto | SerializationMode::Custom => quote! { true },
    };

    let value_debug_impl = if inner_type.is_some() {
        // For transparent values, we defer directly to the inner type's `ValueDebug`
        // implementation.
        quote! {
            #[cfg(debug_assertions)]
            #[turbo_tasks::value_impl]
            impl turbo_tasks::debug::ValueDebug for #ident {
                fn dbg_depth<'a>(
                    &'a self,
                    depth: usize,
                ) -> ::std::pin::Pin<
                    ::std::boxed::Box<
                        dyn ::std::future::Future<
                                Output = ::anyhow::Result<::std::string::String>,
                            > + ::std::marker::Send
                            + 'a,
                    >,
                > {
                    ::std::boxed::Box::pin(async move {
                        use turbo_tasks::debug::ValueDebugFormat;
                        (&self.0).value_debug_format(depth).try_to_string().await
                    })
                }
            }

        }
    } else {
        // For non-transparent types, the debug impl is generated by
        // `derive(turbo_tasks::debug::internal::ValueDebug)` (debug builds only).
        quote! {}
    };

    let value_type_and_register_code = value_type_and_register(
        ident,
        quote! { #ident },
        None,
        read,
        cell_mode,
        new_value_type,
        has_serialization,
    );

    let expanded = quote! {
        #(#struct_attributes)*
        #item

        impl #ident {
            #cell_struct
        }

        #value_type_and_register_code

        #value_debug_impl
    };

    expanded.into()
}

pub fn value_type_and_register(
    ident: &Ident,
    ty: proc_macro2::TokenStream,
    generics: Option<&Generics>,
    read: proc_macro2::TokenStream,
    cell_mode: proc_macro2::TokenStream,
    new_value_type: proc_macro2::TokenStream,
    has_serialization: proc_macro2::TokenStream,
) -> proc_macro2::TokenStream {
    let value_type_ident = get_value_type_ident(ident);

    let (impl_generics, where_clause) = if let Some(generics) = generics {
        let (impl_generics, _, where_clause) = generics.split_for_impl();
        (quote! { #impl_generics }, quote! { #where_clause })
    } else {
        (quote!(), quote!())
    };

    quote! {
        turbo_tasks::macro_helpers::turbo_register!(
            #ty => #value_type_ident: turbo_tasks::ValueType = #new_value_type
        );

        #[automatically_derived]
        unsafe impl #impl_generics turbo_tasks::VcValueType for #ty #where_clause {
            type Read = #read;
            type CellMode = #cell_mode;

            fn get_value_type_id() -> turbo_tasks::ValueTypeId {
                turbo_tasks::registry::get_value_type_id(&#value_type_ident)
            }

            fn has_serialization() -> bool {
                #has_serialization
            }
        }
    }
}
