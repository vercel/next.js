use std::{mem::take, sync::Arc};

use swc_ecmascript::ast::Lit;

use crate::analyzer::FreeVarKind;

use super::JsValue;

pub fn replace_builtin(mut value: JsValue) -> (JsValue, bool) {
    (
        match value {
            JsValue::Member(box ref mut obj, ref mut prop) => {
                match obj {
                    JsValue::Constant(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on constant",
                    ),
                    JsValue::Url(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on url",
                    ),
                    JsValue::Concat(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on string",
                    ),
                    JsValue::Add(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on number or string",
                    ),
                    JsValue::Unknown(_, _) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on unknown",
                    ),
                    JsValue::Function(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                        "property on function",
                    ),
                    JsValue::Alternatives(alts) => JsValue::Alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| JsValue::Member(box alt, prop.clone()))
                            .collect(),
                    ),
                    JsValue::Array(array) => match &mut **prop {
                        JsValue::Unknown(_, _) => {
                            array.push(JsValue::Unknown(
                                Some(Arc::new(JsValue::Member(
                                    box JsValue::Array(Vec::new()),
                                    box take(prop),
                                ))),
                                "unknown array prototype methods or values",
                            ));
                            JsValue::Alternatives(take(array))
                        }
                        JsValue::Constant(Lit::Num(num)) => {
                            let index: usize = num.value as usize;
                            if index as f64 == num.value && index < array.len() {
                                array.swap_remove(index)
                            } else {
                                JsValue::Unknown(
                                    Some(Arc::new(JsValue::Member(box take(obj), box take(prop)))),
                                    "invalid index",
                                )
                            }
                        }
                        JsValue::Constant(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "non-num constant property on array",
                        ),
                        JsValue::Array(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "array property on array",
                        ),
                        JsValue::Url(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "url property on array",
                        ),
                        JsValue::Function(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "function property on array",
                        ),
                        JsValue::Alternatives(alts) => JsValue::Alternatives(
                            take(alts)
                                .into_iter()
                                .map(|alt| JsValue::Member(box obj.clone(), box alt))
                                .collect(),
                        ),
                        JsValue::Concat(_)
                        | JsValue::Add(_)
                        | JsValue::FreeVar(_)
                        | JsValue::Variable(_)
                        | JsValue::Call(_, _)
                        | JsValue::Member(_, _)
                        | JsValue::WellKnownObject(_)
                        | JsValue::Argument(_)
                        | JsValue::WellKnownFunction(_)
                        | JsValue::Module(_) => {
                            // keep the member infact since it might be handled later
                            return (value, false);
                        }
                    },
                    JsValue::FreeVar(_)
                    | JsValue::Variable(_)
                    | JsValue::Call(_, _)
                    | JsValue::Member(_, _)
                    | JsValue::WellKnownObject(_)
                    | JsValue::Argument(_)
                    | JsValue::WellKnownFunction(_)
                    | JsValue::Module(_) => {
                        // keep the member infact since it might be handled later
                        return (value, false);
                    }
                }
            }
            JsValue::Call(box ref mut callee, ref mut args) => {
                match callee {
                    JsValue::Unknown(inner, explainer) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(
                            box JsValue::Unknown(take(inner), explainer),
                            take(args),
                        ))),
                        "call of unknown function",
                    ),
                    JsValue::Array(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of array",
                    ),
                    JsValue::Constant(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of constant",
                    ),
                    JsValue::Url(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of url",
                    ),
                    JsValue::Concat(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of string",
                    ),
                    JsValue::Add(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of number or string",
                    ),
                    JsValue::Function(box ref mut return_value) => {
                        let mut return_value = take(return_value);
                        return_value.visit_mut_conditional(
                            |value| {
                                if let JsValue::Function(_) = value {
                                    false
                                } else {
                                    true
                                }
                            },
                            &mut |value| match value {
                                JsValue::Argument(index) => {
                                    if let Some(arg) = args.get(*index).cloned() {
                                        *value = arg;
                                    } else {
                                        *value =
                                            JsValue::FreeVar(FreeVarKind::Other("undefined".into()))
                                    }
                                    true
                                }

                                _ => false,
                            },
                        );

                        return_value
                    }
                    JsValue::Alternatives(alts) => JsValue::Alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| JsValue::Call(box alt, args.clone()))
                            .collect(),
                    ),
                    JsValue::FreeVar(_)
                    | JsValue::Variable(_)
                    | JsValue::Call(_, _)
                    | JsValue::Member(_, _)
                    | JsValue::WellKnownObject(_)
                    | JsValue::Argument(_)
                    | JsValue::WellKnownFunction(_)
                    | JsValue::Module(_) => {
                        // keep the call infact since it might be handled later
                        return (value, false);
                    }
                }
            }
            _ => return (value, false),
        },
        true,
    )
}
