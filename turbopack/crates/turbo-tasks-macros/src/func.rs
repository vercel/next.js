use std::borrow::Cow;

use proc_macro2::{Group, Ident, Span, TokenStream, TokenTree};
use quote::{ToTokens, quote, quote_spanned};
use rustc_hash::FxHashSet;
use syn::{
    AngleBracketedGenericArguments, Attribute, Block, Expr, ExprBlock, ExprPath, FnArg,
    GenericArgument, Local, LocalInit, Meta, Pat, PatIdent, PatType, Path, PathArguments,
    PathSegment, Receiver, ReturnType, Signature, Stmt, Token, Type, TypeGroup, TypePath,
    TypeTuple,
    parse::{Parse, ParseStream},
    parse_quote, parse_quote_spanned,
    punctuated::{Pair, Punctuated},
    spanned::Spanned,
    visit_mut::VisitMut,
};

#[derive(Debug)]
pub struct TurboFn<'a> {
    orig_signature: &'a Signature,

    /// Identifier of the exposed function (same as the original function's name).
    ident: &'a Ident,

    /// Identifier of the inline function (a mangled version of the original function's name).
    inline_ident: Ident,

    output: Type,
    this: Option<Input>,
    exposed_inputs: Vec<Input>,
    /// Should we return `OperationVc` and require that all arguments are `NonLocalValue`s?
    operation: bool,
    /// Should this function use `TaskPersistence::LocalCells`?
    local: bool,
}

#[derive(Debug)]
pub struct Input {
    pub ident: Ident,
    pub ty: Type,
}

impl TurboFn<'_> {
    pub fn new(
        orig_signature: &Signature,
        definition_context: DefinitionContext,
        args: FunctionArguments,
    ) -> Option<TurboFn<'_>> {
        if !orig_signature.generics.params.is_empty() {
            orig_signature
                .generics
                .span()
                .unwrap()
                .error(format!(
                    "{} do not support generic parameters",
                    definition_context.function_type(),
                ))
                .emit();
            return None;
        }

        if orig_signature.generics.where_clause.is_some() {
            orig_signature
                .generics
                .where_clause
                .span()
                .unwrap()
                .error(format!(
                    "{} do not support where clauses",
                    definition_context.function_type(),
                ))
                .emit();
            return None;
        }

        let mut raw_inputs = orig_signature.inputs.iter();
        let mut this = None;
        let mut exposed_inputs = Vec::with_capacity(raw_inputs.len());

        if let Some(possibly_receiver) = raw_inputs.next() {
            match possibly_receiver {
                FnArg::Receiver(
                    receiver @ Receiver {
                        attrs,
                        self_token,
                        ty: self_type,
                        ..
                    },
                ) => {
                    if !attrs.is_empty() {
                        receiver
                            .span()
                            .unwrap()
                            .error(format!(
                                "{} do not support attributes on self",
                                definition_context.function_type(),
                            ))
                            .emit();
                        return None;
                    }

                    // tt::functions in tt::value_impl can either take self as a typed `self:
                    // Vc<Self>`, or as immutable references `&self`. We must validate against any
                    // other forms of self.

                    let definition_context = match &definition_context {
                        DefinitionContext::NakedFn => return None,
                        _ => &definition_context,
                    };

                    if get_receiver_style(self_type, definition_context) == ReceiverStyle::Error {
                        return None;
                    }
                    // We don't validate that the user provided a valid `turbo_tasks::Vc<Self>`
                    // here. We'll rely on the compiler to emit an error if the user provided an
                    // invalid receiver type

                    this = Some(Input {
                        ident: Ident::from(*self_token),
                        ty: parse_quote! { turbo_tasks::Vc<Self> },
                    });
                }
                FnArg::Typed(typed) => {
                    if !typed.attrs.is_empty() {
                        typed
                            .span()
                            .unwrap()
                            .error(format!(
                                "{} does not support attributes on arguments",
                                definition_context.function_type(),
                            ))
                            .emit();
                        return None;
                    }

                    if let Pat::Ident(ident) = &*typed.pat {
                        match definition_context {
                            DefinitionContext::NakedFn | DefinitionContext::ValueInherentImpl => {}
                            DefinitionContext::ValueTraitImpl | DefinitionContext::ValueTrait => {
                                typed
                                    .span()
                                    .unwrap()
                                    .error(format!(
                                        "{} must accept &self or self: Vc<Self> as the first \
                                         argument",
                                        definition_context.function_type(),
                                    ))
                                    .emit();
                                return None;
                            }
                        }
                        let ident = ident.ident.clone();

                        exposed_inputs.push(Input {
                            ident,
                            ty: (*typed.ty).clone(),
                        });
                    } else {
                        // We can't support destructuring patterns (or other kinds of patterns).
                        let ident = Ident::new("arg1", typed.pat.span());

                        exposed_inputs.push(Input {
                            ident,
                            ty: (*typed.ty).clone(),
                        });
                    }
                }
            }
        }

        for (i, input) in raw_inputs.enumerate() {
            match input {
                FnArg::Receiver(_) => {
                    // The compiler will emit an error on its own.
                    return None;
                }
                FnArg::Typed(typed) => {
                    let ident = if let Pat::Ident(ident) = &*typed.pat {
                        ident.ident.clone()
                    } else {
                        Ident::new(&format!("arg{}", i + 2), typed.pat.span())
                    };

                    exposed_inputs.push(Input {
                        ident,
                        ty: (*typed.ty).clone(),
                    });
                }
            }
        }

        let output = return_type_to_type(&orig_signature.output);

        let orig_ident = &orig_signature.ident;
        let inline_ident = Ident::new(
            // Hygiene: This should use `.resolved_at(Span::def_site())`, but that's unstable, so
            // instead we just pick a long, unique name
            &format!("{orig_ident}_turbo_tasks_function_inline"),
            orig_ident.span(),
        );

        Some(TurboFn {
            orig_signature,
            ident: orig_ident,
            output,
            this,
            exposed_inputs,
            operation: args.operation.is_some(),
            local: args.local.is_some(),
            inline_ident,
        })
    }

    /// The signature of the exposed function. This is the original signature
    /// converted to a standard turbo_tasks function signature.
    pub fn signature(&self) -> Signature {
        let exposed_inputs: Punctuated<_, Token![,]> = self
            .this
            .as_ref()
            .into_iter()
            .chain(self.exposed_inputs.iter())
            .map(|input| {
                FnArg::Typed(PatType {
                    attrs: Vec::new(),
                    pat: Box::new(Pat::Ident(PatIdent {
                        attrs: Default::default(),
                        by_ref: None,
                        mutability: None,
                        ident: input.ident.clone(),
                        subpat: None,
                    })),
                    colon_token: Default::default(),
                    ty: if self.operation {
                        // operations shouldn't have their arguments rewritten, they require all
                        // arguments are explicitly `NonLocalValue`s
                        Box::new(input.ty.clone())
                    } else {
                        Box::new(expand_task_input_type(&input.ty).into_owned())
                    },
                })
            })
            .collect();

        let ident = &self.ident;
        let orig_output = &self.output;
        let new_output = expand_vc_return_type(
            orig_output,
            self.operation
                .then(|| parse_quote!(turbo_tasks::OperationVc)),
        );

        parse_quote! {
            fn #ident(#exposed_inputs) -> #new_output
        }
    }

    pub fn trait_signature(&self) -> Signature {
        let signature = self.signature();

        parse_quote! {
            #signature where Self: Sized
        }
    }

    /// Signature for the "inline" function. The inline function is the function with minimal
    /// changes that's called by the turbo-tasks framework during scheduling.
    ///
    /// This is in contrast to the "exposed" function, which is the public function that the user
    /// should call.
    ///
    /// This function signature should match the name given by [`Self::inline_ident`].
    ///
    /// A minimally wrapped version of the original function block.
    pub fn inline_signature_and_block<'a>(
        &self,
        orig_block: &'a Block,
        is_self_used: bool,
    ) -> (Signature, Cow<'a, Block>) {
        let mut shadow_self = None;
        let (inputs, transform_stmts): (Punctuated<_, _>, Vec<Option<_>>) = self
            .orig_signature
            .inputs
            .iter()
            .filter(|arg| {
                let FnArg::Typed(pat_type) = arg else {
                    return is_self_used;
                };
                let Pat::Ident(pat_id) = &*pat_type.pat else {
                    return true;
                };
                inline_inputs_identifier_filter(&pat_id.ident)
            })
            .enumerate()
            .map(|(idx, arg)| {
                if self.operation {
                    // operations shouldn't have their arguments rewritten, they require all
                    // arguments are explicitly `NonLocalValue`s
                    return (arg.clone(), None);
                }

                let (FnArg::Receiver(Receiver { ty, .. }) | FnArg::Typed(PatType { ty, .. })) = arg;
                let Cow::Owned(expanded_ty) = expand_task_input_type(ty) else {
                    // common-case: skip if no type conversion is needed
                    return (arg.clone(), None);
                };
                // Helper to produce the transform statement
                let transform_from_task_input = |arg_id: Cow<'_, Ident>, pat: Pat| {
                    Stmt::Local(Local {
                        attrs: Vec::new(),
                        let_token: Default::default(),
                        pat,
                        init: Some(LocalInit {
                            eq_token: Default::default(),
                            // we know the argument implements `FromTaskInput` because
                            // `expand_task_input_type` returned `Cow::Owned`
                            expr: parse_quote_spanned! {
                                arg.span() =>
                                <#ty as turbo_tasks::task::FromTaskInput>::from_task_input(
                                    #arg_id
                                )
                            },
                            diverge: None,
                        }),
                        semi_token: Default::default(),
                    })
                };
                match arg {
                    FnArg::Receiver(
                        receiver @ Receiver {
                            attrs, self_token, ..
                        },
                    ) => {
                        let arg = FnArg::Receiver(Receiver {
                            attrs: Vec::new(),
                            mutability: None,
                            ty: Box::new(expanded_ty),
                            ..receiver.clone()
                        });

                        // We can't shadow `self` variables, so if this argument is a `self`
                        // argument, generate a new identifier, and rewrite
                        // the body of the function later to use
                        // that new identifier.
                        let shadow_self_id = Ident::new(
                            "turbo_tasks_self",
                            Span::mixed_site().located_at(self_token.span()),
                        );
                        shadow_self = Some(shadow_self_id.clone());
                        let shadow_self_pattern = Pat::Ident(PatIdent {
                            ident: shadow_self_id,
                            attrs: attrs.clone(),
                            mutability: None,
                            by_ref: None,
                            subpat: None,
                        });
                        let self_ident = Cow::Owned(Ident::new("self", self_token.span()));
                        let transform_stmt =
                            transform_from_task_input(self_ident, shadow_self_pattern);

                        (arg, Some(transform_stmt))
                    }
                    FnArg::Typed(pat_type) => {
                        let arg_id = if let Pat::Ident(pat_id) = &*pat_type.pat {
                            // common case: argument is just an identifier
                            Cow::Borrowed(&pat_id.ident)
                        } else {
                            // argument is a pattern, we need to rewrite it to a unique identifier
                            Cow::Owned(Ident::new(
                                &format!("arg{idx}"),
                                pat_type.span().resolved_at(Span::mixed_site()),
                            ))
                        };

                        let arg = FnArg::Typed(PatType {
                            pat: Box::new(Pat::Ident(PatIdent {
                                attrs: Vec::new(),
                                by_ref: None,
                                mutability: None,
                                ident: arg_id.clone().into_owned(),
                                subpat: None,
                            })),
                            ty: Box::new(expanded_ty),
                            ..pat_type.clone()
                        });

                        // convert an argument of type `FromTaskInput<T>::TaskInput` into `T`.
                        // essentially, replace any instances of `Vc` with `ResolvedVc`.
                        let pat = (*pat_type.pat).clone();
                        let transform_stmt = transform_from_task_input(arg_id, pat);

                        (arg, Some(transform_stmt))
                    }
                }
            })
            .unzip();
        let transform_stmts: Vec<Stmt> = transform_stmts.into_iter().flatten().collect();

        let inline_signature = Signature {
            ident: self.inline_ident.clone(),
            inputs,
            ..self.orig_signature.clone()
        };

        let inline_block = if transform_stmts.is_empty() {
            // common case: No argument uses ResolvedVc, don't rewrite anything!
            Cow::Borrowed(orig_block)
        } else {
            let mut stmts = transform_stmts;
            stmts.push(Stmt::Expr(
                Expr::Block(ExprBlock {
                    attrs: Vec::new(),
                    label: None,
                    block: if let Some(shadow_self) = shadow_self {
                        // if `self` is a `ResolvedVc<Self>`, we need to rewrite references to
                        // `self`
                        let mut block = orig_block.clone();
                        RewriteSelfVisitMut {
                            self_ident: shadow_self,
                        }
                        .visit_block_mut(&mut block);
                        block
                    } else {
                        orig_block.clone()
                    },
                }),
                None,
            ));
            Cow::Owned(Block {
                brace_token: Default::default(),
                stmts,
            })
        };

        (inline_signature, inline_block)
    }

    pub fn inline_ident(&self) -> &Ident {
        &self.inline_ident
    }

    fn inline_input_idents(&self) -> impl Iterator<Item = &Ident> {
        self.exposed_input_idents()
            .filter(move |id| inline_inputs_identifier_filter(id))
    }

    fn exposed_input_idents(&self) -> impl Iterator<Item = &Ident> {
        self.exposed_inputs.iter().map(|Input { ident, .. }| ident)
    }

    pub fn exposed_input_types(&self) -> impl Iterator<Item = Cow<'_, Type>> {
        self.exposed_inputs
            .iter()
            .map(|Input { ty, .. }| expand_task_input_type(ty))
    }

    pub fn filter_trait_call_args(&self) -> Option<FilterTraitCallArgsTokens> {
        // we only need to do this on trait methods, but we're doing it on all methods because we
        // don't know if we're a trait method or not (we could pass this information down)
        if self.is_method() {
            let inline_input_idents: Vec<_> = self.inline_input_idents().collect();
            if inline_input_idents.len() != self.exposed_inputs.len() {
                let exposed_input_idents: Vec<_> = self.exposed_input_idents().collect();
                let exposed_input_types: Vec<_> = self.exposed_input_types().collect();
                return Some(FilterTraitCallArgsTokens {
                    filter_owned: quote! {
                        |magic_any| {
                            let (#(#exposed_input_idents,)*) =
                                *turbo_tasks::macro_helpers
                                    ::downcast_args_owned::<(#(#exposed_input_types,)*)>(magic_any);
                            ::std::boxed::Box::new((#(#inline_input_idents,)*))
                        }
                    },
                    filter_and_resolve: quote! {
                        |magic_any| {
                            Box::pin(async move {
                                let (#(#exposed_input_idents,)*) = turbo_tasks::macro_helpers
                                    ::downcast_args_ref::<(#(#exposed_input_types,)*)>(magic_any);
                                let resolved = (#(
                                    <_ as turbo_tasks::TaskInput>::resolve_input(
                                        #inline_input_idents
                                    ).await?,
                                )*);
                                Ok(
                                    ::std::boxed::Box::new(resolved)
                                    as ::std::boxed::Box<dyn turbo_tasks::MagicAny>
                                )
                            })
                        }
                    },
                });
            }
        }
        None
    }

    pub fn persistence(&self) -> impl ToTokens {
        if self.local {
            quote! {
                turbo_tasks::TaskPersistence::Local
            }
        } else {
            quote! {
                turbo_tasks::macro_helpers::get_non_local_persistence_from_inputs(&*inputs)
            }
        }
    }

    pub fn persistence_with_this(&self) -> impl ToTokens {
        if self.local {
            quote! {
                turbo_tasks::TaskPersistence::Local
            }
        } else {
            quote! {
                turbo_tasks::macro_helpers::get_non_local_persistence_from_inputs_and_this(this, &*inputs)
            }
        }
    }

    fn converted_this(&self) -> Option<Expr> {
        self.this.as_ref().map(|Input { ty: _, ident }| {
            parse_quote! {
                turbo_tasks::Vc::into_raw(#ident)
            }
        })
    }

    fn get_assertions(&self) -> TokenStream {
        if self.operation {
            let mut assertions = Vec::new();
            // theoretically we could support methods by rewriting the exposed self argument, but
            // it's not worth it, given the rarity of operations.
            const SELF_ERROR: &str = "methods taking `self` are not supported with `operation`";
            for arg in &self.orig_signature.inputs {
                match arg {
                    FnArg::Receiver(receiver) => {
                        receiver.span().unwrap().error(SELF_ERROR).emit();
                    }
                    FnArg::Typed(pat_type) => {
                        if let Pat::Ident(ident) = &*pat_type.pat {
                            // needed for syn 1.x where arbitrary self types use FnArg::Typed, this
                            // is fixed in syn 2.x, where `self` is always `FnArg::Receiver`.
                            if ident.ident == "self" {
                                pat_type.span().unwrap().error(SELF_ERROR).emit();
                            }
                        }
                        let ty = &pat_type.ty;
                        assertions.push(quote_spanned! {
                            ty.span() =>
                            turbo_tasks::macro_helpers::assert_argument_is_non_local_value::<#ty>();
                        });
                    }
                }
            }
            quote! { #(#assertions)* }
        } else {
            quote! {}
        }
    }

    /// The block of the exposed function for a dynamic dispatch call to the
    /// given trait.
    pub fn dynamic_block(&self, trait_type_ident: &Ident) -> Block {
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
        let inputs = self.exposed_input_idents();
        let persistence = self.persistence_with_this();
        parse_quote! {
            {
                #assertions
                let inputs = std::boxed::Box::new((#(#inputs,)*));
                let this = #converted_this;
                let persistence = #persistence;
                static TRAIT_METHOD: turbo_tasks::macro_helpers::Lazy<&'static turbo_tasks::TraitMethod> =
                        turbo_tasks::macro_helpers::Lazy::new(|| #trait_type_ident.get(stringify!(#ident)));
                <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                    turbo_tasks::trait_call(
                        *TRAIT_METHOD,
                        this,
                        inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                        persistence,
                    )
                )
            }
        }
    }

    /// The block of the exposed function for a static dispatch call to the
    /// given native function.
    pub fn static_block(&self, native_function_ident: &Ident) -> Block {
        let output = &self.output;
        let inputs = self.inline_input_idents();
        let assertions = self.get_assertions();
        let mut block = if let Some(converted_this) = self.converted_this() {
            let persistence = self.persistence_with_this();
            parse_quote! {
                {
                    #assertions
                    let inputs = std::boxed::Box::new((#(#inputs,)*));
                    let this = #converted_this;
                    let persistence = #persistence;
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_call(
                            &#native_function_ident,
                            Some(this),
                            inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                            persistence,
                        )
                    )
                }
            }
        } else {
            let persistence = self.persistence();
            parse_quote! {
                {
                    #assertions
                    let inputs = std::boxed::Box::new((#(#inputs,)*));
                    let persistence = #persistence;
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_call(
                            &#native_function_ident,
                            None,
                            inputs as std::boxed::Box<dyn turbo_tasks::MagicAny>,
                            persistence,
                        )
                    )
                }
            }
        };
        if self.operation {
            block = parse_quote! {
                {
                    let vc_output = #block;
                    // Assumption: The turbo-tasks manager will not create a local task for a
                    // function where all task inputs are "resolved" (where "resolved" in this case
                    // includes `OperationVc`). This is checked with a debug_assert, but not in
                    // release mode.
                    #[allow(deprecated)]
                    turbo_tasks::OperationVc::cell_private(vc_output)
                }
            };
        }
        block
    }

    pub(crate) fn is_method(&self) -> bool {
        self.this.is_some()
    }
}

#[derive(PartialEq, Eq)]
pub enum ReceiverStyle {
    // A reference like &self or self: &Self
    Reference,
    // A Vc<> type, this is optimistic
    Vc,
    Error,
}

pub(crate) fn get_receiver_style(
    self_type: &Type,
    definition_context: &DefinitionContext,
) -> ReceiverStyle {
    match self_type {
        // we allow `&Self` but not `&mut Self`
        syn::Type::Reference(type_reference) => {
            if let Some(m) = type_reference.mutability {
                m.span()
                    .unwrap()
                    .error(format!(
                        "{} cannot take self by mutable reference, use &self or self: Vc<Self> \
                         instead",
                        definition_context.function_type(),
                    ))
                    .emit();
                return ReceiverStyle::Error;
            }

            match type_reference.elem.as_ref() {
                syn::Type::Path(TypePath { qself: None, path }) if path.is_ident("Self") => {}
                _ => {
                    self_type
                        .span()
                        .unwrap()
                        .error("Unexpected `self` type, use `&self` or `self: Vc<Self>")
                        .emit();
                    return ReceiverStyle::Error;
                }
            }
            return ReceiverStyle::Reference;
        }
        syn::Type::Path(_) => {}
        _ => {
            self_type
                .span()
                .unwrap()
                .error("Unexpected `self` type, use `&self` or `self: Vc<Self>")
                .emit();
            return ReceiverStyle::Error;
        }
    }
    // All other cases are assumed to be a VC, this is not guaranteed but we are happy to just have
    // compiler errors when this assumption is wrong.
    ReceiverStyle::Vc
}

/// An indication of what kind of IO this function does. Currently only used for
/// static analysis, and ignored within this macro.
#[derive(Hash, PartialEq, Eq)]
enum IoMarker {
    Filesystem,
    Network,
}

// Optionally parses `T` from a parethensized attributes, returns `T::default` otherwise.
pub fn parse_with_optional_parens<T: Parse + Default>(attr: &Attribute) -> syn::Result<T> {
    match &attr.meta {
        Meta::Path(_) => Ok(T::default()),
        Meta::List(meta) => meta.parse_args_with(T::parse),
        Meta::NameValue(meta) => Err(syn::Error::new(
            meta.eq_token.span,
            "Expected parenthized parameters",
        )),
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
    io_markers: FxHashSet<IoMarker>,
    /// Should the function return an `OperationVc` instead of a `Vc`? Also ensures that all
    /// arguments are `OperationValue`s. Mutually exclusive with the `local` flag.
    ///
    /// If there is an error due to this option being set, it should be reported to this span.
    pub operation: Option<Span>,
    /// Does not run the function as a real task, and instead runs it inside the parent task using
    /// task-local state. The function call itself will not be cached, but cells will be created on
    /// the parent task.
    pub local: Option<Span>,
}

impl Parse for FunctionArguments {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut parsed_args = FunctionArguments::default();
        let punctuated = input.parse_terminated(Meta::parse, Token![,])?;
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
                ("operation", Meta::Path(_)) => {
                    parsed_args.operation = Some(meta.span());
                }
                ("local", Meta::Path(_)) => {
                    parsed_args.local = Some(meta.span());
                }
                (_, meta) => {
                    return Err(syn::Error::new_spanned(
                        meta,
                        "unexpected token, expected one of: \"fs\", \"network\", \"operation\", \
                         \"local\"",
                    ));
                }
            }
        }
        if let (Some(_), Some(span)) = (parsed_args.local, parsed_args.operation) {
            return Err(syn::Error::new(
                span,
                "\"operation\" is mutually exclusive with the \"local\" option",
            ));
        }
        Ok(parsed_args)
    }
}

fn return_type_to_type(return_type: &ReturnType) -> Type {
    match return_type {
        ReturnType::Default => parse_quote! { () },
        ReturnType::Type(_, return_type) => (**return_type).clone(),
    }
}

/// Approximates the conversion of type `T` to `<T as FromTaskInput>::TaskInput` (in combination
/// with the `AutoFromTaskInput` specialization hack).
///
/// This expansion happens manually here for a couple reasons:
/// - While it's possible to simulate specialization of methods (with inherent impls, autoref, or
///   autoderef) there's currently no way to simulate specialization of type aliases on stable rust.
/// - Replacing arguments with types like `<T as FromTaskInput>::TaskInput` would make function
///   signatures illegible in the resulting rustdocs.
///
/// Returns `Cow::Owned` when a transformation was applied, and `Cow::Borrowed` when no change was
/// made to the input type.
fn expand_task_input_type(orig_input: &Type) -> Cow<'_, Type> {
    match orig_input {
        Type::Group(TypeGroup { elem, .. }) => expand_task_input_type(elem),
        Type::Path(TypePath {
            qself: None,
            path: Path {
                leading_colon,
                segments,
            },
        }) => {
            enum PathMatch {
                Empty,
                StdMod,
                VecMod,
                Vec,
                OptionMod,
                Option,
                TurboTasksMod,
                ResolvedVc,
            }

            let mut path_match = PathMatch::Empty;
            let has_leading_colon = leading_colon.is_some();
            for segment in segments {
                path_match = match (has_leading_colon, path_match, &segment.ident) {
                    (_, PathMatch::Empty, id) if id == "std" || id == "core" || id == "alloc" => {
                        PathMatch::StdMod
                    }

                    (_, PathMatch::StdMod, id) if id == "vec" => PathMatch::VecMod,
                    (false, PathMatch::Empty | PathMatch::VecMod, id) if id == "Vec" => {
                        PathMatch::Vec
                    }

                    (_, PathMatch::StdMod, id) if id == "option" => PathMatch::OptionMod,
                    (false, PathMatch::Empty | PathMatch::OptionMod, id) if id == "Option" => {
                        PathMatch::Option
                    }

                    (_, PathMatch::Empty, id) if id == "turbo_tasks" => PathMatch::TurboTasksMod,
                    (false, PathMatch::Empty | PathMatch::TurboTasksMod, id)
                        if id == "ResolvedVc" =>
                    {
                        PathMatch::ResolvedVc
                    }

                    // some type we don't have an expansion for
                    _ => return Cow::Borrowed(orig_input),
                }
            }

            let last_segment = segments.last().expect("non-empty");
            let mut segments = Cow::Borrowed(segments);
            match path_match {
                PathMatch::Vec | PathMatch::Option => {
                    if let PathArguments::AngleBracketed(
                        bracketed_args @ AngleBracketedGenericArguments { args, .. },
                    ) = &last_segment.arguments
                        && let Some(GenericArgument::Type(first_arg)) = args.first()
                    {
                        match expand_task_input_type(first_arg) {
                            Cow::Borrowed(_) => {} // was not transformed
                            Cow::Owned(first_arg) => {
                                let mut bracketed_args = bracketed_args.clone();
                                *bracketed_args.args.first_mut().expect("non-empty") =
                                    GenericArgument::Type(first_arg);
                                segments.to_mut().last_mut().expect("non-empty").arguments =
                                    PathArguments::AngleBracketed(bracketed_args);
                            }
                        }
                    }
                }
                PathMatch::ResolvedVc => {
                    let args = &last_segment.arguments;
                    segments =
                        Cow::Owned(parse_quote_spanned!(segments.span() => turbo_tasks::Vc #args));
                }
                _ => {}
            }
            match segments {
                Cow::Borrowed(_) => Cow::Borrowed(orig_input),
                Cow::Owned(segments) => Cow::Owned(Type::Path(TypePath {
                    qself: None,
                    path: Path {
                        leading_colon: *leading_colon,
                        segments,
                    },
                })),
            }
        }
        _ => Cow::Borrowed(orig_input),
    }
}

/// Performs [external signature rewriting][mdbook].
///
/// The expanded return type is normally a `turbo_tasks::Vc`, but the `turbo_tasks::Vc` type can be
/// replaced with a custom type using `replace_vc`. Type parameters are preserved during the
/// replacement. This is used for operation functions.
///
/// This is a hack! It approximates the expansion that we'd otherwise get from
/// `<T as TaskOutput>::Return`, so that the return type shown in the rustdocs is as simple as
/// possible. Break out as soon as we see something we don't recognize.
///
/// [mdbook]: https://turbopack-rust-docs.vercel.sh/turbo-engine/tasks.html#external-signature-rewriting
fn expand_vc_return_type(orig_output: &Type, replace_vc: Option<TypePath>) -> Type {
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
    } else if let Some(replace_vc) = replace_vc {
        let Type::Path(mut vc_path) = new_output else {
            unreachable!("Since found_vc is true, the outermost type must be a path to `Vc`")
        };
        let mut new_path = replace_vc;
        new_path.path.segments.last_mut().unwrap().arguments =
            vc_path.path.segments.pop().unwrap().into_value().arguments;
        new_output = Type::Path(new_path)
    }

    new_output
}

struct RewriteSelfVisitMut {
    self_ident: Ident,
}

impl VisitMut for RewriteSelfVisitMut {
    fn visit_ident_mut(&mut self, ident: &mut Ident) {
        if ident == "self" {
            let span = self.self_ident.span().located_at(ident.span());
            *ident = self.self_ident.clone();
            ident.set_span(span);
        }
        // no children to visit
    }

    fn visit_item_impl_mut(&mut self, _: &mut syn::ItemImpl) {
        // skip children of `impl`: the definition of "self" inside of an impl is different than the
        // parent scope's definition of "self"
    }

    fn visit_macro_mut(&mut self, mac: &mut syn::Macro) {
        let new_tokens =
            replace_self_in_token_stream(mac.tokens.to_token_stream(), &self.self_ident);
        mac.tokens = new_tokens;

        syn::visit_mut::visit_macro_mut(self, mac);
    }
}

fn replace_self_in_token_stream(stream: TokenStream, self_ident: &Ident) -> TokenStream {
    stream
        .into_iter()
        .map(|tt| replace_self_in_tt(tt, self_ident))
        .collect()
}

fn replace_self_in_tt(tt: TokenTree, self_ident: &Ident) -> TokenTree {
    match tt {
        TokenTree::Group(group) => {
            let new_stream = replace_self_in_token_stream(group.stream(), self_ident);
            TokenTree::Group(Group::new(group.delimiter(), new_stream))
        }

        TokenTree::Ident(ref ident) => {
            if ident == "self" {
                return TokenTree::Ident(self_ident.clone());
            }

            tt
        }
        _ => tt,
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
    ValueTrait,
}

impl DefinitionContext {
    pub fn function_type(&self) -> &'static str {
        match self {
            DefinitionContext::NakedFn => "#[turbo_tasks::function] naked functions",
            DefinitionContext::ValueInherentImpl => "#[turbo_tasks::value_impl] inherent methods",
            DefinitionContext::ValueTraitImpl => "#[turbo_tasks::value_impl] trait methods",
            DefinitionContext::ValueTrait => "#[turbo_tasks::value_trait] methods",
        }
    }
}

#[derive(Debug)]
pub struct FilterTraitCallArgsTokens {
    filter_owned: TokenStream,
    filter_and_resolve: TokenStream,
}

#[derive(Debug)]
pub struct NativeFn {
    pub function_global_name: TokenStream,
    pub function_path_string: String,
    pub function_path: ExprPath,
    pub is_method: bool,
    /// Used only if `is_method` is true.
    pub is_self_used: bool,
    pub filter_trait_call_args: Option<FilterTraitCallArgsTokens>,
    pub local: bool,
}

impl NativeFn {
    pub fn ty(&self) -> Type {
        parse_quote! { turbo_tasks::macro_helpers::NativeFunction }
    }

    pub fn definition(&self) -> TokenStream {
        let Self {
            function_global_name,
            function_path_string,
            function_path,
            is_method,
            is_self_used,
            filter_trait_call_args,
            local,
        } = self;

        if *is_method {
            let arg_filter = if let Some(filter) = filter_trait_call_args {
                let FilterTraitCallArgsTokens {
                    filter_owned,
                    filter_and_resolve,
                } = filter;
                quote! {
                    ::std::option::Option::Some((
                        #filter_owned,
                        #filter_and_resolve,
                    ))
                }
            } else {
                quote! { ::std::option::Option::None }
            };

            if *is_self_used {
                quote! {
                    {
                        #[allow(deprecated)]
                        turbo_tasks::macro_helpers::NativeFunction::new_method(
                            #function_path_string,
                            #function_global_name,
                            turbo_tasks::macro_helpers::FunctionMeta {
                                local: #local,
                            },
                            #arg_filter,
                            #function_path,
                        )
                    }
                }
            } else {
                quote! {
                    {
                        #[allow(deprecated)]
                        turbo_tasks::macro_helpers::NativeFunction::new_method_without_this(
                            #function_path_string,
                            #function_global_name,
                            turbo_tasks::macro_helpers::FunctionMeta {
                                local: #local,
                            },
                            #arg_filter,
                            #function_path,
                        )
                    }
                }
            }
        } else {
            quote! {
                {
                    #[allow(deprecated)]
                    turbo_tasks::macro_helpers::NativeFunction::new_function(
                        #function_path_string,
                        #function_global_name,
                        turbo_tasks::macro_helpers::FunctionMeta {
                            local: #local,
                        },
                        #function_path,
                    )
                }
            }
        }
    }
}

pub fn filter_inline_attributes<'a>(
    attrs: impl IntoIterator<Item = &'a Attribute>,
) -> Vec<&'a Attribute> {
    // inline functions use #[doc(hidden)], so it's not useful to preserve/duplicate docs
    attrs
        .into_iter()
        .filter(|attr| attr.path().get_ident().is_none_or(|id| id != "doc"))
        .collect()
}

pub fn inline_inputs_identifier_filter(arg_ident: &Ident) -> bool {
    // filter out underscore-prefixed (unused) arguments, we don't need to cache these
    !arg_ident.to_string().starts_with('_')
}

/// Returns true if this attribute is a turbo_tasks attribute with the given name.
fn is_attribute(attr: &Attribute, name: &str) -> bool {
    let path = &attr.path();
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident == "turbo_tasks" => match iter.next() {
            Some(seg) if seg.arguments.is_empty() && seg.ident == name => iter.next().is_none(),
            _ => false,
        },
        _ => false,
    }
}

/// Parses a `turbo_tasks::function` attribute out of the given attributes and then returns the
/// remaining attributes.
pub fn split_function_attributes(
    attrs: &[Attribute],
) -> (syn::Result<Option<FunctionArguments>>, Vec<&Attribute>) {
    let (func_attrs_vec, attrs): (Vec<_>, Vec<_>) = attrs
        .iter()
        // TODO(alexkirsz) Replace this with function
        .partition(|attr| is_attribute(attr, "function"));
    let func_args = if let Some(func_attr) = func_attrs_vec.first() {
        if func_attrs_vec.len() == 1 {
            parse_with_optional_parens::<FunctionArguments>(func_attr).map(Some)
        } else {
            Err(syn::Error::new(
                // Report the error on the second annotation.
                func_attrs_vec[1].span(),
                "Only one #[turbo_tasks::function] attribute is allowed per method",
            ))
        }
    } else {
        Ok(None)
    };
    (func_args, attrs)
}
