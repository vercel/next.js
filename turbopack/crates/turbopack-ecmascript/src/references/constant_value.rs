use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{
            ArrayLit, EsVersion, Expr, KeyValueProp, Lit, ObjectLit, Prop, PropName, Regex, Str,
        },
        parser::{Syntax, parse_file_as_expr},
    },
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::{chunk::ChunkingContext, compile_time_info::CompileTimeDefineValue};

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::AstPath,
};

#[derive(
    Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, ValueDebugFormat, NonLocalValue, Encode, Decode,
)]
pub struct ConstantValueCodeGen {
    value: CompileTimeDefineValue,
    path: AstPath,
    add_compile_time_marker: bool,
}

impl ConstantValueCodeGen {
    pub fn new(value: CompileTimeDefineValue, path: AstPath) -> Self {
        ConstantValueCodeGen {
            value,
            path,
            add_compile_time_marker: true,
        }
    }

    pub fn new_inline_export(value: CompileTimeDefineValue, path: AstPath) -> Self {
        ConstantValueCodeGen {
            value,
            path,
            add_compile_time_marker: false,
        }
    }
    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let value = self.value.clone();
        let add_compile_time_marker = self.add_compile_time_marker;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            *expr = value_to_expr(&value, add_compile_time_marker);
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ConstantValueCodeGen> for CodeGen {
    fn from(val: ConstantValueCodeGen) -> Self {
        CodeGen::ConstantValueCodeGen(val)
    }
}

fn value_to_expr(value: &CompileTimeDefineValue, add_compile_time_marker: bool) -> Expr {
    if !add_compile_time_marker {
        return value_to_expr_without_marker(value);
    }
    match value {
        CompileTimeDefineValue::Undefined => {
            quote!("(\"TURBOPACK compile-time value\", void 0)" as Expr)
        }
        CompileTimeDefineValue::Null => {
            quote!("(\"TURBOPACK compile-time value\", null)" as Expr)
        }
        CompileTimeDefineValue::Bool(true) => {
            quote!("(\"TURBOPACK compile-time value\", true)" as Expr)
        }
        CompileTimeDefineValue::Bool(false) => {
            quote!("(\"TURBOPACK compile-time value\", false)" as Expr)
        }
        CompileTimeDefineValue::Number(n) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = n
                .as_f64()
                .expect("unreachable: serde-json has arbitrary_precision disabled")
                .into())
        }
        CompileTimeDefineValue::String(s) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = s.as_str().into())
        }
        CompileTimeDefineValue::BigInt(n) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = Expr::Lit(Lit::BigInt(n.as_ref().clone().into())))
        }
        CompileTimeDefineValue::Regex(pattern, flags) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = Expr::Lit(Lit::Regex(Regex {
               span: DUMMY_SP,
               exp: pattern.as_str().into(),
               flags: flags.as_str().into(),
            })))
        }
        CompileTimeDefineValue::Array(a) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = Expr::Array(ArrayLit {
                span: DUMMY_SP,
                elems: a
                    .iter()
                    .map(|i| Some(value_to_expr(i, true).into()))
                    .collect(),
            }))
        }
        CompileTimeDefineValue::Object(m) => {
            quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = Expr::Object(ObjectLit {
                span: DUMMY_SP,
                props: m
                    .iter()
                    .map(|(k, v)| {
                        swc_core::ecma::ast::PropOrSpread::Prop(
                            Prop::KeyValue(KeyValueProp {
                                key: PropName::Str(Str::from(k.as_str())),
                                value: value_to_expr(v, true).into(),
                            })
                            .into(),
                        )
                    })
                    .collect(),
            }))
        }
        CompileTimeDefineValue::Evaluate(s) => parse_single_expr_lit(s),
    }
}

fn value_to_expr_without_marker(value: &CompileTimeDefineValue) -> Expr {
    match value {
        CompileTimeDefineValue::Undefined => quote!("void 0" as Expr),
        CompileTimeDefineValue::Null => quote!("null" as Expr),
        CompileTimeDefineValue::Bool(true) => quote!("true" as Expr),
        CompileTimeDefineValue::Bool(false) => quote!("false" as Expr),
        CompileTimeDefineValue::Number(n) => n
            .as_f64()
            .expect("unreachable: serde-json has arbitrary_precision disabled")
            .into(),
        CompileTimeDefineValue::String(s) => s.as_str().into(),
        CompileTimeDefineValue::BigInt(n) => Expr::Lit(Lit::BigInt(n.as_ref().clone().into())),
        CompileTimeDefineValue::Regex(pattern, flags) => Expr::Lit(Lit::Regex(Regex {
            span: DUMMY_SP,
            exp: pattern.as_str().into(),
            flags: flags.as_str().into(),
        })),
        // These values are not eligible for automatic export inlining, but keeping the helper
        // complete makes its invariant explicit if another caller is added later.
        CompileTimeDefineValue::Array(a) => Expr::Array(ArrayLit {
            span: DUMMY_SP,
            elems: a
                .iter()
                .map(|i| Some(value_to_expr_without_marker(i).into()))
                .collect(),
        }),
        CompileTimeDefineValue::Object(m) => Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props: m
                .iter()
                .map(|(k, v)| {
                    swc_core::ecma::ast::PropOrSpread::Prop(
                        Prop::KeyValue(KeyValueProp {
                            key: PropName::Str(Str::from(k.as_str())),
                            value: value_to_expr_without_marker(v).into(),
                        })
                        .into(),
                    )
                })
                .collect(),
        }),
        CompileTimeDefineValue::Evaluate(s) => parse_single_expr_lit(s),
    }
}

pub(crate) fn parse_single_expr_lit(expr_lit: &RcStr) -> Expr {
    let cm = Lrc::new(SourceMap::default());
    let fm = cm.new_source_file(FileName::Anon.into(), expr_lit.clone());
    parse_file_as_expr(
        &fm,
        Syntax::Es(Default::default()),
        EsVersion::latest(),
        None,
        &mut vec![],
    )
    .map_or(
        quote!("(\"Failed parsed TURBOPACK compile-time value\", $s)" as Expr, s: Expr = expr_lit.as_str().into()),
        |expr| quote!("(\"TURBOPACK compile-time value\", $e)" as Expr, e: Expr = *expr),
    )
}
