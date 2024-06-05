use serde::Serialize;
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
    if let Expr::Seq(seq) = expr {
        return unparen(seq.exprs.last().unwrap());
    }
    expr
}

pub fn js_value_to_pattern(value: &JsValue) -> Pattern {
    let mut result = match value {
        JsValue::Constant(v) => Pattern::Constant(match v {
            ConstantValue::Str(str) => str.as_str().into(),
            ConstantValue::True => "true".into(),
            ConstantValue::False => "false".into(),
            ConstantValue::Null => "null".into(),
            ConstantValue::Num(ConstantNumber(n)) => n.to_string().into(),
            ConstantValue::BigInt(n) => n.to_string().into(),
            ConstantValue::Regex(exp, flags) => format!("/{exp}/{flags}").into(),
            ConstantValue::Undefined => "undefined".into(),
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

pub struct StringifyJs<'a, T>(pub &'a T)
where
    T: ?Sized;

impl<'a, T> std::fmt::Display for StringifyJs<'a, T>
where
    T: Serialize + ?Sized,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        /// [`std::fmt::Formatter`] does not implement [`std::io::Write`],
        /// so we need to wrap it in a struct that does.
        struct DisplayWriter<'a, 'b> {
            f: &'a mut std::fmt::Formatter<'b>,
        }

        impl<'a, 'b> std::io::Write for DisplayWriter<'a, 'b> {
            fn write(&mut self, bytes: &[u8]) -> std::result::Result<usize, std::io::Error> {
                self.f
                    .write_str(
                        std::str::from_utf8(bytes)
                            .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?,
                    )
                    .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
                Ok(bytes.len())
            }

            fn flush(&mut self) -> std::result::Result<(), std::io::Error> {
                unreachable!()
            }
        }

        let to_writer = match f.alternate() {
            true => serde_json::to_writer_pretty,
            false => serde_json::to_writer,
        };

        to_writer(DisplayWriter { f }, self.0).map_err(|_err| std::fmt::Error)
    }
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
