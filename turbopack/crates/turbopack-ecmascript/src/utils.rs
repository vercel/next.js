use std::ops::Deref;

use bincode::{Decode, Encode};
use serde::Serialize;
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

#[derive(Clone, PartialEq, Eq, TraceRawVcs, Debug, NonLocalValue, Hash, Encode, Decode)]
pub enum AstPathRange {
    /// The ast path to the block or expression.
    Exact(
        #[bincode(with_serde)]
        #[turbo_tasks(trace_ignore)]
        Vec<AstParentKind>,
    ),
    /// The ast path to a expression just before the range in the parent of the
    /// specific ast path.
    StartAfter(
        #[bincode(with_serde)]
        #[turbo_tasks(trace_ignore)]
        Vec<AstParentKind>,
    ),
}

/// Converts a module value (ie an import) to a well known object,
/// which we specifically handle.
pub fn module_value_to_well_known_object(module_value: &ModuleValue) -> Option<JsValue> {
    Some(match module_value.module.as_bytes() {
        b"node:path" | b"path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
        b"node:fs/promises" | b"fs/promises" => {
            JsValue::WellKnownObject(WellKnownObjectKind::FsModule)
        }
        b"node:fs" | b"fs" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
        b"node:child_process" | b"child_process" => {
            JsValue::WellKnownObject(WellKnownObjectKind::ChildProcessModule)
        }
        b"node:os" | b"os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
        b"node:process" | b"process" => {
            JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessModule)
        }
        b"node:url" | b"url" => JsValue::WellKnownObject(WellKnownObjectKind::UrlModule),
        b"node:module" | b"module" => JsValue::WellKnownObject(WellKnownObjectKind::ModuleModule),
        b"node:worker_threads" | b"worker_threads" => {
            JsValue::WellKnownObject(WellKnownObjectKind::WorkerThreadsModule)
        }
        b"node-pre-gyp" | b"@mapbox/node-pre-gyp" => {
            JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp)
        }
        b"node-gyp-build" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild),
        b"node:bindings" | b"bindings" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeBindings)
        }
        b"express" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeExpress),
        b"strong-globalize" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::NodeStrongGlobalize)
        }
        b"resolve-from" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeResolveFrom),
        b"@grpc/proto-loader" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProtobufLoader),
        b"fs-extra" => JsValue::WellKnownObject(WellKnownObjectKind::FsExtraModule),
        _ => return None,
    })
}

#[derive(Hash, Debug, Clone, Copy, Eq, PartialEq, TraceRawVcs, Encode, Decode)]
pub struct AstSyntaxContext(
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    SyntaxContext,
);

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

/// Generates an inline source map comment that maps back to the original file in a trivial way
///
/// This is useful for source transforms that convert non-JS files (like text or binary files)
/// into ES modules. The inline source map ensures that debuggers and error stacks show
/// the original file path rather than the generated code.
///
/// # Arguments
/// * `original_path` - The path to the original file (used in source map's "sources" field)
/// * `original_content` - The original file content (used in source map's "sourcesContent" field)
///
/// # Returns
/// An inline source map comment (e.g., `//# sourceMappingURL=data:application/json;base64,...`)
pub fn inline_source_map_comment(original_path: &str, original_content: &str) -> String {
    let source_map = serde_json::json!({
        "version": 3,
        "sources": [format!("turbopack:///{}", original_path)],
        "sourcesContent": [original_content],
        "names": [],
        // Maps 0:0 in the output code to 0:0 in the original. Sufficient for
        // bundle analyzers to attribute the bytes in the output chunks
        "mappings": "AAAA",
    });

    let source_map_base64 = data_encoding::BASE64.encode(source_map.to_string().as_bytes());

    format!(
        "//# sourceMappingURL=data:application/json;base64,{}",
        source_map_base64
    )
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

    #[test]
    fn test_inline_source_map_comment() {
        use super::inline_source_map_comment;

        let comment = inline_source_map_comment("test.txt", "hello");

        assert!(comment.starts_with("//# sourceMappingURL=data:application/json;base64,"));

        // Verify the source map is valid JSON when decoded
        let source_map_part = comment
            .split("base64,")
            .nth(1)
            .expect("should have base64 part");
        let decoded = data_encoding::BASE64
            .decode(source_map_part.as_bytes())
            .expect("should decode");
        let json: serde_json::Value =
            serde_json::from_slice(&decoded).expect("should be valid JSON");

        assert_eq!(json["version"], 3);
        assert_eq!(json["sources"][0], "turbopack:///test.txt");
        assert_eq!(json["sourcesContent"][0], "hello");
        assert_eq!(json["mappings"], "AAAA");
    }
}
