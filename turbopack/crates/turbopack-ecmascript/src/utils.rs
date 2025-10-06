use std::ops::Deref;

use serde::{Deserialize, Serialize};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext},
    ecma::{
        ast::{Expr, Lit, Str},
        visit::AstParentKind,
    },
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};
use turbopack_core::{chunk::ModuleId, resolve::pattern::Pattern};

use crate::analyzer::{
    ConstantNumber, ConstantValue, JsValue, JsValueUrlKind, ModuleValue, WellKnownFunctionKind,
    WellKnownObjectKind,
};

pub fn unparen(expr: &Expr) -> &Expr {
    if let Some(expr) = expr.as_paren() {
        return unparen(&expr.expr);
    }
    if let Expr::Seq(seq) = expr {
        return unparen(seq.exprs.last().unwrap());
    }
    expr
}

/// Converts a js-value into a Pattern for matching resources.
pub fn js_value_to_pattern(value: &JsValue) -> Pattern {
    match value {
        JsValue::Constant(v) => Pattern::Constant(match v {
            ConstantValue::Str(str) => {
                // Normalize windows file paths when constructing the pattern.
                // See PACK-3279
                if str.as_str().contains("\\") {
                    RcStr::from(str.to_string().replace('\\', "/"))
                } else {
                    str.as_rcstr()
                }
            }
            ConstantValue::True => rcstr!("true"),
            ConstantValue::False => rcstr!("false"),
            ConstantValue::Null => rcstr!("null"),
            ConstantValue::Num(ConstantNumber(n)) => n.to_string().into(),
            ConstantValue::BigInt(n) => n.to_string().into(),
            ConstantValue::Regex(box (exp, flags)) => format!("/{exp}/{flags}").into(),
            ConstantValue::Undefined => rcstr!("undefined"),
        }),
        JsValue::Url(v, JsValueUrlKind::Relative) => Pattern::Constant(v.as_rcstr()),
        JsValue::Alternatives {
            total_nodes: _,
            values,
            logical_property: _,
        } => {
            let mut alts = Pattern::Alternatives(values.iter().map(js_value_to_pattern).collect());
            alts.normalize();
            alts
        }
        JsValue::Concat(_, parts) => {
            let mut concats =
                Pattern::Concatenation(parts.iter().map(js_value_to_pattern).collect());
            concats.normalize();
            concats
        }
        JsValue::Add(..) => {
            // TODO do we need to handle that here
            // or is that already covered by normalization of JsValue
            Pattern::Dynamic
        }
        _ => Pattern::Dynamic,
    }
}

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

pub fn module_id_to_lit(module_id: &ModuleId) -> Expr {
    Expr::Lit(match module_id {
        ModuleId::Number(n) => {
            if *n <= JS_MAX_SAFE_INTEGER {
                Lit::Num((*n as f64).into())
            } else {
                Lit::Str(Str {
                    span: DUMMY_SP,
                    value: n.to_string().into(),
                    raw: None,
                })
            }
        }
        ModuleId::String(s) => Lit::Str(Str {
            span: DUMMY_SP,
            value: (s as &str).into(),
            raw: None,
        }),
    })
}

pub struct StringifyModuleId<'a>(pub &'a ModuleId);

impl std::fmt::Display for StringifyModuleId<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.0 {
            ModuleId::Number(n) => {
                if *n <= JS_MAX_SAFE_INTEGER {
                    n.fmt(f)
                } else {
                    write!(f, "\"{n}\"")
                }
            }
            ModuleId::String(s) => StringifyJs(s).fmt(f),
        }
    }
}

pub struct StringifyJs<'a, T>(pub &'a T)
where
    T: ?Sized;

impl<T> std::fmt::Display for StringifyJs<'_, T>
where
    T: Serialize + ?Sized,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        /// [`std::fmt::Formatter`] does not implement [`std::io::Write`],
        /// so we need to wrap it in a struct that does.
        struct DisplayWriter<'a, 'b> {
            f: &'a mut std::fmt::Formatter<'b>,
        }

        impl std::io::Write for DisplayWriter<'_, '_> {
            fn write(&mut self, bytes: &[u8]) -> std::result::Result<usize, std::io::Error> {
                self.f
                    .write_str(std::str::from_utf8(bytes).map_err(std::io::Error::other)?)
                    .map_err(std::io::Error::other)?;
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

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Debug, NonLocalValue)]
pub enum AstPathRange {
    /// The ast path to the block or expression.
    Exact(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>),
    /// The ast path to a expression just before the range in the parent of the
    /// specific ast path.
    StartAfter(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>),
}

/// Converts a module value (ie an import) to a well known object,
/// which we specifically handle.
pub fn module_value_to_well_known_object(module_value: &ModuleValue) -> Option<JsValue> {
    Some(match &*module_value.module {
        "node:path" | "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
        "node:fs/promises" | "fs/promises" => {
            JsValue::WellKnownObject(WellKnownObjectKind::FsModule)
        }
        "node:fs" | "fs" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
        "node:child_process" | "child_process" => {
            JsValue::WellKnownObject(WellKnownObjectKind::ChildProcess)
        }
        "node:os" | "os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
        "node:process" | "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
        "node:url" | "url" => JsValue::WellKnownObject(WellKnownObjectKind::UrlModule),
        "node:module" | "module" => JsValue::WellKnownObject(WellKnownObjectKind::ModuleModule),
        "node-pre-gyp" | "@mapbox/node-pre-gyp" => {
            JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
        }
        "node-gyp-build" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild),
        "node:bindings" | "bindings" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
        }
        "express" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress),
        "strong-globalize" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
        }
        "resolve-from" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom),
        "@grpc/proto-loader" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader),
        "fs-extra" => JsValue::WellKnownObject(WellKnownObjectKind::FsExtraModule),
        _ => return None,
    })
}

#[derive(Hash, Debug, Clone, Copy, Eq, Serialize, Deserialize, PartialEq, TraceRawVcs)]
pub struct AstSyntaxContext(#[turbo_tasks(trace_ignore)] SyntaxContext);

impl TaskInput for AstSyntaxContext {
    fn is_transient(&self) -> bool {
        false
    }
}
unsafe impl NonLocalValue for AstSyntaxContext {}

impl Deref for AstSyntaxContext {
    type Target = SyntaxContext;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<SyntaxContext> for AstSyntaxContext {
    fn from(v: SyntaxContext) -> Self {
        Self(v)
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbopack_core::resolve::pattern::Pattern;

    use crate::{
        analyzer::{ConstantString, ConstantValue, JsValue},
        utils::js_value_to_pattern,
    };

    #[test]
    fn test_path_normalization_in_pattern() {
        assert_eq!(
            Pattern::Constant(rcstr!("hello/world")),
            js_value_to_pattern(&JsValue::Constant(ConstantValue::Str(
                ConstantString::RcStr(rcstr!("hello\\world"))
            )))
        );

        assert_eq!(
            Pattern::Constant(rcstr!("hello/world")),
            js_value_to_pattern(&JsValue::Concat(
                1,
                vec![
                    rcstr!("hello").into(),
                    rcstr!("\\").into(),
                    rcstr!("world").into()
                ]
            ))
        );
    }
}
