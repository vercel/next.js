use proc_macro::TokenStream;
use proc_macro2::Ident;
use quote::quote;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input,
    spanned::Spanned,
    Error, Fields, FieldsUnnamed, Item, ItemEnum, ItemStruct, Result, Token,
};

use crate::util::*;

pub fn get_register_trait_methods_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &("__register_".to_string()
            + &struct_ident.to_string()
            + "_"
            + &trait_ident.to_string()
            + "_trait_methods"),
        trait_ident.span(),
    )
}

pub fn get_check_trait_method_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &format!(
            "__trait_{}_need_to_be_in_turbo_tasks_value_attr_of_{}_",
            trait_ident, struct_ident
        ),
        trait_ident.span(),
    )
}

fn get_value_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_VALUE_TYPE"),
        ident.span(),
    )
}

fn get_value_type_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_VALUE_TYPE_ID"),
        ident.span(),
    )
}

pub fn get_as_super_ident(ident: &Ident) -> Ident {
    use convert_case::{Case, Casing};
    Ident::new(
        &format!("as_{}", ident.to_string().to_case(Case::Snake)),
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
        let ident = input.parse::<Ident>()?;
        match ident.to_string().as_str() {
            "none" => Ok(IntoMode::None),
            "new" => Ok(IntoMode::New),
            "shared" => Ok(IntoMode::Shared),
            _ => Err(Error::new_spanned(
                &ident,
                format!(
                    "unexpected {}, expected \"none\", \"new\", \"shared\"",
                    ident
                ),
            )),
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
        let ident = input.parse::<Ident>()?;
        match ident.to_string().as_str() {
            "none" => Ok(SerializationMode::None),
            "auto" => Ok(SerializationMode::Auto),
            "auto_for_input" => Ok(SerializationMode::AutoForInput),
            "custom" => Ok(SerializationMode::Custom),
            "custom_for_input" => Ok(SerializationMode::CustomForInput),
            _ => Err(Error::new_spanned(
                &ident,
                format!(
                    "unexpected {}, expected \"none\", \"auto\", \"auto_for_input\", \"custom\", \
                     \"custom_for_input\"",
                    ident
                ),
            )),
        }
    }
}

struct ValueArguments {
    traits: Vec<Ident>,
    serialization_mode: SerializationMode,
    into_mode: IntoMode,
    cell_mode: IntoMode,
    manual_eq: bool,
    transparent: bool,
}

impl Parse for ValueArguments {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = ValueArguments {
            traits: Vec::new(),
            serialization_mode: SerializationMode::Auto,
            into_mode: IntoMode::None,
            cell_mode: IntoMode::Shared,
            manual_eq: false,
            transparent: false,
        };
        if input.is_empty() {
            return Ok(result);
        }
        loop {
            let ident = input.parse::<Ident>()?;
            match ident.to_string().as_str() {
                "shared" => {
                    result.into_mode = IntoMode::Shared;
                    result.cell_mode = IntoMode::Shared;
                }
                "into" => {
                    input.parse::<Token![:]>()?;
                    result.into_mode = input.parse::<IntoMode>()?;
                }
                "serialization" => {
                    input.parse::<Token![:]>()?;
                    result.serialization_mode = input.parse::<SerializationMode>()?;
                }
                "cell" => {
                    input.parse::<Token![:]>()?;
                    result.cell_mode = input.parse::<IntoMode>()?;
                }
                "eq" => {
                    input.parse::<Token![:]>()?;
                    let ident = input.parse::<Ident>()?;

                    result.manual_eq = if ident == "manual" {
                        true
                    } else {
                        return Err(Error::new_spanned(
                            &ident,
                            format!("unexpected {}, expected \"manual\"", ident),
                        ));
                    };
                }
                "transparent" => {
                    result.transparent = true;
                }
                _ => {
                    result.traits.push(ident);
                    while input.peek(Token![+]) {
                        input.parse::<Token![+]>()?;
                        let ident = input.parse::<Ident>()?;
                        result.traits.push(ident);
                    }
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

pub fn value(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as Item);
    let ValueArguments {
        traits,
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
    let value_type_ident = get_value_type_ident(ident);
    let value_type_id_ident = get_value_type_id_ident(ident);
    let trait_refs: Vec<_> = traits.iter().map(get_ref_ident).collect();
    let as_trait_methods: Vec<_> = traits.iter().map(get_as_super_ident).collect();
    let check_from_impl_methods: Vec<_> = traits
        .iter()
        .map(|t| get_check_trait_method_ident(t, ident))
        .collect();

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
            impl From<#ident> for #ref_ident {
                fn from(content: #ident) -> Self {
                    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
                    #update_op
                    Self { node: cell.into() }
                }
            }

            #(impl From<#ident> for #trait_refs {
                fn from(content: #ident) -> Self {
                    let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
                    #update_op
                    std::convert::From::<turbo_tasks::RawVc>::from(cell.into())
                }
            })*
        }
    } else {
        quote! {}
    };

    let cell_update_op = match cell_mode {
        IntoMode::None => None,
        IntoMode::New => Some(quote! {
            cell.update_shared(content);
        }),
        IntoMode::Shared => Some(quote! {
            // TODO we could offer a From<&#ident> when #ident implemented Clone
            cell.compare_and_update_shared(content);
        }),
    };

    let (cell_prefix, cell_arg_type, cell_convert_content) = if let Some(inner_type) = inner_type {
        (
            quote! { pub },
            quote! { #inner_type },
            quote! {
                let content = #ident(content);
            },
        )
    } else {
        (quote! {}, quote! { #ident }, quote! {})
    };

    let cell = if let Some(update_op) = cell_update_op {
        quote! {
            /// Places a value in a cell of the current task.
            ///
            /// Cell is selected based on the value type and call order of `cell`.
            #cell_prefix fn cell(content: #cell_arg_type) -> #ref_ident {
                let cell = turbo_tasks::macro_helpers::find_cell_by_type(*#value_type_id_ident);
                #cell_convert_content
                #update_op
                #ref_ident { node: cell.into() }
            }

            /// Places a value in a cell of the current task.
            ///
            /// Cell is selected by the provided `key`. `key` must not be used twice during the current task.
            #cell_prefix fn keyed_cell<
                K: std::fmt::Debug + std::cmp::Eq + std::cmp::Ord + std::hash::Hash + turbo_tasks::Typed + turbo_tasks::TypedForInput + Send + Sync + 'static,
            >(key: K, content: #cell_arg_type) -> #ref_ident {
                let cell = turbo_tasks::macro_helpers::find_cell_by_key(*#value_type_id_ident, key);
                #cell_convert_content
                #update_op
                #ref_ident { node: cell.into() }
            }
        }
    } else {
        quote! {}
    };

    let trait_registrations: Vec<_> = traits
        .iter()
        .map(|trait_ident| {
            let register = get_register_trait_methods_ident(trait_ident, ident);
            quote! {
                #register(&mut value_type);
            }
        })
        .collect();

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
             // #[cfg(feature = "into_future")]
             impl std::future::IntoFuture for #ref_ident {
                type Output = turbo_tasks::Result<turbo_tasks::RawVcReadAndMapResult<#ident, #inner_type, fn(&#ident) -> &#inner_type>>;
                type IntoFuture = turbo_tasks::ReadAndMapRawVcFuture<#ident, #inner_type, fn(&#ident) -> &#inner_type>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>().map(|r| &r.0)
                }
            }

            impl std::future::IntoFuture for &#ref_ident {
                type Output = turbo_tasks::Result<turbo_tasks::RawVcReadAndMapResult<#ident, #inner_type, fn(&#ident) -> &#inner_type>>;
                type IntoFuture = turbo_tasks::ReadAndMapRawVcFuture<#ident, #inner_type, fn(&#ident) -> &#inner_type>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>().map(|r| &r.0)
                }
            }
        }
    } else {
        quote! {
             // #[cfg(feature = "into_future")]
             impl std::future::IntoFuture for #ref_ident {
                type Output = turbo_tasks::Result<turbo_tasks::RawVcReadResult<#ident>>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>()
                }
            }

            impl std::future::IntoFuture for &#ref_ident {
                type Output = turbo_tasks::Result<turbo_tasks::RawVcReadResult<#ident>>;
                type IntoFuture = turbo_tasks::ReadRawVcFuture<#ident>;
                fn into_future(self) -> Self::IntoFuture {
                    self.node.into_read::<#ident>()
                }
            }
        }
    };

    let strongly_consistent = if let Some(inner_type) = inner_type {
        quote! {
            #[must_use]
            pub fn strongly_consistent(self) -> turbo_tasks::ReadAndMapRawVcFuture<#ident, #inner_type, fn(&#ident) -> &#inner_type> {
                self.node.into_strongly_consistent_read::<#ident>().map(|r| &r.0)
            }
        }
    } else {
        quote! {
            #[must_use]
            pub fn strongly_consistent(self) -> turbo_tasks::ReadRawVcFuture<#ident> {
                self.node.into_strongly_consistent_read::<#ident>()
            }
        }
    };

    let expanded = quote! {
        #derive
        #eq_derive
        #item

        turbo_tasks::lazy_static! {
            pub(crate) static ref #value_type_ident: turbo_tasks::ValueType = {
                let mut value_type = #new_value_type;
                #(#trait_registrations)*
                value_type
            };
            static ref #value_type_id_ident: turbo_tasks::ValueTypeId = {
                turbo_tasks::registry::get_value_type_id(&#value_type_ident)
            };
        }

        impl turbo_tasks::Typed for #ident {
            fn get_value_type_id() -> turbo_tasks::ValueTypeId {
                *#value_type_id_ident
            }
        }
        #for_input_marker

        /// A reference to a value created by a turbo-tasks function.
        /// The type can either point to a cell in a [turbo_tasks::Task] or to the output of
        /// a [turbo_tasks::Task], which then transitively points to a cell again, or
        /// to an fatal execution error.
        ///
        /// `.resolve().await?` can be used to resolve it until it points to a cell.
        /// This is useful when storing the reference somewhere or when comparing it with other references.
        ///
        /// A reference is equal to another reference with it points to the same thing. No resolving is applied on comparision.
        #[derive(Clone, Copy, Debug, std::cmp::PartialOrd, std::cmp::Ord, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq, serde::Serialize, serde::Deserialize)]
        #vis struct #ref_ident {
            node: turbo_tasks::RawVc,
        }

        impl #ref_ident {
            #cell

            /// Resolve the reference until it points to a cell directly.
            ///
            /// This is async and will rethrow any fatal error that happened during task execution.
            pub async fn resolve(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve().await? })
            }

            pub async fn resolve_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Result<Option<Self>, turbo_tasks::ResolveTypeError> {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                let raw_vc = raw_vc.resolve_value(*#value_type_id_ident).await?;
                Ok(raw_vc.map(|raw_vc| #ref_ident { node: raw_vc }))
            }

            #strongly_consistent

            #(
                pub fn #as_trait_methods(self) -> #trait_refs {
                    std::convert::From::<turbo_tasks::RawVc>::from(self.node)
                }
            )*

            #(
                #[deny(unused)]
                #[doc(hidden)]
                #[allow(non_snake_case)]
                #[inline]
                fn #check_from_impl_methods() {}
            )*
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

        #(impl From<#ref_ident> for #trait_refs {
            fn from(node_ref: #ref_ident) -> Self {
                std::convert::From::<turbo_tasks::RawVc>::from(node_ref.into())
            }
        })*

        #into

        impl turbo_tasks::trace::TraceRawVcs for #ref_ident {
            fn trace_raw_vcs(&self, context: &mut turbo_tasks::trace::TraceRawVcsContext) {
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.node, context);
            }
        }
    };

    expanded.into()
}
