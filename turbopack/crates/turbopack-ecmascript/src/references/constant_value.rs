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
}

impl ConstantValueCodeGen {
    pub fn new(value: CompileTimeDefineValue, path: AstPath) -> Self {
        ConstantValueCodeGen { value, path }
    }
    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let value = self.value.clone();

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            *expr = value_to_expr(&value);
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ConstantValueCodeGen> for CodeGen {
    fn from(val: ConstantValueCodeGen) -> Self {
        CodeGen::ConstantValueCodeGen(val)
    }
}

fn value_to_expr(value: &CompileTimeDefineValue) -> Expr {
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
                elems: a.iter().map(|i| Some(value_to_expr(i).into())).collect(),
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
                                value: value_to_expr(v).into(),
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
