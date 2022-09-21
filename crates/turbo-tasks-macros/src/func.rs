use proc_macro2::{Ident, Span, TokenStream as TokenStream2};
use proc_macro_error::abort;
use quote::quote;
use syn::{
    punctuated::Punctuated, spanned::Spanned, FnArg, Pat, PatIdent, PatType, Receiver, ReturnType,
    Signature, Token, Type, TypePath, TypeReference,
};

use crate::util::*;

/// The underlying type of the `self` identifier.
pub enum SelfType<'a> {
    Value(&'a Ident),
    Ref,
    ValueTrait,
}

pub fn gen_native_function_code(
    name_code: TokenStream2,
    original_function: TokenStream2,
    function_ident: &Ident,
    function_id_ident: &Ident,
    async_function: bool,
    inputs: &Punctuated<FnArg, Token![,]>,
    output_type: &Type,
    self_ref_type: Option<(&Ident, SelfType<'_>)>,
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

                let (self_ref_ident, self_type) = match self_ref_type.as_ref() {
                    Some(self_ref_type) => self_ref_type,
                    None => {
                        abort!(input.span(), "unexpected receiver argument");
                    }
                };
                input_extraction.push(quote! {
                    let __self = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!("{}() self argument missing", #name_code))?;
                });
                input_convert.push(quote! {
                    let __self: #self_ref_ident = turbo_tasks::FromTaskInput::try_from(__self)?;
                });
                input_clone.push(quote! {
                    let __self = std::clone::Clone::clone(&__self);
                });
                match self_type {
                    SelfType::Value(self_ident) => {
                        // We can't use `IntoFuture` directly here because we want to retain
                        // transparent wrapper types. Otherwise calling trait methods on transparent
                        // types would fail.
                        input_final.push(quote! {
                            let __self = __self.node.into_read::<#self_ident>().await?;
                        });
                        input_arguments.push(quote! {
                            &*__self
                        });
                    }
                    SelfType::Ref => {
                        input_arguments.push(quote! {
                            __self
                        });
                    }
                    SelfType::ValueTrait => {
                        input_arguments.push(quote! {
                            &__self
                        });
                    }
                }
                input_raw_vc_arguments.push(quote! {
                    self.into()
                });
            }
            FnArg::Typed(PatType { pat, ty, .. }) => {
                input_extraction.push(quote! {
                    let #pat = __iter
                        .next()
                        .ok_or_else(|| anyhow::anyhow!(concat!("{}() argument ", stringify!(#index), " (", stringify!(#pat), ") missing"), #name_code))?;
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
                let custom_self_type = if let Pat::Ident(PatIdent { ident, .. }) = &**pat {
                    ident == "self_vc"
                } else {
                    false
                };
                if custom_self_type {
                    input_raw_vc_arguments.push(quote! {
                        self.into()
                    });
                } else {
                    input_raw_vc_arguments.push(quote! {
                        #pat.into()
                    });
                }
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
            #[doc(hidden)]
            pub(crate) static #function_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::NativeFunction> =
                turbo_tasks::macro_helpers::Lazy::new(|| {
                    turbo_tasks::NativeFunction::new(#name_code.to_owned(), |inputs| {
                        let mut __iter = inputs.iter();
                        #(#input_extraction)*
                        if __iter.next().is_some() {
                            return Err(anyhow::anyhow!("{}() called with too many arguments", #name_code));
                        }
                        #(#input_convert)*
                        Ok(Box::new(move || {
                            #(#input_clone)*
                            Box::pin(async move {
                                #(#input_final)*
                                #original_call_code
                            })
                        }))
                    })
                });

            #[doc(hidden)]
            pub(crate) static #function_id_ident: turbo_tasks::macro_helpers::Lazy<turbo_tasks::FunctionId> =
                turbo_tasks::macro_helpers::Lazy::new(|| {
                    turbo_tasks::registry::get_function_id(&#function_ident)
                });
        },
        input_raw_vc_arguments,
    )
}

pub fn split_signature(sig: &Signature) -> (Signature, Signature, Type, TokenStream2) {
    let output_type = get_return_type(&sig.output);
    let inline_ident = get_internal_function_ident(&sig.ident);
    let mut inline_sig = sig.clone();
    inline_sig.ident = inline_ident;

    let mut external_sig = sig.clone();
    external_sig.asyncness = None;

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
    }

    (external_sig, inline_sig, output_type, convert_result_code)
}
