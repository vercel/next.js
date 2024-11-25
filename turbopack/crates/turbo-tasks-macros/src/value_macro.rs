use std::sync::OnceLock;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Span};
use quote::{quote, quote_spanned, ToTokens};
use regex::Regex;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, parse_quote,
    punctuated::Punctuated,
    spanned::Spanned,
    Error, Fields, FieldsUnnamed, Generics, Item, ItemEnum, ItemStruct, Lit, LitStr, Meta,
    MetaNameValue, Result, Token,
};
use turbo_tasks_macros_shared::{
    get_register_value_type_ident, get_value_type_id_ident, get_value_type_ident,
    get_value_type_init_ident,
};

enum IntoMode {
    None,
    New,
    Shared,
}

impl Parse for IntoMode {
    fn parse(input: ParseStream) -> Result<Self> {
        let ident = input.parse::<LitStr>()?;
        Self::try_from(ident)
    }
}

impl TryFrom<LitStr> for IntoMode {
    type Error = Error;

    fn try_from(lit: LitStr) -> std::result::Result<Self, Self::Error> {
        match lit.value().as_str() {
            "none" => Ok(IntoMode::None),
            "new" => Ok(IntoMode::New),
            "shared" => Ok(IntoMode::Shared),
            _ => Err(Error::new_spanned(
                &lit,
                "expected \"none\", \"new\" or \"shared\"",
            )),
        }
    }
}

enum CellMode {
    New,
    Shared,
}

impl Parse for CellMode {
    fn parse(input: ParseStream) -> Result<Self> {
        let ident = input.parse::<LitStr>()?;
        Self::try_from(ident)
    }
}

impl TryFrom<LitStr> for CellMode {
    type Error = Error;

    fn try_from(lit: LitStr) -> std::result::Result<Self, Self::Error> {
        match lit.value().as_str() {
            "new" => Ok(CellMode::New),
            "shared" => Ok(CellMode::Shared),
            _ => Err(Error::new_spanned(&lit, "expected \"new\" or \"shared\"")),
        }
    }
}

enum SerializationMode {
    None,
    Auto,
    AutoForInput,
    Custom,
    CustomForInput,
}

impl Parse for SerializationMode {
    fn parse(input: ParseStream) -> Result<Self> {
        let ident = input.parse::<LitStr>()?;
        Self::try_from(ident)
    }
}

impl TryFrom<LitStr> for SerializationMode {
    type Error = Error;

    fn try_from(lit: LitStr) -> std::result::Result<Self, Self::Error> {
        match lit.value().as_str() {
            "none" => Ok(SerializationMode::None),
            "auto" => Ok(SerializationMode::Auto),
            "auto_for_input" => Ok(SerializationMode::AutoForInput),
            "custom" => Ok(SerializationMode::Custom),
            "custom_for_input" => Ok(SerializationMode::CustomForInput),
            _ => Err(Error::new_spanned(
                &lit,
                "expected \"none\", \"auto\", \"auto_for_input\", \"custom\" or \
                 \"custom_for_input\"",
            )),
        }
    }
}

struct ValueArguments {
    serialization_mode: SerializationMode,
    into_mode: IntoMode,
    cell_mode: CellMode,
    manual_eq: bool,
    transparent: bool,
    /// Should we `#[derive(turbo_tasks::NonLocalValue)]`?
    ///
    /// `Some(...)` if enabled, containing the span that enabled the derive.
    non_local: Option<Span>,
    /// Should we `#[derive(turbo_tasks::OperationValue)]`?
    operation: Option<Span>,
}

impl Parse for ValueArguments {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = ValueArguments {
            serialization_mode: SerializationMode::Auto,
            into_mode: IntoMode::None,
            cell_mode: CellMode::Shared,
            manual_eq: false,
            transparent: false,
            non_local: None,
            operation: None,
        };
        let punctuated: Punctuated<Meta, Token![,]> = input.parse_terminated(Meta::parse)?;
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
                    result.into_mode = IntoMode::Shared;
                    result.cell_mode = CellMode::Shared;
                }
                (
                    "into",
                    Meta::NameValue(MetaNameValue {
                        lit: Lit::Str(str), ..
                    }),
                ) => {
                    result.into_mode = IntoMode::try_from(str)?;
                }
                (
                    "serialization",
                    Meta::NameValue(MetaNameValue {
                        lit: Lit::Str(str), ..
                    }),
                ) => {
                    result.serialization_mode = SerializationMode::try_from(str)?;
                }
                (
                    "cell",
                    Meta::NameValue(MetaNameValue {
                        lit: Lit::Str(str), ..
                    }),
                ) => {
                    result.cell_mode = CellMode::try_from(str)?;
                }
                (
                    "eq",
                    Meta::NameValue(MetaNameValue {
                        lit: Lit::Str(str), ..
                    }),
                ) => {
                    result.manual_eq = if str.value() == "manual" {
                        true
                    } else {
                        return Err(Error::new_spanned(&str, "expected \"manual\""));
                    };
                }
                ("transparent", Meta::Path(_)) => {
                    result.transparent = true;
                }
                ("non_local", Meta::Path(path)) => {
                    result.non_local = Some(path.span());
                }
                ("operation", Meta::Path(path)) => {
                    result.operation = Some(path.span());
                }
                (_, meta) => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!(
                            "unexpected {:?}, expected \"shared\", \"into\", \"serialization\", \
                             \"cell\", \"eq\", \"transparent\", \"non_local\", or \"operation\"",
                            meta
                        ),
                    ))
                }
            }
        }

        Ok(result)
    }
}

pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    let mut item = parse_macro_input!(input as Item);
    let ValueArguments {
        serialization_mode,
        into_mode,
        cell_mode,
        manual_eq,
        transparent,
        non_local: resolved,
        operation,
    } = parse_macro_input!(args as ValueArguments);

    let mut inner_type = None;
    if transparent {
        if let Item::Struct(ItemStruct {
            attrs,
            fields: Fields::Unnamed(FieldsUnnamed { unnamed, .. }),
            ..
        }) = &mut item
        {
            if unnamed.len() == 1 {
                let field = unnamed.iter().next().unwrap();
                inner_type = Some(field.ty.clone());

                // generate a type string to add to the docs
                let inner_type_string = inner_type.to_token_stream().to_string();

                // HACK: proc_macro2 inserts whitespace between every token. It's ugly, so
                // remove it, assuming these whitespace aren't syntatically important. Using
                // prettyplease (or similar) would be more correct, but slower and add another
                // dependency.
                static WHITESPACE_RE: OnceLock<Regex> = OnceLock::new();
                // Remove whitespace, as long as there is a non-word character (e.g. `>` or `,`)
                // on either side. Try not to remove whitespace between `dyn Trait`.
                let whitespace_re = WHITESPACE_RE.get_or_init(|| {
                    Regex::new(r"\b \B|\B \b|\B \B").expect("WHITESPACE_RE is valid")
                });
                let inner_type_string = whitespace_re.replace_all(&inner_type_string, "");

                // Add a couple blank lines in case there's already a doc comment we're
                // effectively appending to. If there's not, rustdoc will strip
                // the leading whitespace.
                let doc_str = format!(
                    "\n\nThis is a [transparent value type][turbo_tasks::value#transparent] \
                     wrapping [`{}`].",
                    inner_type_string,
                );

                attrs.push(parse_quote! {
                    #[doc = #doc_str]
                });
            }
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

    let cell_mode = match cell_mode {
        CellMode::New => quote! {
            turbo_tasks::VcCellNewMode<#ident>
        },
        CellMode::Shared => quote! {
            turbo_tasks::VcCellSharedMode<#ident>
        },
    };

    let (cell_prefix, cell_access_content, read) = if let Some(inner_type) = &inner_type {
        (
            quote! { pub },
            quote! {
                content.0
            },
            quote! {
                turbo_tasks::VcTransparentRead::<#ident, #inner_type, #ident>
            },
        )
    } else {
        (
            if let IntoMode::New | IntoMode::Shared = into_mode {
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

        /// Places a value in a task-local cell stored in the current task.
        ///
        /// Task-local cells are stored in a task-local arena, and do not persist outside the
        /// lifetime of the current task (including child tasks). Task-local cells can be resolved
        /// to be converted into normal cells.
        #cell_prefix fn local_cell(self) -> turbo_tasks::Vc<Self> {
            let content = self;
            turbo_tasks::Vc::local_cell_private(#cell_access_content)
        }
    };

    let into = if let IntoMode::New | IntoMode::Shared = into_mode {
        quote! {
            impl ::std::convert::From<#ident> for turbo_tasks::Vc<#ident> {
                fn from(value: #ident) -> Self {
                    value.cell()
                }
            }
        }
    } else {
        quote! {}
    };

    let mut struct_attributes = vec![quote! {
        #[derive(turbo_tasks::ShrinkToFit, turbo_tasks::trace::TraceRawVcs)]
    }];
    match serialization_mode {
        SerializationMode::Auto | SerializationMode::AutoForInput => {
            struct_attributes.push(quote! {
                #[derive(
                    turbo_tasks::macro_helpers::serde::Serialize,
                    turbo_tasks::macro_helpers::serde::Deserialize,
                )]
                #[serde(crate = "turbo_tasks::macro_helpers::serde")]
            })
        }
        SerializationMode::None | SerializationMode::Custom | SerializationMode::CustomForInput => {
        }
    };
    if inner_type.is_some() {
        // Transparent structs have their own manual `ValueDebug` implementation.
        struct_attributes.push(quote! {
            #[repr(transparent)]
        });
    } else {
        struct_attributes.push(quote! {
            #[derive(
                turbo_tasks::debug::ValueDebugFormat,
                turbo_tasks::debug::internal::ValueDebug,
            )]
        });
    }
    if !manual_eq {
        struct_attributes.push(quote! {
            #[derive(PartialEq, Eq)]
        });
    }
    if let Some(span) = resolved {
        struct_attributes.push(quote_spanned! {
            span =>
            #[derive(turbo_tasks::NonLocalValue)]
        });
    }
    if let Some(span) = operation {
        struct_attributes.push(quote_spanned! {
            span =>
            #[derive(turbo_tasks::OperationValue)]
        });
    }

    let new_value_type = match serialization_mode {
        SerializationMode::None => quote! {
            turbo_tasks::ValueType::new::<#ident>()
        },
        SerializationMode::Auto | SerializationMode::Custom => {
            quote! {
                turbo_tasks::ValueType::new_with_any_serialization::<#ident>()
            }
        }
        SerializationMode::AutoForInput | SerializationMode::CustomForInput => {
            quote! {
                turbo_tasks::ValueType::new_with_magic_serialization::<#ident>()
            }
        }
    };

    let for_input_marker = match serialization_mode {
        SerializationMode::None | SerializationMode::Auto | SerializationMode::Custom => quote! {},
        SerializationMode::AutoForInput | SerializationMode::CustomForInput => quote! {
            impl turbo_tasks::TypedForInput for #ident {}
        },
    };

    let value_debug_impl = if inner_type.is_some() {
        // For transparent values, we defer directly to the inner type's `ValueDebug`
        // implementation.
        quote! {
            #[turbo_tasks::value_impl]
            impl turbo_tasks::debug::ValueDebug for #ident {
                #[turbo_tasks::function]
                async fn dbg(&self) -> anyhow::Result<turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString>> {
                    use turbo_tasks::debug::ValueDebugFormat;
                    (&self.0).value_debug_format(usize::MAX).try_to_value_debug_string().await
                }

                #[turbo_tasks::function]
                async fn dbg_depth(&self, depth: usize) -> anyhow::Result<turbo_tasks::Vc<turbo_tasks::debug::ValueDebugString>> {
                    use turbo_tasks::debug::ValueDebugFormat;
                    (&self.0).value_debug_format(depth).try_to_value_debug_string().await
                }
            }
        }
    } else {
        quote! {}
    };

    let value_type_and_register_code = value_type_and_register(
        ident,
        quote! { #ident },
        None,
        read,
        cell_mode,
        new_value_type,
    );

    let expanded = quote! {
        #(#struct_attributes)*
        #item

        impl #ident {
            #cell_struct
        }

        #into

        #value_type_and_register_code

        #for_input_marker

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
) -> proc_macro2::TokenStream {
    let value_type_init_ident = get_value_type_init_ident(ident);
    let value_type_ident = get_value_type_ident(ident);
    let value_type_id_ident = get_value_type_id_ident(ident);
    let register_value_type_ident = get_register_value_type_ident(ident);

    let (impl_generics, where_clause) = if let Some(generics) = generics {
        let (impl_generics, _, where_clause) = generics.split_for_impl();
        (quote! { #impl_generics }, quote! { #where_clause })
    } else {
        (quote!(), quote!())
    };

    quote! {
        #[doc(hidden)]
        static #value_type_init_ident: turbo_tasks::macro_helpers::OnceCell<
            turbo_tasks::ValueType,
        > = turbo_tasks::macro_helpers::OnceCell::new();
        #[doc(hidden)]
        pub(crate) static #value_type_ident: turbo_tasks::macro_helpers::Lazy<&turbo_tasks::ValueType> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                #value_type_init_ident.get_or_init(|| {
                    panic!(
                        concat!(
                            stringify!(#value_type_ident),
                            " has not been initialized (this should happen via the generated register function)"
                        )
                    )
                })
            });
        #[doc(hidden)]
        static #value_type_id_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::ValueTypeId> =
            turbo_tasks::macro_helpers::Lazy::new(|| {
                turbo_tasks::registry::get_value_type_id(*#value_type_ident)
            });


        #[doc(hidden)]
        #[allow(non_snake_case)]
        pub(crate) fn #register_value_type_ident(
            global_name: &'static str,
            f: impl FnOnce(&mut turbo_tasks::ValueType),
        ) {
            #value_type_init_ident.get_or_init(|| {
                let mut value = #new_value_type;
                f(&mut value);
                value
            }).register(global_name);
        }

        unsafe impl #impl_generics turbo_tasks::VcValueType for #ty #where_clause {
            type Read = #read;
            type CellMode = #cell_mode;

            fn get_value_type_id() -> turbo_tasks::ValueTypeId {
                *#value_type_id_ident
            }
        }
    }
}
