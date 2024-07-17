use proc_macro2::Ident;
use syn::{
    parse_quote,
    punctuated::{Pair, Punctuated},
    spanned::Spanned,
    AngleBracketedGenericArguments, Block, Expr, ExprPath, FnArg, GenericArgument, Pat, PatIdent,
    PatType, Path, PathArguments, PathSegment, Receiver, ReturnType, Signature, Token, Type,
    TypeGroup, TypePath, TypeTuple,
};

#[derive(Debug)]
pub struct TurboFn {
    // signature: Signature,
    // block: Block,
    ident: Ident,
    output: Type,
    this: Option<Input>,
    inputs: Vec<Input>,
}

#[derive(Debug)]
pub struct Input {
    pub ident: Ident,
    pub ty: Type,
}

impl TurboFn {
    pub fn new(
        original_signature: &Signature,
        definition_context: DefinitionContext,
    ) -> Option<TurboFn> {
        if !original_signature.generics.params.is_empty() {
            original_signature
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

        if original_signature.generics.where_clause.is_some() {
            original_signature
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

        let mut raw_inputs = original_signature.inputs.iter();
        let mut this = None;
        let mut inputs = Vec::with_capacity(raw_inputs.len());

        if let Some(possibly_receiver) = raw_inputs.next() {
            match possibly_receiver {
                FnArg::Receiver(
                    receiver @ Receiver {
                        attrs,
                        self_token,
                        reference,
                        mutability,
                    },
                ) => {
                    if !attrs.is_empty() {
                        receiver
                            .span()
                            .unwrap()
                            .error(format!(
                                "{} do not support attributes on arguments",
                                definition_context.function_type(),
                            ))
                            .emit();
                        return None;
                    }

                    // tt::functions in tt::value_impl can either take self as a typed `self:
                    // Vc<Self>`, or as immutable references `&self`. We must validate against any
                    // other forms of self.

                    let definition_context = match &definition_context {
                        DefinitionContext::NakedFn { .. } => return None,
                        _ => &definition_context,
                    };

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

                    if mutability.is_some() {
                        receiver
                            .span()
                            .unwrap()
                            .error(format!(
                                "{} cannot take self by mutable reference, use &self or self: \
                                 Vc<Self> instead",
                                definition_context.function_type(),
                            ))
                            .emit();
                        return None;
                    }

                    match &reference {
                        None => {
                            receiver
                                .span()
                                .unwrap()
                                .error(format!(
                                    "{} cannot take self by value, use &self or self: Vc<Self> \
                                     instead",
                                    definition_context.function_type(),
                                ))
                                .emit();
                            return None;
                        }
                        Some((_, Some(lifetime))) => {
                            lifetime
                                .span()
                                .unwrap()
                                .error(format!(
                                    "{} cannot take self by reference with a custom lifetime, use \
                                     &self or self: Vc<Self> instead",
                                    definition_context.function_type(),
                                ))
                                .emit();
                            return None;
                        }
                        _ => {}
                    }

                    this = Some(Input {
                        ident: Ident::new("self", self_token.span()),
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
                        if ident.ident == "self" {
                            if let DefinitionContext::NakedFn { .. } = definition_context {
                                // The function is not associated. The compiler will emit an error
                                // on its own.
                                return None;
                            };

                            // We don't validate that the user provided a valid
                            // `turbo_tasks::Vc<Self>` here.
                            // We'll rely on the compiler to emit an error
                            // if the user provided an invalid receiver type
                            // when
                            // calling `into_concrete`.

                            let ident = ident.ident.clone();

                            this = Some(Input {
                                ident,
                                ty: parse_quote! { turbo_tasks::Vc<Self> },
                            });
                        } else {
                            match definition_context {
                                DefinitionContext::NakedFn { .. }
                                | DefinitionContext::ValueInherentImpl { .. } => {}
                                DefinitionContext::ValueTraitImpl { .. }
                                | DefinitionContext::ValueTrait { .. } => {
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

                            inputs.push(Input {
                                ident,
                                ty: (*typed.ty).clone(),
                            });
                        }
                    } else {
                        // We can't support destructuring patterns (or other kinds of patterns).
                        let ident = Ident::new("arg1", typed.pat.span());

                        inputs.push(Input {
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

                    inputs.push(Input {
                        ident,
                        ty: (*typed.ty).clone(),
                    });
                }
            }
        }

        let output = return_type_to_type(&original_signature.output);

        Some(TurboFn {
            ident: original_signature.ident.clone(),
            output,
            this,
            inputs,
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

    pub fn trait_signature(&self) -> Signature {
        let signature = self.signature();

        parse_quote! {
            #signature where Self: Sized
        }
    }

    fn converted_inputs(&self) -> Punctuated<Expr, Token![,]> {
        self.inputs
            .iter()
            .map(|Input { ty, ident }| -> Expr {
                parse_quote! {
                    <#ty as turbo_tasks::task::TaskInput>::into_concrete(#ident)
                }
            })
            .collect()
    }

    fn converted_this(&self) -> Option<Expr> {
        self.this.as_ref().map(|Input { ty: _, ident }| {
            parse_quote! {
                turbo_tasks::Vc::into_raw(#ident)
            }
        })
    }

    /// The block of the exposed function for a dynamic dispatch call to the
    /// given trait.
    pub fn dynamic_block(&self, trait_type_id_ident: &Ident) -> Block {
        let ident = &self.ident;
        let output = &self.output;
        if let Some(converted_this) = self.converted_this() {
            let converted_inputs = self.converted_inputs();
            parse_quote! {
                {
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::trait_call(
                            *#trait_type_id_ident,
                            std::borrow::Cow::Borrowed(stringify!(#ident)),
                            #converted_this,
                            turbo_tasks::TaskInput::into_concrete((#converted_inputs)),
                        )
                    )
                }
            }
        } else {
            parse_quote! {
                {
                    unimplemented!("trait methods without self are not yet supported")
                }
            }
        }
    }

    /// The block of the exposed function for a static dispatch call to the
    /// given native function.
    pub fn static_block(&self, native_function_id_ident: &Ident) -> Block {
        let output = &self.output;
        let converted_inputs = self.converted_inputs();
        if let Some(converted_this) = self.converted_this() {
            parse_quote! {
                {
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_this_call(
                            *#native_function_id_ident,
                            #converted_this,
                            turbo_tasks::TaskInput::into_concrete((#converted_inputs)),
                        )
                    )
                }
            }
        } else {
            parse_quote! {
                {
                    <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                        turbo_tasks::dynamic_call(
                            *#native_function_id_ident,
                            turbo_tasks::TaskInput::into_concrete((#converted_inputs)),
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
                Type::Path(parse_quote!(::turbo_tasks::Vc<()>))
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
pub struct NativeFn {
    function_path_string: String,
    function_path: ExprPath,
    is_method: bool,
}

impl NativeFn {
    pub fn new(function_path_string: &str, function_path: &ExprPath, is_method: bool) -> NativeFn {
        NativeFn {
            function_path_string: function_path_string.to_owned(),
            function_path: function_path.clone(),
            is_method,
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
        } = self;

        if *is_method {
            parse_quote! {
                turbo_tasks::macro_helpers::Lazy::new(|| {
                    #[allow(deprecated)]
                    turbo_tasks::NativeFunction::new_method(#function_path_string.to_owned(), #function_path)
                })
            }
        } else {
            parse_quote! {
                turbo_tasks::macro_helpers::Lazy::new(|| {
                    #[allow(deprecated)]
                    turbo_tasks::NativeFunction::new_function(#function_path_string.to_owned(), #function_path)
                })
            }
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
