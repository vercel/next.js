use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input,
    punctuated::Punctuated,
    spanned::Spanned,
    Error, Fields, FieldsUnnamed, Item, ItemEnum, ItemStruct, Lit, LitStr, Meta, MetaNameValue,
    Result, Token,
};
use turbo_tasks_macros_shared::{get_ref_ident, get_register_value_type_ident};

fn get_read_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "ReadRef"), ident.span())
}

fn get_value_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

fn get_value_type_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE_ID", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

fn get_value_type_init_ident(ident: &Ident) -> Ident {
    Ident::new(
        &format!("{}_VALUE_TYPE_INIT", ident.to_string().to_uppercase()),
        ident.span(),
    )
}

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
}

impl Parse for ValueArguments {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = ValueArguments {
            serialization_mode: SerializationMode::Auto,
            into_mode: IntoMode::None,
            cell_mode: CellMode::Shared,
            manual_eq: false,
            transparent: false,
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
                (_, meta) => {
                    return Err(Error::new_spanned(
                        &meta,
                        format!(
                            "unexpected {:?}, expected \"shared\", \"into\", \"serialization\", \
                             \"cell\", \"eq\", \"transparent\"",
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
    let item = parse_macro_input!(input as Item);
    let ValueArguments {
        serialization_mode,
        into_mode,
        cell_mode,
        manual_eq,
        transparent,
    } = parse_macro_input!(args as ValueArguments);

    let (vis, ident) = match &item {
        Item::Enum(ItemEnum { vis, ident, .. }) => (vis, ident),
        Item::Struct(ItemStruct { vis, ident, .. }) => (vis, ident),
        _ => {
            item.span().unwrap().error("unsupported syntax").emit();

            return quote! {
                #item
            }
            .into();
        }
    };

    let ref_ident = get_ref_ident(ident);
    let read_ref_ident = get_read_ref_ident(ident);
    let value_type_init_ident = get_value_type_init_ident(ident);
    let value_type_ident = get_value_type_ident(ident);
    let value_type_id_ident = get_value_type_id_ident(ident);
    let register_value_type_ident = get_register_value_type_ident(ident);

    let mut inner_type = None;
    if transparent {
        if let Item::Struct(ItemStruct {
            fields: Fields::Unnamed(FieldsUnnamed { unnamed, .. }),
            ..
        }) = &item
        {
            if unnamed.len() == 1 {
                let field = unnamed.iter().next().unwrap();
                inner_type = Some(&field.ty);
            }
        }
    }

    let into_update_op = match into_mode {
        IntoMode::None => None,
        IntoMode::New => Some(quote! {
            cell.update_shared(content);
        }),
        IntoMode::Shared => Some(quote! {
            // TODO we could offer a From<&#ident> when #ident implemented Clone
            cell.compare_and_update_shared(content);
        }),
    };

    let into = if let Some(update_op) = into_update_op {
        quote! {
            impl From<#ident> for turbo_tasks::RawVc {
                fn from(content: #ident) -> Self {
                    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
                    #update_op
                    cell.into()
                }
            }

            impl From<#ident> for #ref_ident {
                fn from(content: #ident) -> Self {
                    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
                    #update_op
                    Self { node: cell.into() }
                }
            }
        }
    } else {
        quote! {}
    };

    let cell_update_op = match cell_mode {
        CellMode::New => quote! {
            cell.update_shared(content);
        },
        CellMode::Shared => quote! {
            // TODO we could offer a From<&#ident> when #ident implemented Clone
            cell.compare_and_update_shared(content);
        },
    };

    let (cell_prefix, cell_arg_type, cell_convert_content, cell_access_content) =
        if let Some(inner_type) = inner_type {
            (
                quote! { pub },
                quote! { #inner_type },
                quote! {
                    let content = #ident(content);
                },
                quote! {
                    content.0
                },
            )
        } else {
            (
                if let IntoMode::New | IntoMode::Shared = into_mode {
                    quote! { pub }
                } else {
                    quote! {}
                },
                quote! { #ident },
                quote! {},
                quote! { content },
            )
        };

    let cell = quote! {
        /// Places a value in a cell of the current task.
        ///
        /// Cell is selected based on the value type and call order of `cell`.
        #cell_prefix fn cell(content: #cell_arg_type) -> #ref_ident {
            let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
            #cell_convert_content
            #cell_update_op
            #ref_ident { node: cell.into() }
        }
    };

    let cell_struct = quote! {
        /// Places a value in a cell of the current task.
        ///
        /// Cell is selected based on the value type and call order of `cell`.
        #cell_prefix fn cell(self) -> #ref_ident {
            let content = self;
            #ref_ident::cell(#cell_access_content)
        }
    };

    let derive = match serialization_mode {
        SerializationMode::None | SerializationMode::Custom | SerializationMode::CustomForInput => {
            quote! {
                #[derive(turbo_tasks::trace::TraceRawVcs)]
            }
        }
        SerializationMode::Auto | SerializationMode::AutoForInput => quote! {
            #[derive(turbo_tasks::trace::TraceRawVcs, serde::Serialize, serde::Deserialize)]
        },
    };
    let debug_derive = if inner_type.is_some() {
        // Transparent structs have their own manual `ValueDebug` implementation.
        quote! {
            #[repr(transparent)]
        }
    } else {
        quote! {
            #[derive(turbo_tasks::debug::ValueDebugFormat, turbo_tasks::debug::internal::ValueDebug)]
        }
    };
    let eq_derive = if manual_eq {
        quote!()
    } else {
        quote!(
            #[derive(PartialEq, Eq)]
        )
    };

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

    let into_future = if let Some(inner_type) = inner_type {
        quote! {
             impl std::future::IntoFuture for #ref_ident {
                type Output = turbo_tasks::Result<#read_ref_ident>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident, #inner_type>;
                fn into_future(self) -> Self::IntoFuture {
                    /// SAFETY: Types are binary identical via #[repr(transparent)]
                    unsafe { self.node.into_transparent_read::<#ident, #inner_type>() }
                }
            }

            impl std::future::IntoFuture for &#ref_ident {
                type Output = turbo_tasks::Result<#read_ref_ident>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident, #inner_type>;
                fn into_future(self) -> Self::IntoFuture {
                    /// SAFETY: Types are binary identical via #[repr(transparent)]
                    unsafe { self.node.into_transparent_read::<#ident, #inner_type>() }
                }
            }
        }
    } else {
        quote! {
             impl std::future::IntoFuture for #ref_ident {
                type Output = turbo_tasks::Result<#read_ref_ident>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>()
                }
            }

            impl std::future::IntoFuture for &#ref_ident {
                type Output = turbo_tasks::Result<#read_ref_ident>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>()
                }
            }
        }
    };

    let strongly_consistent = {
        let (return_type, read) = if let Some(inner_type) = inner_type {
            (
                quote! {
                   turbo_tasks::ReadRawVcFuture<#ident, #inner_type>
                },
                quote! {
                    /// SAFETY: Types are binary identical via #[repr(transparent)]
                    unsafe { self.node.into_transparent_strongly_consistent_read::<#ident, #inner_type>() }
                },
            )
        } else {
            (
                quote! {
                    turbo_tasks::ReadRawVcFuture<#ident>
                },
                quote! {
                    self.node.into_strongly_consistent_read::<#ident>()
                },
            )
        };
        quote! {
            /// The invalidation of tasks due to changes is eventually consistent by default.
            /// Tasks will execute as early as any of their children has changed, even while
            /// other children or grandchildren are still computing (and may or may not result
            /// in a future invalidation). Tasks may execute multiple times until the graph
            /// reaches the end state. Partial applied changes might be visible to the user.
            /// But changes are available as fast as possible and won't be blocked by some
            /// slower parts of the graph (e. g. recomputation of blurred images, linting,
            /// etc).
            ///
            /// When you read a task with `.strongly_consistent()` it will make that one read
            /// operation strongly consistent. That means it will only return a result when all
            /// children and grandchildren in that graph have been settled. This means your
            /// current task will recompute less often, but it might also need to wait for
            /// slower operations in the graph and can't continue with partial applied changes.
            ///
            /// Reading strongly consistent is also far more expensive compared to normal
            /// reading, so it should be used with care.
            #[must_use]
            pub fn strongly_consistent(self) -> #return_type {
                #read
            }
        }
    };

    let value_debug_impl = if inner_type.is_some() {
        // For transparent values, we defer directly to the inner type's `ValueDebug`
        // implementation.
        quote! {
            #[turbo_tasks::value_impl]
            impl turbo_tasks::debug::ValueDebug for #ident {
                #[turbo_tasks::function]
                async fn dbg(&self) -> anyhow::Result<turbo_tasks::debug::ValueDebugStringVc> {
                    use turbo_tasks::debug::ValueDebugFormat;
                    (&self.0).value_debug_format().try_to_value_debug_string().await
                }
            }
        }
    } else {
        quote! {}
    };

    let read_ref = if let Some(inner_type) = inner_type {
        quote! {
            turbo_tasks::ReadRef<#ident, #inner_type>
        }
    } else {
        quote! {
            turbo_tasks::ReadRef<#ident, #ident>
        }
    };
    let read_ref = quote! {
        /// see [turbo_tasks::ReadRef]
        #vis type #read_ref_ident = #read_ref;
    };

    let value_debug_format_impl = quote! {
        impl turbo_tasks::debug::ValueDebugFormat for #ref_ident {
            fn value_debug_format(&self) -> turbo_tasks::debug::ValueDebugFormatString {
                turbo_tasks::debug::ValueDebugFormatString::Async(Box::pin(async move {
                    Ok(if let Some(value_debug) = turbo_tasks::debug::ValueDebugVc::resolve_from(self).await? {
                        value_debug.dbg().await?.to_string()
                    } else {
                        // This case means `SelfVc` does not implement `ValueDebugVc`, which is not possible
                        // if this implementation exists.
                        unreachable!()
                    })
                }))
            }
        }
    };

    let doc_msg_refer_to_ident = format!(" Vc for [`{ident}`]");

    let expanded = quote! {
        #derive
        #eq_derive
        #debug_derive
        #item

        impl #ident {
            #cell_struct
        }

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

        impl turbo_tasks::Typed for #ident {
            fn get_value_type_id() -> turbo_tasks::ValueTypeId {
                *#value_type_id_ident
            }
        }
        #for_input_marker

        #[doc = #doc_msg_refer_to_ident]
        ///
        /// A reference to a value created by a turbo-tasks function.
        /// The type can either point to a cell in a [`turbo_tasks::Task`] or to the output of
        /// a [`turbo_tasks::Task`], which then transitively points to a cell again, or
        /// to an fatal execution error.
        ///
        /// [`Self::resolve`]`().await?` can be used to resolve it until it points to a cell.
        /// This is useful when storing the reference somewhere or when comparing it with other references.
        ///
        /// A reference is equal to another reference when it points to the same thing. No resolving is applied on comparison.
        #[derive(Clone, Copy, Debug, std::cmp::PartialOrd, std::cmp::Ord, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq, serde::Serialize, serde::Deserialize)]
        #vis struct #ref_ident {
            node: turbo_tasks::RawVc,
        }

        #read_ref

        impl #ref_ident {
            #cell

            /// see [turbo_tasks::RawVc::resolve]
            pub async fn resolve(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve().await? })
            }

            /// see [turbo_tasks::RawVc::resolve_strongly_consistent]
            pub async fn resolve_strongly_consistent(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve_strongly_consistent().await? })
            }

            /// see [turbo_tasks::RawVc::cell_local]
            pub async fn cell_local(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.cell_local().await? })
            }

            pub async fn resolve_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Result<Option<Self>, turbo_tasks::ResolveTypeError> {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                let raw_vc = raw_vc.resolve_value(*#value_type_id_ident).await?;
                Ok(raw_vc.map(|raw_vc| #ref_ident { node: raw_vc }))
            }

            #strongly_consistent
        }

        impl turbo_tasks::CollectiblesSource for #ref_ident {
            fn take_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> turbo_tasks::CollectiblesFuture<T> {
                self.node.take_collectibles()
            }

            fn peek_collectibles<T: turbo_tasks::ValueTraitVc>(self) -> turbo_tasks::CollectiblesFuture<T> {
                self.node.peek_collectibles()
            }
        }

        impl turbo_tasks::ValueVc for #ref_ident {
            #[inline]
            fn get_value_type_id() -> turbo_tasks::ValueTypeId {
                *#value_type_id_ident
            }

            #[inline]
            fn get_trait_type_ids() -> Box<dyn Iterator<Item = turbo_tasks::TraitTypeId>> {
                Box::new(#value_type_ident.traits_iter())
            }
        }

        #into_future

        impl turbo_tasks::FromTaskInput<'_> for #ref_ident {
            type Error = turbo_tasks::Error;

            fn try_from(value: &turbo_tasks::TaskInput) -> Result<Self, Self::Error> {
                Ok(Self { node: value.try_into()? })
            }
        }

        impl From<turbo_tasks::RawVc> for #ref_ident {
            fn from(node: turbo_tasks::RawVc) -> Self {
                Self { node }
            }
        }

        impl From<#ref_ident> for turbo_tasks::RawVc {
            fn from(node_ref: #ref_ident) -> Self {
                node_ref.node
            }
        }

        impl From<&#ref_ident> for turbo_tasks::RawVc {
            fn from(node_ref: &#ref_ident) -> Self {
                node_ref.node.clone()
            }
        }

        impl From<#ref_ident> for turbo_tasks::TaskInput {
            fn from(node_ref: #ref_ident) -> Self {
                node_ref.node.into()
            }
        }

        impl From<&#ref_ident> for turbo_tasks::TaskInput {
            fn from(node_ref: &#ref_ident) -> Self {
                node_ref.node.clone().into()
            }
        }

        #into

        impl turbo_tasks::trace::TraceRawVcs for #ref_ident {
            fn trace_raw_vcs(&self, context: &mut turbo_tasks::trace::TraceRawVcsContext) {
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.node, context);
            }
        }

        #value_debug_format_impl
        #value_debug_impl
    };

    expanded.into()
}
