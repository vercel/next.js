use swc_ecmascript::ast::Expr;
use turbopack_core::resolve::pattern::Pattern;

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
            ConstantValue::Str(str) => str.to_string(),
            ConstantValue::True => "true".to_string(),
            ConstantValue::False => "false".to_string(),
            ConstantValue::Null => "null".to_string(),
            ConstantValue::Num(ConstantNumber(n)) => n.to_string(),
            ConstantValue::BigInt(n) => n.to_string(),
            ConstantValue::Regex(exp, flags) => format!("/{exp}/{flags}"),
            ConstantValue::Undefined => "undefined".to_string(),
        }),
        JsValue::Alternatives(_, alts) => {
            Pattern::Alternatives(alts.iter().map(|alt| js_value_to_pattern(alt)).collect())
        }
        JsValue::Concat(_, parts) => {
            Pattern::Concatenation(parts.iter().map(|alt| js_value_to_pattern(alt)).collect())
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
