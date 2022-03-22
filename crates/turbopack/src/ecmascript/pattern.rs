use swc_ecmascript::ast::Lit;
use turbo_tasks::trace::TraceSlotRefs;

use crate::analyzer::JsValue;

#[derive(PartialEq, Eq, Hash, Clone, Debug)]
enum PatternPart {
    Constant(String),
    Dynamic,
    Alternatives(Vec<Pattern>),
}

#[derive(PartialEq, Eq, Hash, Clone, Debug, TraceSlotRefs)]
pub struct Pattern {
    #[trace_ignore]
    parts: Vec<PatternPart>,
}

impl Pattern {
    fn dynamic_pattern() -> Self {
        Self {
            parts: vec![PatternPart::Dynamic],
        }
    }

    pub fn from(value: &JsValue) -> Pattern {
        match value {
            JsValue::Constant(lit) => Pattern {
                parts: vec![PatternPart::Constant(match lit {
                    Lit::Str(str) => str.value.to_string(),
                    Lit::Bool(b) => b.value.to_string(),
                    Lit::Null(_) => "null".to_string(),
                    Lit::Num(n) => n.to_string(),
                    Lit::BigInt(n) => n.value.to_string(),
                    Lit::Regex(r) => format!("/{}/{}", r.exp, r.flags),
                    Lit::JSXText(_) => {
                        return Self::dynamic_pattern();
                    }
                })],
            },
            JsValue::Alternatives(alts) => {
                let alts = alts.iter().map(|alt| Pattern::from(alt)).collect();
                Pattern {
                    parts: vec![PatternPart::Alternatives(alts)],
                }
            }
            JsValue::Concat(parts) => {
                let mut result = Vec::new();
                for part in parts {
                    let pattern = Self::from(part);
                    result.extend(pattern.parts);
                }
                Self { parts: result }
            }
            JsValue::Add(_) => {
                // TODO do we need to handle that here
                // or is that already covered by normalization of JsValue
                Self::dynamic_pattern()
            }
            _ => Self::dynamic_pattern(),
        }
    }

    // TODO this should be removed in favor of pattern resolving
    pub fn into_string(self) -> Option<String> {
        if self.parts.len() != 1 {
            return None;
        }
        match self.parts.into_iter().next().unwrap() {
            PatternPart::Constant(str) => Some(str),
            _ => None,
        }
    }
}
