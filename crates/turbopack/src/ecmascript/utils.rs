use swc_ecmascript::ast::{Expr, Lit};

use crate::{analyzer::JsValue, resolve::pattern::Pattern};

pub fn unparen(expr: &Expr) -> &Expr {
    if let Some(expr) = expr.as_paren() {
        return unparen(&expr.expr);
    }
    expr
}

pub fn lit_to_string(lit: &Lit) -> String {
    match lit {
        Lit::Str(str) => format!("\"{}\"", &*str.value),
        Lit::Bool(b) => b.value.to_string(),
        Lit::Null(_) => "null".to_string(),
        Lit::Num(n) => n.to_string(),
        Lit::BigInt(n) => n.value.to_string(),
        Lit::Regex(r) => format!("/{}/{}", r.exp, r.flags),
        Lit::JSXText(text) => text.value.to_string(),
    }
}

pub fn js_value_to_pattern(value: &JsValue) -> Pattern {
    let mut result = match value {
        JsValue::Constant(lit) => Pattern::Constant(match lit {
            Lit::Str(str) => str.value.to_string(),
            Lit::Bool(b) => b.value.to_string(),
            Lit::Null(_) => "null".to_string(),
            Lit::Num(n) => n.to_string(),
            Lit::BigInt(n) => n.value.to_string(),
            Lit::Regex(r) => format!("/{}/{}", r.exp, r.flags),
            Lit::JSXText(_) => {
                return Pattern::Dynamic;
            }
        }),
        JsValue::Alternatives(alts) => {
            Pattern::Alternatives(alts.iter().map(|alt| js_value_to_pattern(alt)).collect())
        }
        JsValue::Concat(parts) => {
            Pattern::Concatenation(parts.iter().map(|alt| js_value_to_pattern(alt)).collect())
        }
        JsValue::Add(_) => {
            // TODO do we need to handle that here
            // or is that already covered by normalization of JsValue
            Pattern::Dynamic
        }
        _ => Pattern::Dynamic,
    };
    result.normalize();
    result
}
