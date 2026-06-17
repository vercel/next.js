use std::fmt::Display;

use either::Either;

use crate::analyzer::{JsValue, ModuleValue, ObjectPart};

impl Display for ObjectPart<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ObjectPart::KeyValue(key, value) => write!(f, "{key}: {value}"),
            ObjectPart::Spread(value) => write!(f, "...{value}"),
        }
    }
}

impl Display for JsValue<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JsValue::Constant(v) => write!(f, "{v}"),
            JsValue::Url(url, kind) => write!(f, "{url} {kind}"),
            JsValue::Array { items, mutable, .. } => write!(
                f,
                "{}[{}]",
                if *mutable { "" } else { "frozen " },
                items
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Object { parts, mutable, .. } => write!(
                f,
                "{}{{{}}}",
                if *mutable { "" } else { "frozen " },
                parts
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property,
            } => {
                let list = list
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ");
                if let Some(logical_property) = logical_property {
                    write!(f, "({list}){{{logical_property}}}")
                } else {
                    write!(f, "({list})")
                }
            }
            JsValue::FreeVar(name) => write!(f, "FreeVar({name:?})"),
            JsValue::Variable(name) => write!(f, "Variable({}#{:?})", name.0, name.1),
            JsValue::Concat(_, list) => write!(
                f,
                "`{}`",
                list.iter()
                    .map(|v| v
                        .as_str()
                        .map_or_else(|| format!("${{{v}}}"), |str| str.to_string()))
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(_, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            JsValue::Not(_, value) => write!(f, "!({value})"),
            JsValue::Logical(_, op, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(op.joiner())
            ),
            JsValue::Binary(_, a, op, b) => write!(f, "({}{}{})", a, op.joiner(), b),
            JsValue::Tenary(_, test, cons, alt) => write!(f, "({test} ? {cons} : {alt})"),
            JsValue::New(_, call) => write!(
                f,
                "new {}({})",
                call.callee(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Call(_, call) => write!(
                f,
                "{}({})",
                call.callee(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::SuperCall(_, args) => write!(
                f,
                "super({})",
                args.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::MemberCall(_, call) => write!(
                f,
                "{}[{}]({})",
                call.obj(),
                call.prop(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Member(_, obj, prop) => write!(f, "{obj}[{prop}]"),
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                write!(
                    f,
                    "Module({}, {})",
                    name.to_string_lossy(),
                    if let Some(annotations) = annotations {
                        Either::Left(annotations)
                    } else {
                        Either::Right("{}")
                    }
                )
            }
            JsValue::Unknown { .. } => write!(f, "???"),
            JsValue::WellKnownObject(obj) => write!(f, "WellKnownObject({obj:?})"),
            JsValue::WellKnownFunction(func) => write!(f, "WellKnownFunction({func:?})"),
            JsValue::Function(_, func_ident, return_value) => {
                write!(f, "Function#{func_ident}(return = {return_value:?})")
            }
            JsValue::Argument(func_ident, index) => {
                write!(f, "arguments[{index}#{func_ident}]")
            }
            JsValue::Iterated(_, iterable) => write!(f, "Iterated({iterable})"),
            JsValue::TypeOf(_, operand) => write!(f, "typeof({operand})"),
            JsValue::Promise(_, operand) => write!(f, "Promise<{operand}>"),
            JsValue::Awaited(_, operand) => write!(f, "await({operand})"),
        }
    }
}
