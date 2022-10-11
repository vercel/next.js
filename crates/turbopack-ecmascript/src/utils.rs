use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};

use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Lit, Str},
};
use turbopack_core::{chunk::ModuleId, resolve::pattern::Pattern};

use crate::analyzer::{ConstantNumber, ConstantValue, JsValue};

pub fn unparen(expr: &Expr) -> &Expr {
    if let Some(expr) = expr.as_paren() {
        return unparen(&expr.expr);
    }
    expr
}

pub fn js_value_to_pattern(value: &JsValue) -> Pattern {
    let mut result = match value {
        JsValue::Constant(v) => Pattern::Constant(match v {
            ConstantValue::StrWord(str) => str.to_string(),
            ConstantValue::StrAtom(str) => str.to_string(),
            ConstantValue::True => "true".to_string(),
            ConstantValue::False => "false".to_string(),
            ConstantValue::Null => "null".to_string(),
            ConstantValue::Num(ConstantNumber(n)) => n.to_string(),
            ConstantValue::BigInt(n) => n.to_string(),
            ConstantValue::Regex(exp, flags) => format!("/{exp}/{flags}"),
            ConstantValue::Undefined => "undefined".to_string(),
        }),
        JsValue::Alternatives(_, alts) => {
            Pattern::Alternatives(alts.iter().map(js_value_to_pattern).collect())
        }
        JsValue::Concat(_, parts) => {
            Pattern::Concatenation(parts.iter().map(js_value_to_pattern).collect())
        }
        JsValue::Add(..) => {
            // TODO do we need to handle that here
            // or is that already covered by normalization of JsValue
            Pattern::Dynamic
        }
        _ => Pattern::Dynamic,
    };
    result.normalize();
    result
}

pub fn module_id_to_lit(module_id: &ModuleId) -> Expr {
    Expr::Lit(match module_id {
        ModuleId::Number(n) => Lit::Num((*n as f64).into()),
        ModuleId::String(s) => Lit::Str(Str {
            span: DUMMY_SP,
            value: (s as &str).into(),
            raw: None,
        }),
    })
}

pub fn stringify_module_id(id: &ModuleId) -> String {
    match id {
        ModuleId::Number(n) => stringify_number(*n),
        ModuleId::String(s) => stringify_str(s),
    }
}

pub fn stringify_str(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

pub fn stringify_number(s: u32) -> String {
    s.to_string()
}

pub struct FormatIter<T: Iterator, F: Fn() -> T>(pub F);

macro_rules! format_iter {
    ($trait:path) => {
        impl<T: Iterator, F: Fn() -> T> $trait for FormatIter<T, F>
        where
            T::Item: $trait,
        {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                for item in self.0() {
                    item.fmt(f)?;
                }
                Ok(())
            }
        }
    };
}

format_iter!(std::fmt::Binary);
format_iter!(std::fmt::Debug);
format_iter!(std::fmt::Display);
format_iter!(std::fmt::LowerExp);
format_iter!(std::fmt::LowerHex);
format_iter!(std::fmt::Octal);
format_iter!(std::fmt::Pointer);
format_iter!(std::fmt::UpperExp);
format_iter!(std::fmt::UpperHex);

pub struct WrapFuture<F, W> {
    wrapper: W,
    future: F,
}

impl<F: Future, W: for<'a> Fn(Pin<&mut F>, &mut Context<'a>) -> Poll<F::Output>> WrapFuture<F, W> {
    pub fn new(wrapper: W, future: F) -> Self {
        Self { wrapper, future }
    }
}

impl<F: Future, W: for<'a> Fn(Pin<&mut F>, &mut Context<'a>) -> Poll<F::Output>> Future
    for WrapFuture<F, W>
{
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let WrapFuture { future, wrapper } = unsafe { self.get_unchecked_mut() };
        let future = unsafe { Pin::new_unchecked(future) };
        wrapper(future, cx)
    }
}
