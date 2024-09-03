use std::{borrow::Cow, collections::HashSet};

use proc_macro2::{Ident, Span, TokenStream};
use quote::{quote, quote_spanned, ToTokens};
use syn::{
    parenthesized,
    parse::{Parse, ParseStream},
    parse_quote,
    punctuated::{Pair, Punctuated},
    spanned::Spanned,
    token::Paren,
    AngleBracketedGenericArguments, Attribute, Block, Expr, ExprPath, FnArg, GenericArgument, Meta,
    Pat, PatIdent, PatType, Path, PathArguments, PathSegment, Receiver, ReturnType, Signature,
    Token, Type, TypeGroup, TypePath, TypeTuple,
};

#[derive(Debug)]
pub struct TurboFn {
    // signature: Signature,
    // block: Block,
    ident: Ident,
    output: Type,
    this: Option<Input>,
    inputs: Vec<Input>,
    /// Should we check that the return type contains a `ResolvedValue`?
    resolved: Option<Span>,
    /// Should this function use `TaskPersistence::LocalCells`?
    local_cells: bool,
    inline_signature: Signature,
}

#[derive(Debug)]
pub struct Input {
    pub ident: Ident,
    pub ty: Type,
    pub trace_ignore: bool,
}

impl TurboFn {
    pub fn new(
        original_signature: Signature,
        definition_context: DefinitionContext,
        args: FunctionArguments,
    ) -> syn::Result<TurboFn> {
        if !original_signature.generics.params.is_empty() {
            return Err(syn::Error::new_spanned(
                &original_signature.generics.params,
                format!(
                    "{} do not support generic parameters",
                    definition_context.function_type(),
                ),
            ));
        }

        if let Some(where_clause) = &original_signature.generics.where_clause {
            return Err(syn::Error::new_spanned(
                where_clause,
                format!(
                    "{} do not support where clauses",
                    definition_context.function_type(),
                ),
            ));
        }

        let ident = original_signature.ident.clone();
        let raw_inputs = &original_signature.inputs;
        // `this` may be assigned multiple times if there are multiple arguments using the `self`
        // ident, but rustc will generate its own error in this case
        let mut this = None;
        let mut inputs = Vec::with_capacity(raw_inputs.len());

        for (input_idx, raw_input) in raw_inputs.iter().enumerate() {
            match raw_input {
                FnArg::Receiver(
                    receiver @ Receiver {
                        attrs,
                        self_token,
                        reference,
                        mutability,
                    },
                ) => {
                    if !attrs.is_empty() {
                        return Err(syn::Error::new_spanned(
                            receiver,
                            format!(
                                "{} do not support attributes on the self argument",
                                definition_context.function_type(),
                            ),
                        ));
                    }

                    // tt::functions in tt::value_impl can either take self as a typed `self:
                    // Vc<Self>`, or as immutable references `&self`. We must validate against any
                    // other forms of self.

                    let definition_context = match &definition_context {
                        DefinitionContext::NakedFn { .. } => {
                            return Err(syn::Error::new_spanned(
                                receiver,
                                format!(
                                    "self is not supported on non-method {}",
                                    definition_context.function_type(),
                                ),
                            ))
                        }
                        _ => &definition_context,
                    };

                    if !attrs.is_empty() {
                        return Err(syn::Error::new_spanned(
                            receiver,
                            format!(
                                "{} do not support attributes on self",
                                definition_context.function_type(),
                            ),
                        ));
                    }

                    if mutability.is_some() {
                        return Err(syn::Error::new_spanned(
                            receiver,
                            format!(
                                "{} cannot take self by mutable reference, use &self or self: \
                                 Vc<Self> instead",
                                definition_context.function_type(),
                            ),
                        ));
                    }

                    match &reference {
                        None => {
                            return Err(syn::Error::new_spanned(
                                receiver,
                                format!(
                                    "{} cannot take self by value, use &self or self: Vc<Self> \
                                     instead",
                                    definition_context.function_type(),
                                ),
                            ));
                        }
                        Some((_, Some(lifetime))) => {
                            return Err(syn::Error::new_spanned(
                                lifetime,
                                format!(
                                    "{} cannot take self by reference with a custom lifetime, use \
                                     &self or self: Vc<Self> instead",
                                    definition_context.function_type(),
                                ),
                            ));
                        }
                        _ => {}
                    }

                    this = Some(Input {
                        ident: Ident::new("self", self_token.span()),
                        ty: parse_quote! { turbo_tasks::Vc<Self> },
                        trace_ignore: false,
                    });
                }
                FnArg::Typed(typed) => {
                    let mut arg_attrs = None;
                    for raw_attr in &typed.attrs {
                        let Attribute { path, tokens, .. } = raw_attr;
                        if !path.get_ident().map_or(false, |id| id == "turbo_tasks") {
                            return Err(syn::Error::new_spanned(
                                path,
                                format!(
                                    "{} only supports #[turbo_tasks(...)] attributes on arguments",
                                    definition_context.function_type(),
                                ),
                            ));
                        }
                        if arg_attrs.is_some() {
                            return Err(syn::Error::new_spanned(
                                path,
                                format!(
                                    "Only one #[turbo_tasks(...)] attribute per argument is \
                                     allowed inside {}",
                                    definition_context.function_type(),
                                ),
                            ));
                        }
                        arg_attrs = Some(
                            syn::parse2::<Parenthesized<FnArgAttributes>>(tokens.clone())?.inner,
                        );
                    }
                    let arg_attrs = arg_attrs.unwrap_or(Default::default());

                    if let Pat::Ident(ident) = &*typed.pat {
                        if ident.ident == "self" {
                            // We don't validate that the user provided a valid
                            // `turbo_tasks::Vc<Self>` here.
                            // We'll rely on the compiler to emit an error
                            // if the user provided an invalid receiver type

                            let ident = ident.ident.clone();

                            this = Some(Input {
                                ident,
                                ty: parse_quote! { turbo_tasks::Vc<Self> },
                                trace_ignore: arg_attrs.trace_ignore,
                            });
                        } else if this.is_none() && definition_context.is_trait() {
                            return Err(syn::Error::new_spanned(
                                typed,
                                format!(
                                    "{} must accept &self or self: Vc<Self> as the first argument",
                                    definition_context.function_type(),
                                ),
                            ));
                        } else {
                            let ident = ident.ident.clone();

                            inputs.push(Input {
                                ident,
                                ty: (*typed.ty).clone(),
                                trace_ignore: arg_attrs.trace_ignore,
                            });
                        }
                    } else {
                        // We can't support destructuring patterns (or other kinds of patterns).
                        let ident = Ident::new(&format!("arg{}", input_idx + 1), typed.pat.span());

                        inputs.push(Input {
                            ident,
                            ty: (*typed.ty).clone(),
                            trace_ignore: arg_attrs.trace_ignore,
                        });
                    }
                }
            }
        }

        let output = return_type_to_type(&original_signature.output);

        // remove any annotations from the inline signature
        let mut inline_signature = original_signature;
        for arg in inline_signature.inputs.iter_mut() {
            match arg {
                FnArg::Receiver(receiver) => {
                    receiver.attrs = Vec::new();
                }
                FnArg::Typed(pat_type) => {
                    pat_type.attrs = Vec::new();
                }
            }
        }

        Ok(TurboFn {
            ident,
            output,
            this,
            inputs,
            resolved: args.resolved,
            local_cells: args.local_cells.is_some(),
            inline_signature,
        })
    }

    /// The signature of the exposed function. This is the original signature
    /// converted to a standard turbo_tasks function signature.
    pub fn signature(&self) -> Signature {
        let exposed_inputs: Punctuated<_, Token![,]> = self
            .this
            .as_ref()
            .into_iter()
            .chain(self.inputs.iter())
            .map(|input| {
                FnArg::Typed(PatType {
                    attrs: Default::default(),
                    ty: Box::new(input.ty.clone()),
                    pat: Box::new(Pat::Ident(PatIdent {
                        attrs: Default::default(),
                        by_ref: None,
                        mutability: None,
                        ident: input.ident.clone(),
                        subpat: None,
                    })),
                    colon_token: Default::default(),
                })
            })
            .collect();

        let ident = &self.ident;
        let orig_output = &self.output;
        let new_output = expand_vc_return_type(orig_output);

        parse_quote! {
            fn #ident(#exposed_inputs) -> #new_output
        }
    }

    /// The signature of the exposed trait method.
    pub fn trait_signature(&self) -> Signature {
        let signature = self.signature();

        parse_quote! {
            #signature where Self: Sized
        }
    }

    /// The signature of the un-exposed "inline" function. The inline function has the body of the
    /// original function.
    ///
    /// The signature is the same, but with annotations removed.
    pub fn inline_signature(&self) -> &Signature {
        &self.inline_signature
    }

    fn input_expressions(&self) -> impl Iterator<Item = impl ToTokens + '_> {
        enum Expr<'a> {
            // common case
            Ident(&'a Ident),
            // used when `trace_ignore` is set
            TokenStream(TokenStream),
        }
        impl ToTokens for Expr<'_> {
            fn to_tokens(&self, tokens: &mut TokenStream) {
                match self {
                    Self::Ident(id) => id.to_tokens(tokens),
                    Self::TokenStream(stream) => stream.to_tokens(tokens),
                }
            }
        }
        self.inputs.iter().map(|input| {
            let mut expr = Expr::Ident(&input.ident);
            if input.trace_ignore {
                expr = Expr::TokenStream(quote! {
                    turbo_tasks::trace::TraceRawVcsIgnore::new(#expr)
                })
            }
            expr
        })
    }

    pub fn input_types(&self) -> Vec<Cow<'_, Type>> {
        self.inputs
            .iter()
            .map(|input| {
                let mut ty = Cow::Borrowed(&input.ty);
                if input.trace_ignore {
                    ty = Cow::Owned(parse_quote! { turbo_tasks::trace::TraceRawVcsIgnore<#ty> });
                }
                ty
            })
            .collect()
    }

    pub fn persistence(&self) -> impl ToTokens {
        if self.local_cells {
            quote! {
                turbo_tasks::TaskPersistence::LocalCells
            }
        } else {
            quote! {
                turbo_tasks::macro_helpers::get_non_local_persistence_from_inputs(&*inputs)
            }
        }
    }

    fn converted_this(&self) -> Option<Expr> {
        self.this.as_ref().map(|Input { ident, .. }| {
            parse_quote! {
                turbo_tasks::Vc::into_raw(#ident)
            }
        })
    }

    fn get_assertions(&self) -> TokenStream {
        if let Some(span) = self.resolved {
            let return_type = &self.output;
            quote_spanned! {
                span =>
                {
                    turbo_tasks::macro_helpers::assert_returns_resolved_value::<#return_type, _>()
                }
            }
        } else {
            quote! {}
        }
    }

    /// The block of the exposed function for a dynamic dispatch call to the
    /// given trait.
    pub fn dynamic_block(&self, trait_type_id_ident: &Ident) -> Block {
        let Some(converted_this) = self.converted_this() else {
            return parse_quote! {
                {
                    unimplemented!("trait methods without self are not yet supported")
                }
            };
        };

        let ident = &self.ident;
        let output = &self.output;
        let assertions = self.get_assertions();
        let inputs = self.input_expressions();
        let persistence = self.persistence();
        parse_quote! {
            {
                #assertions
                let inputs = std::boxed::Box::new((#(#inputs,)*));
                let persistence = #persistence;
                <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                    turbo_tasks::trait_call(
                        *#trait_type_id_ident,
                        std::borrow::Cow::Borrowed(stringify!(#ident)),
                        #converted_this,
                        inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                        persistence,
                    )
                )
            }
        }
    }

    /// The block of the exposed function for a static dispatch call to the
    /// given native function.
    pub fn static_block(&self, native_function_id_ident: &Ident) -> Block {
        let output = &self.output;
        let inputs = self.input_expressions();
        let persistence = self.persistence();
        let assertions = self.get_assertions();
        if let Some(converted_this) = self.converted_this() {
            parse_quote! {
                {
                    #assertions
                    let inputs = std::boxed::Box::new((#(#inputs,)*));
                    let persistence = #persistence;
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_this_call(
                            *#native_function_id_ident,
                            #converted_this,
                            inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                            persistence,
                        )
                    )
                }
            }
        } else {
            parse_quote! {
                {
                    #assertions
                    let inputs = std::boxed::Box::new((#(#inputs,)*));
                    let persistence = #persistence;
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_call(
                            *#native_function_id_ident,
                            inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                            persistence,
                        )
                    )
                }
            }
        }
    }

    pub(crate) fn is_method(&self) -> bool {
        self.this.is_some()
    }
}

/// An indication of what kind of IO this function does. Currently only used for
/// static analysis, and ignored within this macro.
#[derive(Hash, PartialEq, Eq)]
enum IoMarker {
    Filesystem,
    Network,
}

/// Unwraps a parenthesized set of tokens.
///
/// Syn's lower-level [`parenthesized`] macro which this uses requires a
/// [`ParseStream`] and cannot be used with [`parse_macro_input`],
/// [`syn::parse2`] or anything else accepting a [`TokenStream`]. This can be
/// used with those [`TokenStream`]-based parsing APIs.
pub struct Parenthesized<T: Parse> {
    pub _paren_token: Paren,
    pub inner: T,
}

impl<T: Parse> Parse for Parenthesized<T> {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let inner;
        Ok(Self {
            _paren_token: parenthesized!(inner in input),
            inner: <T>::parse(&inner)?,
        })
    }
}

/// A newtype wrapper for [`Option<Parenthesized>`][Parenthesized] that
/// implements [`Parse`].
pub struct MaybeParenthesized<T: Parse> {
    pub parenthesized: Option<Parenthesized<T>>,
}

impl<T: Parse> Parse for MaybeParenthesized<T> {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        Ok(Self {
            parenthesized: if input.peek(Paren) {
                Some(Parenthesized::<T>::parse(input)?)
            } else {
                None
            },
        })
    }
}

/// Arguments to the `#[turbo_tasks::function]` macro.
#[derive(Default)]
pub struct FunctionArguments {
    /// Manually annotated metadata about what kind of IO this function does. Currently only used
    /// by some static analysis tools. May be exposed via `tracing` or used as part of an
    /// optimization heuristic in the future.
    ///
    /// This should only be used by the task that directly performs the IO. Tasks that transitively
    /// perform IO should not be manually annotated.
    io_markers: HashSet<IoMarker>,
    /// Should we check that the return type contains a `ResolvedValue`?
    ///
    /// If there is an error due to this option being set, it should be reported to this span.
    ///
    /// If [`Self::local_cells`] is set, this will also be set to the same span.
    resolved: Option<Span>,
    /// Changes the behavior of `Vc::cell` to create local cells that are not cached across task
    /// executions. Cells can be converted to their non-local versions by calling `Vc::resolve`.
    ///
    /// If there is an error due to this option being set, it should be reported to this span.
    ///
    /// Setting this option will also set [`Self::resolved`] to the same span.
    pub local_cells: Option<Span>,
}

impl Parse for FunctionArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut parsed_args = FunctionArguments::default();
        let punctuated: Punctuated<Meta, Token![,]> = input.parse_terminated(Meta::parse)?;
        for meta in punctuated {
            match (
                meta.path()
                    .get_ident()
                    .map(ToString::to_string)
                    .as_deref()
                    .unwrap_or_default(),
                &meta,
            ) {
                ("fs", Meta::Path(_)) => {
                    parsed_args.io_markers.insert(IoMarker::Filesystem);
                }
                ("network", Meta::Path(_)) => {
                    parsed_args.io_markers.insert(IoMarker::Network);
                }
                ("resolved", Meta::Path(_)) => {
                    parsed_args.resolved = Some(meta.span());
                }
                ("local_cells", Meta::Path(_)) => {
                    let span = Some(meta.span());
                    parsed_args.local_cells = span;
                    parsed_args.resolved = span;
                }
                (_, meta) => {
                    return Err(syn::Error::new_spanned(
                        meta,
                        "unexpected token, expected one of: \"fs\", \"network\", \"resolved\", \
                         \"local_cells\"",
                    ))
                }
            }
        }
        Ok(parsed_args)
    }
}

fn return_type_to_type(return_type: &ReturnType) -> Type {
    match return_type {
        ReturnType::Default => parse_quote! { () },
        ReturnType::Type(_, ref return_type) => (**return_type).clone(),
    }
}

fn expand_vc_return_type(orig_output: &Type) -> Type {
    // HACK: Approximate the expansion that we'd otherwise get from
    // `<T as TaskOutput>::Return`, so that the return type shown in the rustdocs
    // is as simple as possible. Break out as soon as we see something we don't
    // recognize.
    let mut new_output = orig_output.clone();
    let mut found_vc = false;
    loop {
        new_output = match new_output {
            Type::Group(TypeGroup { elem, .. }) => *elem,
            Type::Tuple(TypeTuple { elems, .. }) if elems.is_empty() => {
                Type::Path(parse_quote!(turbo_tasks::Vc<()>))
            }
            Type::Path(TypePath {
                qself: None,
                path:
                    Path {
                        leading_colon,
                        ref segments,
                    },
            }) => {
                let mut pairs = segments.pairs();
                let mut cur_pair = pairs.next();

                enum PathPrefix {
                    Anyhow,
                    TurboTasks,
                }

                // try to strip a `turbo_tasks::` or `anyhow::` prefix
                let prefix = if let Some(first) = cur_pair.as_ref().map(|p| p.value()) {
                    if first.arguments.is_none() {
                        if first.ident == "turbo_tasks" {
                            Some(PathPrefix::TurboTasks)
                        } else if first.ident == "anyhow" {
                            Some(PathPrefix::Anyhow)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };

                if prefix.is_some() {
                    cur_pair = pairs.next(); // strip the matched prefix
                } else if leading_colon.is_some() {
                    break; // something like `::Vc` isn't valid
                }

                // Look for a `Vc<...>` or `Result<...>` generic
                let Some(Pair::End(PathSegment {
                    ident,
                    arguments:
                        PathArguments::AngleBracketed(AngleBracketedGenericArguments { args, .. }),
                })) = cur_pair
                else {
                    break;
                };
                if ident == "Vc" {
                    found_vc = true;
                    break; // Vc is the bottom-most level
                }
                if ident == "Result" && args.len() == 1 {
                    let GenericArgument::Type(ty) =
                        args.first().expect("Result<...> type has an argument")
                    else {
                        break;
                    };
                    ty.clone()
                } else {
                    break; // we only support expanding Result<...>
                }
            }
            _ => break,
        }
    }

    if !found_vc {
        orig_output
            .span()
            .unwrap()
            .error(
                "Expected return type to be `turbo_tasks::Vc<T>` or `anyhow::Result<Vc<T>>`. \
                 Unable to process type.",
            )
            .emit();
    }

    new_output
}

/// Attributes applied to an argument of a `#[turbo_tasks::function]`.
///
/// For example:
///
/// ```
/// # #[turbo_tasks::value]
/// # struct MyArg {}
///
/// #[turbo_tasks::function]
/// fn my_function(
///     #[turbo_tasks(trace_ignore)]
///     my_arg: MyArg,
/// ) {
///     // ...
/// }
/// ```
#[derive(Default)]
struct FnArgAttributes {
    trace_ignore: bool,
}

impl Parse for FnArgAttributes {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut parsed_attrs = Self::default();
        let punctuated: Punctuated<Ident, Token![,]> = input.parse_terminated(Ident::parse)?;
        for id in &punctuated {
            if id == "trace_ignore" {
                parsed_attrs.trace_ignore = true;
            } else {
                return Err(syn::Error::new_spanned(
                    id,
                    "unexpected token, expected: \"trace_ignore\"",
                ));
            }
        }
        Ok(parsed_attrs)
    }
}

/// The context in which the function is being defined.
#[derive(Debug, Clone, Eq, PartialEq)]
pub enum DefinitionContext {
    // The function is defined as a naked #[turbo_tasks::function].
    NakedFn,
    // The function is defined as a #[turbo_tasks::value_impl] inherent implementation method.
    ValueInherentImpl,
    // The function is defined as a #[turbo_tasks::value_impl] trait implementation method.
    ValueTraitImpl,
    // The function is defined as a #[turbo_tasks::value_trait] default method.
    ValueTraitDefaultImpl,
}

impl DefinitionContext {
    pub fn function_type(&self) -> &'static str {
        match self {
            Self::NakedFn => "#[turbo_tasks::function] naked functions",
            Self::ValueInherentImpl => "#[turbo_tasks::value_impl] inherent methods",
            Self::ValueTraitImpl => "#[turbo_tasks::value_impl] trait methods",
            Self::ValueTraitDefaultImpl => "#[turbo_tasks::value_trait] methods",
        }
    }

    fn is_trait(&self) -> bool {
        match self {
            Self::NakedFn { .. } | Self::ValueInherentImpl { .. } => false,
            Self::ValueTraitImpl { .. } | Self::ValueTraitDefaultImpl { .. } => true,
        }
    }
}

#[derive(Debug)]
pub struct NativeFn {
    function_path_string: String,
    function_path: ExprPath,
    is_method: bool,
    local_cells: bool,
}

impl NativeFn {
    pub fn new(
        function_path_string: &str,
        function_path: &ExprPath,
        is_method: bool,
        local_cells: bool,
    ) -> NativeFn {
        NativeFn {
            function_path_string: function_path_string.to_owned(),
            function_path: function_path.clone(),
            is_method,
            local_cells,
        }
    }

    pub fn ty(&self) -> Type {
        parse_quote! { turbo_tasks::macro_helpers::Lazy<turbo_tasks::NativeFunction> }
    }

    pub fn definition(&self) -> Expr {
        let Self {
            function_path_string,
            function_path,
            is_method,
            local_cells,
        } = self;

        let constructor = if *is_method {
            quote! { new_method }
        } else {
            quote! { new_function }
        };

        parse_quote! {
            turbo_tasks::macro_helpers::Lazy::new(|| {
                #[allow(deprecated)]
                turbo_tasks::NativeFunction::#constructor(
                    #function_path_string.to_owned(),
                    turbo_tasks::FunctionMeta {
                        local_cells: #local_cells,
                    },
                    #function_path,
                )
            })
        }
    }

    pub fn id_ty(&self) -> Type {
        parse_quote! { turbo_tasks::macro_helpers::Lazy<turbo_tasks::FunctionId> }
    }

    pub fn id_definition(&self, native_function_id_path: &Path) -> Expr {
        parse_quote! {
            turbo_tasks::macro_helpers::Lazy::new(|| {
                turbo_tasks::registry::get_function_id(&*#native_function_id_path)
            })
        }
    }
}
