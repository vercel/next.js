#![feature(proc_macro_diagnostic)]
#![feature(allow_internal_unstable)]
#![feature(box_patterns)]

extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::{Ident, Literal, Span, TokenStream as TokenStream2};
use quote::quote;
use syn::{
    parenthesized,
    parse::{Parse, ParseStream},
    parse_macro_input,
    punctuated::Punctuated,
    spanned::Spanned,
    token::Paren,
    AngleBracketedGenericArguments, Attribute, Error, Expr, Field, Fields, FieldsNamed,
    FieldsUnnamed, FnArg, GenericArgument, ImplItem, ImplItemMethod, Item, ItemEnum, ItemFn,
    ItemImpl, ItemStruct, ItemTrait, Pat, PatIdent, PatType, Path, PathArguments, PathSegment,
    Receiver, Result, ReturnType, Signature, Token, TraitBound, TraitItem, TraitItemMethod, Type,
    TypeParamBound, TypePath, TypeReference, TypeTuple,
};

fn get_ref_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "Vc"), ident.span())
}

fn get_internal_function_ident(ident: &Ident) -> Ident {
    Ident::new(&(ident.to_string() + "_inline"), ident.span())
}

fn get_internal_trait_impl_function_ident(trait_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &("__trait_call_".to_string() + &trait_ident.to_string() + "_" + &ident.to_string()),
        ident.span(),
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

fn get_trait_type_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_TRAIT_TYPE"),
        ident.span(),
    )
}

fn get_trait_type_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_TRAIT_TYPE_ID"),
        ident.span(),
    )
}

fn get_register_trait_methods_ident(trait_ident: &Ident, struct_ident: &Ident) -> Ident {
    Ident::new(
        &("__register_".to_string()
            + &struct_ident.to_string()
            + "_"
            + &trait_ident.to_string()
            + "_trait_methods"),
        trait_ident.span(),
    )
}

fn get_function_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_FUNCTION"),
        ident.span(),
    )
}

fn get_function_id_ident(ident: &Ident) -> Ident {
    Ident::new(
        &(ident.to_string().to_uppercase() + "_FUNCTION_ID"),
        ident.span(),
    )
}

fn get_trait_impl_function_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &(struct_ident.to_string().to_uppercase()
            + "_IMPL_"
            + &ident.to_string().to_uppercase()
            + "_FUNCTION"),
        ident.span(),
    )
}

fn get_trait_impl_function_id_ident(struct_ident: &Ident, ident: &Ident) -> Ident {
    Ident::new(
        &(struct_ident.to_string().to_uppercase()
            + "_IMPL_"
            + &ident.to_string().to_uppercase()
            + "_FUNCTION_ID"),
        ident.span(),
    )
}

fn get_as_super_ident(ident: &Ident) -> Ident {
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
            _ => {
                return Err(Error::new_spanned(
                    &ident,
                    format!(
                        "unexpected {}, expected \"none\", \"new\", \"shared\"",
                        ident.to_string()
                    ),
                ))
            }
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
            _ => {
                return Err(Error::new_spanned(
                    &ident,
                    format!(
                        "unexpected {}, expected \"none\", \"auto\", \"auto_for_input\", \
                         \"custom\", \"custom_for_input\"",
                        ident.to_string()
                    ),
                ))
            }
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

                    result.manual_eq = if ident.to_string() == "manual" {
                        true
                    } else {
                        return Err(Error::new_spanned(
                            &ident,
                            format!("unexpected {}, expected \"manual\"", ident.to_string()),
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

/// Creates a ValueVc struct for a `struct` or `enum` that represent
/// that type placed into a cell in a Task.
///
/// That ValueVc object can be `.await?`ed to get a readonly reference
/// to the original value.
///
/// `into` argument (`#[turbo_tasks::value(into: xxx)]`)
///
/// When provided the ValueVc implement `From<Value>` to allow to convert
/// a Value to a ValueVc by placing it into a cell in a Task.
///
/// `into: new`: Always overrides the value in the cell. Invalidating all
/// dependent tasks.
///
/// `into: shared`: Compares with the existing value in the cell, before
/// overriding it. Requires Value to implement [Eq].
///
/// TODO: add more documentation: presets, traits
#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_attribute]
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

    let ref_ident = get_ref_ident(&ident);
    let value_type_ident = get_value_type_ident(&ident);
    let value_type_id_ident = get_value_type_id_ident(&ident);
    let trait_refs: Vec<_> = traits.iter().map(|ident| get_ref_ident(&ident)).collect();
    let as_trait_methods: Vec<_> = traits
        .iter()
        .map(|ident| get_as_super_ident(&ident))
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
            let register = get_register_trait_methods_ident(trait_ident, &ident);
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
        #[derive(Clone, Copy, Debug, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq, serde::Serialize, serde::Deserialize)]
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

enum Constructor {
    Default,
    Compare(Option<Ident>),
    CompareEnum(Option<Ident>),
    KeyAndCompare(Option<Expr>, Option<Ident>),
    KeyAndCompareEnum(Option<Expr>, Option<Ident>),
    Key(Option<Expr>),
}

impl Parse for Constructor {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut result = Constructor::Default;
        if input.is_empty() {
            return Ok(result);
        }
        let content;
        parenthesized!(content in input);
        loop {
            let ident = content.parse::<Ident>()?;
            match ident.to_string().as_str() {
                "compare" => {
                    let compare_name = if content.peek(Token![:]) {
                        content.parse::<Token![:]>()?;
                        Some(content.parse::<Ident>()?)
                    } else {
                        None
                    };
                    result = match result {
                        Constructor::Default => Constructor::Compare(compare_name),
                        Constructor::Key(key_expr) => {
                            Constructor::KeyAndCompare(key_expr, compare_name)
                        }
                        _ => {
                            return Err(content.error(format!(
                                "\"compare\" can't be combined with previous values"
                            )));
                        }
                    }
                }
                "compare_enum" => {
                    let compare_name = if content.peek(Token![:]) {
                        content.parse::<Token![:]>()?;
                        Some(content.parse::<Ident>()?)
                    } else {
                        None
                    };
                    result = match result {
                        Constructor::Default => Constructor::CompareEnum(compare_name),
                        Constructor::Key(key_expr) => {
                            Constructor::KeyAndCompareEnum(key_expr, compare_name)
                        }
                        _ => {
                            return Err(content.error(format!(
                                "\"compare\" can't be combined with previous values"
                            )));
                        }
                    }
                }
                "key" => {
                    let key_expr = if content.peek(Token![:]) {
                        content.parse::<Token![:]>()?;
                        Some(content.parse::<Expr>()?)
                    } else {
                        None
                    };
                    result = match result {
                        Constructor::Default => Constructor::Key(key_expr),
                        Constructor::Compare(compare_name) => {
                            Constructor::KeyAndCompare(key_expr, compare_name)
                        }
                        _ => {
                            return Err(content
                                .error(format!("\"key\" can't be combined with previous values")));
                        }
                    };
                }
                _ => {
                    return Err(Error::new_spanned(
                        &ident,
                        format!(
                            "unexpected {}, expected \"key\", \"compare\" or \"compare_enum\"",
                            ident.to_string()
                        ),
                    ))
                }
            }
            if content.is_empty() {
                return Ok(result);
            } else if content.peek(Token![,]) {
                content.parse::<Token![,]>()?;
            } else {
                return Err(content.error("expected \",\" or end of attribute"));
            }
        }
    }
}

fn is_attribute(attr: &Attribute, name: &str) -> bool {
    let path = &attr.path;
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident.to_string() == "turbo_tasks" => {
            match iter.next() {
                Some(seg) if seg.arguments.is_empty() && seg.ident.to_string() == name => {
                    iter.next().is_none()
                }
                _ => false,
            }
        }
        _ => false,
    }
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_attribute]
pub fn value_trait(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemTrait);

    let ItemTrait {
        vis,
        ident,
        items,
        supertraits,
        attrs,
        trait_token,
        colon_token,
        ..
    } = &item;

    let supertraits = supertraits.into_iter().collect::<Vec<_>>();

    let supertrait_refs: Vec<_> = supertraits
        .iter()
        .filter_map(|ident| {
            if let TypeParamBound::Trait(TraitBound {
                path: Path { segments, .. },
                ..
            }) = ident
            {
                let PathSegment { ident, .. } = segments.iter().next()?;
                Some(get_ref_ident(ident))
            } else {
                None
            }
        })
        .collect();

    let as_supertrait_methods: Vec<_> = supertraits
        .iter()
        .filter_map(|ident| {
            if let TypeParamBound::Trait(TraitBound {
                path: Path { segments, .. },
                ..
            }) = ident
            {
                let PathSegment { ident, .. } = segments.iter().next()?;
                Some(get_as_super_ident(ident))
            } else {
                None
            }
        })
        .collect();

    let ref_ident = get_ref_ident(ident);
    let trait_type_ident = get_trait_type_ident(&ident);
    let trait_type_id_ident = get_trait_type_id_ident(&ident);
    let mut trait_fns = Vec::new();

    for item in items.iter() {
        if let TraitItem::Method(TraitItemMethod {
            sig:
                Signature {
                    ident: method_ident,
                    inputs,
                    output,
                    ..
                },
            ..
        }) = item
        {
            let output_type = get_return_type(output);
            let args = inputs.iter().filter_map(|arg| match arg {
                FnArg::Receiver(_) => None,
                FnArg::Typed(PatType { pat, .. }) => Some(quote! {
                    #pat.into()
                }),
            });
            let method_args: Vec<_> = inputs.iter().collect();
            let convert_result_code = if is_empty_type(&output_type) {
                quote! {}
            } else {
                quote! { std::convert::From::<turbo_tasks::RawVc>::from(result) }
            };
            trait_fns.push(quote! {
                fn #method_ident(#(#method_args),*) -> #output_type {
                    // TODO use const string
                    let result = turbo_tasks::trait_call(*#trait_type_id_ident, std::borrow::Cow::Borrowed(stringify!(#method_ident)), vec![self.into(), #(#args),*]);
                    #convert_result_code
                }
            });
        }
    }

    let expanded = quote! {
        #(#attrs)*
        #vis #trait_token #ident #colon_token #(std::convert::Into<#supertrait_refs>)+* {
            #(#items)*
        }

        turbo_tasks::lazy_static! {
            pub(crate) static ref #trait_type_ident: turbo_tasks::TraitType = turbo_tasks::TraitType::new(std::any::type_name::<#ref_ident>().to_string());
            pub(crate) static ref #trait_type_id_ident: turbo_tasks::TraitTypeId = turbo_tasks::registry::get_trait_type_id(&#trait_type_ident);
        }

        #[derive(Clone, Copy, Debug, std::hash::Hash, std::cmp::Eq, std::cmp::PartialEq, serde::Serialize, serde::Deserialize)]
        #vis struct #ref_ident {
            node: turbo_tasks::RawVc,
        }

        impl #ref_ident {
            #[doc(hidden)]
            #[inline]
            pub fn __type() -> turbo_tasks::TraitTypeId {
                *#trait_type_id_ident
            }

            pub async fn resolve(self) -> turbo_tasks::Result<Self> {
                Ok(Self { node: self.node.resolve().await? })
            }

            pub async fn resolve_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Result<Option<Self>, turbo_tasks::ResolveTypeError> {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                let raw_vc = raw_vc.resolve_trait(*#trait_type_id_ident).await?;
                Ok(raw_vc.map(|raw_vc| #ref_ident { node: raw_vc }))
            }

            pub fn cast_from(super_trait_vc: impl std::convert::Into<turbo_tasks::RawVc>) -> Self {
                let raw_vc: turbo_tasks::RawVc = super_trait_vc.into();
                #ref_ident { node: raw_vc }
            }

            #(pub #trait_fns)*
        }

        impl<T> #ident for T where #ref_ident: std::convert::From<T>, turbo_tasks::TaskInput: for<'a> std::convert::From<&'a T> #(, #supertrait_refs: std::convert::From<T>)* {
            #(default #trait_fns)*
        }

        #(
            impl From<#ref_ident> for #supertrait_refs {
                fn from(node_ref: #ref_ident) -> Self {
                    std::convert::From::<turbo_tasks::RawVc>::from(node_ref.into())
                }
            }

            impl #ref_ident {
                pub fn #as_supertrait_methods(self) -> #supertrait_refs {
                    std::convert::From::<turbo_tasks::RawVc>::from(self.node)
                }
            }
        )*

        impl turbo_tasks::FromTaskInput<'_> for #ref_ident {
            type Error = turbo_tasks::Error;

            fn try_from(value: &turbo_tasks::TaskInput) -> Result<Self, Self::Error> {
                Ok(Self { node: std::convert::TryFrom::try_from(value)? })
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

        impl turbo_tasks::trace::TraceRawVcs for #ref_ident {
            fn trace_raw_vcs(&self, context: &mut turbo_tasks::trace::TraceRawVcsContext) {
                turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.node, context);
            }
        }

    };
    expanded.into()
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_attribute]
pub fn value_impl(_args: TokenStream, input: TokenStream) -> TokenStream {
    fn generate_for_vc_impl(vc_ident: &Ident, items: &[ImplItem]) -> TokenStream2 {
        let mut functions = Vec::new();

        for item in items.iter() {
            match item {
                ImplItem::Method(ImplItemMethod {
                    attrs,
                    vis,
                    defaultness: _,
                    sig,
                    block,
                }) => {
                    let function_attr = attrs.iter().find(|attr| is_attribute(attr, "function"));
                    let attrs = if function_attr.is_none() {
                        item.span()
                            .unwrap()
                            .error("#[turbo_tasks::function] attribute missing")
                            .emit();
                        attrs.clone()
                    } else {
                        attrs
                            .iter()
                            .filter(|attr| !is_attribute(attr, "function"))
                            .cloned()
                            .collect()
                    };
                    let Signature { ident, output, .. } = sig;

                    let output_type = get_return_type(output);
                    let inline_ident = get_internal_function_ident(ident);
                    let function_ident = get_trait_impl_function_ident(vc_ident, ident);
                    let function_id_ident = get_trait_impl_function_id_ident(vc_ident, ident);

                    let mut inline_sig = sig.clone();
                    inline_sig.ident = inline_ident.clone();

                    let mut external_sig = sig.clone();
                    external_sig.asyncness = None;

                    let (native_function_code, mut input_raw_vc_arguments) =
                        gen_native_function_code(
                            // use const string
                            quote! { stringify!(#vc_ident::#ident) },
                            quote! { #vc_ident::#inline_ident },
                            &function_ident,
                            &function_id_ident,
                            sig.asyncness.is_some(),
                            &sig.inputs,
                            &output_type,
                            Some(vc_ident),
                            true,
                        );

                    let (raw_output_type, _) = unwrap_result_type(&output_type);
                    let convert_result_code = if is_empty_type(raw_output_type) {
                        external_sig.output = ReturnType::Default;
                        quote! {}
                    } else {
                        external_sig.output = ReturnType::Type(
                            Token![->](raw_output_type.span()),
                            Box::new(raw_output_type.clone()),
                        );
                        quote! { std::convert::From::<turbo_tasks::RawVc>::from(result) }
                    };
                    let custom_self_type = if let Some(FnArg::Typed(PatType {
                        pat: box Pat::Ident(PatIdent { ident, .. }),
                        ..
                    })) = sig.inputs.first()
                    {
                        ident == "self_vc"
                    } else {
                        false
                    };
                    if custom_self_type {
                        let external_self = external_sig.inputs.first_mut().unwrap();
                        *external_self = FnArg::Receiver(Receiver {
                            attrs: Vec::new(),
                            reference: Some((Token![&](Span::call_site()), None)),
                            mutability: None,
                            self_token: Token![self](Span::call_site()),
                        });
                        input_raw_vc_arguments[0] = quote! { self.into() };
                    }

                    functions.push(quote! {
                        impl #vc_ident {
                            #(#attrs)*
                            #vis #external_sig {
                                let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
                                #convert_result_code
                            }

                            #(#attrs)*
                            #vis #inline_sig #block
                        }

                        #native_function_code
                    })
                }
                _ => {}
            }
        }

        return quote! {
            #(#functions)*
        };
    }

    fn generate_for_trait_impl(
        trait_ident: &Ident,
        struct_ident: &Ident,
        items: &[ImplItem],
    ) -> TokenStream2 {
        let register = get_register_trait_methods_ident(trait_ident, struct_ident);
        let ref_ident = get_ref_ident(struct_ident);
        let trait_ref_ident = get_ref_ident(trait_ident);
        let mut trait_registers = Vec::new();
        let mut impl_functions = Vec::new();
        let mut trait_functions = Vec::new();
        let mut trait_impl_functions = Vec::new();
        for item in items.iter() {
            match item {
                ImplItem::Method(ImplItemMethod {
                    sig, attrs, block, ..
                }) => {
                    let function_attr = attrs.iter().find(|attr| is_attribute(attr, "function"));
                    let attrs = if function_attr.is_none() {
                        item.span()
                            .unwrap()
                            .error("#[turbo_tasks::function] attribute missing")
                            .emit();
                        attrs.clone()
                    } else {
                        attrs
                            .iter()
                            .filter(|attr| !is_attribute(attr, "function"))
                            .cloned()
                            .collect()
                    };
                    let Signature {
                        ident,
                        inputs,
                        output,
                        asyncness,
                        ..
                    } = sig;
                    let output_type = get_return_type(output);
                    let function_ident = get_trait_impl_function_ident(struct_ident, ident);
                    let function_id_ident = get_trait_impl_function_id_ident(struct_ident, ident);
                    let internal_function_ident =
                        get_internal_trait_impl_function_ident(trait_ident, ident);
                    trait_registers.push(quote! {
                        value_type.register_trait_method(#trait_ref_ident::__type(), stringify!(#ident).to_string(), *#function_id_ident);
                    });
                    let name =
                        Literal::string(&(struct_ident.to_string() + "::" + &ident.to_string()));
                    let (native_function_code, mut input_raw_vc_arguments) =
                        gen_native_function_code(
                            quote! { #name },
                            quote! { #struct_ident::#internal_function_ident },
                            &function_ident,
                            &function_id_ident,
                            asyncness.is_some(),
                            inputs,
                            &output_type,
                            Some(&ref_ident),
                            false,
                        );
                    let mut new_sig = sig.clone();
                    new_sig.ident = internal_function_ident;
                    let mut external_sig = sig.clone();
                    external_sig.asyncness = None;
                    let external_self = external_sig.inputs.first_mut().unwrap();
                    let custom_self_type = matches!(sig.inputs.first().unwrap(), FnArg::Typed(..));
                    if custom_self_type {
                        *external_self = FnArg::Receiver(Receiver {
                            attrs: Vec::new(),
                            reference: Some((Token![&](Span::call_site()), None)),
                            mutability: None,
                            self_token: Token![self](Span::call_site()),
                        });
                        input_raw_vc_arguments[0] = quote! { self.into() };
                    }
                    impl_functions.push(quote! {
                        impl #struct_ident {
                            #(#attrs)*
                            #[allow(non_snake_case)]
                            #new_sig #block
                        }

                        #native_function_code
                    });

                    let (raw_output_type, _) = unwrap_result_type(&output_type);
                    let convert_result_code = if is_empty_type(raw_output_type) {
                        external_sig.output = ReturnType::Default;
                        quote! {}
                    } else {
                        external_sig.output = ReturnType::Type(
                            Token![->](raw_output_type.span()),
                            Box::new(raw_output_type.clone()),
                        );
                        quote! { std::convert::From::<turbo_tasks::RawVc>::from(result) }
                    };

                    trait_functions.push(quote!{
                        #(#attrs)*
                        pub #external_sig {
                            let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
                            #convert_result_code
                        }
                    });

                    let args = inputs
                        .iter()
                        .enumerate()
                        .map(|(i, input)| match input {
                            FnArg::Receiver(_) => {
                                quote! { self }
                            }
                            FnArg::Typed(arg) => {
                                if i == 0 {
                                    quote! { self }
                                } else {
                                    let pat = &arg.pat;
                                    quote! { #pat }
                                }
                            }
                        })
                        .collect::<Vec<_>>();

                    trait_impl_functions.push(quote! {
                        #(#attrs)*
                        #external_sig {
                            #ref_ident::#ident(#(#args),*)
                        }
                    });
                }
                _ => {}
            }
        }
        quote! {
            #[allow(non_snake_case)]
            fn #register(value_type: &mut turbo_tasks::ValueType) {
                value_type.register_trait(#trait_ref_ident::__type());
                #(#trait_registers)*
            }

            #(#impl_functions)*

            impl #ref_ident {
                #(#trait_functions)*
            }

            impl #trait_ident for #ref_ident {
                #(#trait_impl_functions)*
            }
        }
    }

    let item = parse_macro_input!(input as ItemImpl);

    if let Type::Path(TypePath {
        qself: None,
        path: Path { segments, .. },
    }) = &*item.self_ty
    {
        if segments.len() == 1 {
            if let Some(PathSegment {
                arguments: PathArguments::None,
                ident,
            }) = segments.first()
            {
                match &item.trait_ {
                    None => {
                        let code = generate_for_vc_impl(ident, &item.items);
                        return quote! {
                            #code
                        }
                        .into();
                    }
                    Some((_, Path { segments, .. }, _)) => {
                        if segments.len() == 1 {
                            if let Some(PathSegment {
                                arguments: PathArguments::None,
                                ident: trait_ident,
                            }) = segments.first()
                            {
                                let code = generate_for_trait_impl(trait_ident, ident, &item.items);
                                return quote! {
                                    #code
                                }
                                .into();
                            }
                        }
                    }
                }
            }
        }
    }
    item.span().unwrap().error("unsupported syntax").emit();
    quote! {
        #item
    }
    .into()
}

fn get_return_type(output: &ReturnType) -> Type {
    match output {
        ReturnType::Default => Type::Tuple(TypeTuple {
            paren_token: Paren::default(),
            elems: Punctuated::new(),
        }),
        ReturnType::Type(_, ref output_type) => (**output_type).clone(),
    }
}

#[allow_internal_unstable(min_specialization, into_future, trivial_bounds)]
#[proc_macro_attribute]
pub fn function(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);
    let ItemFn {
        attrs,
        vis,
        sig,
        block,
    } = &item;
    let output_type = get_return_type(&sig.output);
    let ident = &sig.ident;
    let function_ident = get_function_ident(ident);
    let function_id_ident = get_function_id_ident(ident);
    let inline_ident = get_internal_function_ident(ident);

    let mut inline_sig = sig.clone();
    inline_sig.ident = inline_ident.clone();

    let mut external_sig = sig.clone();
    external_sig.asyncness = None;

    let (native_function_code, input_raw_vc_arguments) = gen_native_function_code(
        quote! { stringify!(#ident) },
        quote! { #inline_ident },
        &function_ident,
        &function_id_ident,
        sig.asyncness.is_some(),
        &sig.inputs,
        &output_type,
        None,
        false,
    );

    let (raw_output_type, _) = unwrap_result_type(&output_type);
    let convert_result_code = if is_empty_type(raw_output_type) {
        external_sig.output = ReturnType::Default;
        quote! {}
    } else {
        external_sig.output = ReturnType::Type(
            Token![->](raw_output_type.span()),
            Box::new(raw_output_type.clone()),
        );
        quote! { std::convert::From::<turbo_tasks::RawVc>::from(result) }
    };

    return quote! {
        #(#attrs)*
        #vis #external_sig {
            let result = turbo_tasks::dynamic_call(*#function_id_ident, vec![#(#input_raw_vc_arguments),*]);
            #convert_result_code
        }

        #(#attrs)*
        #vis #inline_sig #block

        #native_function_code
    }
    .into();
}

fn unwrap_result_type(ty: &Type) -> (&Type, bool) {
    if let Type::Path(TypePath {
        qself: None,
        path: Path { segments, .. },
    }) = ty
    {
        if let Some(PathSegment {
            ident,
            arguments: PathArguments::AngleBracketed(AngleBracketedGenericArguments { args, .. }),
        }) = segments.last()
        {
            if &ident.to_string() == "Result" {
                if let Some(GenericArgument::Type(ty)) = args.first() {
                    return (ty, true);
                }
            }
        }
    }
    (ty, false)
}

fn is_empty_type(ty: &Type) -> bool {
    if let Type::Tuple(TypeTuple { elems, .. }) = ty {
        if elems.is_empty() {
            return true;
        }
    }
    false
}

fn gen_native_function_code(
    name_code: TokenStream2,
    original_function: TokenStream2,
    function_ident: &Ident,
    function_id_ident: &Ident,
    async_function: bool,
    inputs: &Punctuated<FnArg, Token![,]>,
    output_type: &Type,
    self_ref_type: Option<&Ident>,
    self_is_ref_type: bool,
) -> (TokenStream2, Vec<TokenStream2>) {
    let mut input_extraction = Vec::new();
    let mut input_convert = Vec::new();
    let mut input_clone = Vec::new();
    let mut input_final = Vec::new();
    let mut input_arguments = Vec::new();
    let mut input_raw_vc_arguments = Vec::new();

    let mut index: i32 = 1;

    for input in inputs {
        match input {
            FnArg::Receiver(Receiver { mutability, .. }) => {
                if mutability.is_some() {
                    input
                        .span()
                        .unwrap()
                        .error(
                            "mutable self is not supported in turbo_task traits (nodes are \
                             immutable)",
                        )
                        .emit();
                }
                let self_ref_type = self_ref_type.unwrap();
                input_extraction.push(quote! {
                    let __self = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!(concat!(#name_code, "() self argument missing")))?;
                });
                input_convert.push(quote! {
                    let __self: #self_ref_type = turbo_tasks::FromTaskInput::try_from(__self)?;
                });
                input_clone.push(quote! {
                    let __self = std::clone::Clone::clone(&__self);
                });
                if self_is_ref_type {
                    input_final.push(quote! {});
                    input_arguments.push(quote! {
                        __self
                    });
                } else {
                    input_final.push(quote! {
                        let __self = __self.await?;
                    });
                    input_arguments.push(quote! {
                        &*__self
                    });
                }
                input_raw_vc_arguments.push(quote! {
                    self.into()
                });
            }
            FnArg::Typed(PatType { pat, ty, .. }) => {
                input_extraction.push(quote! {
                    let #pat = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!(concat!(#name_code, "() argument ", stringify!(#index), " (", stringify!(#pat), ") missing")))?;
                });
                input_final.push(quote! {});
                if let Type::Reference(TypeReference {
                    and_token,
                    lifetime: _,
                    mutability,
                    elem,
                }) = &**ty
                {
                    let ty = if let Type::Path(TypePath { qself: None, path }) = &**elem {
                        if path.is_ident("str") {
                            quote! { String }
                        } else {
                            quote! { #elem }
                        }
                    } else {
                        quote! { #elem }
                    };
                    input_convert.push(quote! {
                        let #pat: #ty = turbo_tasks::FromTaskInput::try_from(#pat)?;
                    });
                    input_clone.push(quote! {
                        let #pat = std::clone::Clone::clone(&#pat);
                    });
                    input_arguments.push(quote! {
                        #and_token #mutability #pat
                    });
                } else {
                    input_convert.push(quote! {
                        let #pat: #ty = turbo_tasks::FromTaskInput::try_from(#pat)?;
                    });
                    input_clone.push(quote! {
                        let #pat = std::clone::Clone::clone(&#pat);
                    });
                    input_arguments.push(quote! {
                        #pat
                    });
                }
                input_raw_vc_arguments.push(quote! {
                    #pat.into()
                });
                index += 1;
            }
        }
    }
    let original_call_code = if async_function {
        quote! { #original_function(#(#input_arguments),*).await }
    } else {
        quote! { #original_function(#(#input_arguments),*) }
    };
    let (raw_output_type, is_result) = unwrap_result_type(output_type);
    let original_call_code = match (is_result, is_empty_type(raw_output_type)) {
        (true, true) => quote! {
            (#original_call_code).map(|_| turbo_tasks::NothingVc::new().into())
        },
        (true, false) => quote! { #original_call_code.map(|v| v.into()) },
        (false, true) => quote! {
            #original_call_code;
            Ok(turbo_tasks::NothingVc::new().into())
        },
        (false, false) => quote! { Ok(#original_call_code.into()) },
    };
    (
        quote! {
            turbo_tasks::lazy_static! {
                pub(crate) static ref #function_ident: turbo_tasks::NativeFunction = turbo_tasks::NativeFunction::new(#name_code.to_string(), |inputs| {
                    let mut __iter = inputs.iter();
                    #(#input_extraction)*
                    if __iter.next().is_some() {
                        return Err(anyhow::anyhow!(concat!(#name_code, "() called with too many arguments")));
                    }
                    #(#input_convert)*
                    Ok(Box::new(move || {
                        #(#input_clone)*
                        Box::pin(async move {
                            #(#input_final)*
                            #original_call_code
                        })
                    }))
                });
                static ref #function_id_ident: turbo_tasks::FunctionId = turbo_tasks::registry::get_function_id(&#function_ident);
            }
        },
        input_raw_vc_arguments,
    )
}

#[proc_macro_derive(TraceRawVcs, attributes(trace_ignore))]
pub fn derive_trace_raw_vcs_attr(input: TokenStream) -> TokenStream {
    fn ignore_field(field: &Field) -> bool {
        field
            .attrs
            .iter()
            .any(|attr| attr.path.is_ident("trace_ignore"))
    }

    let item = parse_macro_input!(input as Item);

    let (ident, generics, trace_items) = match &item {
        Item::Enum(ItemEnum {
            ident,
            generics,
            variants,
            ..
        }) => (ident, generics, {
            let variants_code: Vec<_> = variants.iter().map(|variant| {
                let variant_ident = &variant.ident;
                match &variant.fields {
                    Fields::Named(FieldsNamed{ named, ..}) => {
                        let idents: Vec<_> = named.iter()
                            .filter(|field| !ignore_field(field))
                            .filter_map(|field| field.ident.clone())
                            .collect();
                        let ident_pats: Vec<_> = named.iter()
                            .filter_map(|field| {
                                let ident = field.ident.as_ref()?;
                                if ignore_field(field) {
                                    Some(quote! { #ident: _ })
                                } else {
                                    Some(quote! { ref #ident })
                                }
                            })
                            .collect();
                        quote! {
                            #ident::#variant_ident{ #(#ident_pats),* } => {
                                #(
                                    turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(#idents, context);
                                )*
                            }
                        }
                    },
                    Fields::Unnamed(FieldsUnnamed{ unnamed, .. }) => {
                        let idents: Vec<_> = unnamed.iter()
                            .enumerate()
                            .map(|(i, field)| if ignore_field(field) {
                                Ident::new("_", field.span())
                            } else {
                                Ident::new(&format!("tuple_item_{}", i), field.span())
                            })
                            .collect();
                        let active_idents: Vec<_> = idents.iter()
                            .filter(|ident| &**ident != "_")
                            .collect();
                        quote! {
                            #ident::#variant_ident( #(#idents),* ) => {
                                #(
                                    turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(#active_idents, context);
                                )*
                            }
                        }
                    },
                    Fields::Unit => quote! {
                        #ident::#variant_ident => {}
                    },
                }
            }).collect();
            quote! {
                match self {
                    #(#variants_code)*
                }
            }
        }),
        Item::Struct(ItemStruct {
            ident,
            generics,
            fields,
            ..
        }) => (
            ident,
            generics,
            match fields {
                Fields::Named(FieldsNamed { named, .. }) => {
                    let idents: Vec<_> = named
                        .iter()
                        .filter(|field| !ignore_field(field))
                        .filter_map(|field| field.ident.clone())
                        .collect();
                    quote! {
                        #(
                            turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.#idents, context);
                        )*
                    }
                }
                Fields::Unnamed(FieldsUnnamed { unnamed, .. }) => {
                    let indicies: Vec<_> = unnamed
                        .iter()
                        .enumerate()
                        .filter(|(_, field)| !ignore_field(field))
                        .map(|(i, _)| Literal::usize_unsuffixed(i))
                        .collect();
                    quote! {
                        #(
                            turbo_tasks::trace::TraceRawVcs::trace_raw_vcs(&self.#indicies, context);
                        )*
                    }
                }
                Fields::Unit => quote! {},
            },
        ),
        _ => {
            item.span().unwrap().error("unsupported syntax").emit();

            return quote! {}.into();
        }
    };
    let generics_params = &generics.params.iter().collect::<Vec<_>>();
    quote! {
        impl #generics turbo_tasks::trace::TraceRawVcs for #ident #generics #(where #generics_params: turbo_tasks::trace::TraceRawVcs)* {
            fn trace_raw_vcs(&self, context: &mut turbo_tasks::trace::TraceRawVcsContext) {
                #trace_items
            }
        }
    }
    .into()
}
