use std::{mem::take, sync::Arc};

use crate::analyzer::FreeVarKind;

use super::{ConstantNumber, ConstantValue, JsValue, ObjectPart};

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
                        JsValue::Constant(ConstantValue::Num(ConstantNumber(num))) => {
                            let index: usize = *num as usize;
                            if index as f64 == *num && index < array.len() {
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
                        JsValue::Object(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "object property on array",
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
                        | JsValue::MemberCall(..)
                        | JsValue::Member(_, _)
                        | JsValue::WellKnownObject(_)
                        | JsValue::Argument(_)
                        | JsValue::WellKnownFunction(_)
                        | JsValue::Module(_) => {
                            // keep the member infact since it might be handled later
                            return (value, false);
                        }
                    },
                    JsValue::Object(parts) => match &mut **prop {
                        JsValue::Unknown(_, _) => {
                            let mut values = Vec::new();
                            for part in parts {
                                match part {
                                    ObjectPart::KeyValue(_, value) => {
                                        values.push(take(value));
                                    }
                                    ObjectPart::Spread(value) => {
                                        values.push(JsValue::Unknown(
                                            Some(Arc::new(JsValue::Member(
                                                box JsValue::Object(vec![take(part)]),
                                                prop.clone(),
                                            ))),
                                            "spreaded object",
                                        ));
                                    }
                                }
                            }
                            values.push(JsValue::Unknown(
                                Some(Arc::new(JsValue::Member(
                                    box JsValue::Object(Vec::new()),
                                    box take(prop),
                                ))),
                                "unknown object prototype methods or values",
                            ));
                            JsValue::Alternatives(values)
                        }
                        JsValue::Constant(_) => {
                            for part in parts.into_iter().rev() {
                                match part {
                                    ObjectPart::KeyValue(key, value) => {
                                        if key == &**prop {
                                            return (take(value), true);
                                        }
                                    }
                                    ObjectPart::Spread(_) => {
                                        return (
                                            JsValue::Unknown(
                                                Some(Arc::new(JsValue::Member(
                                                    box JsValue::Object(vec![take(part)]),
                                                    prop.clone(),
                                                ))),
                                                "spreaded object",
                                            ),
                                            true,
                                        )
                                    }
                                }
                            }
                            JsValue::FreeVar(FreeVarKind::Other("undefined".into()))
                        }
                        JsValue::Array(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "array property on object",
                        ),
                        JsValue::Object(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "object property on object",
                        ),
                        JsValue::Url(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "url property on object",
                        ),
                        JsValue::Function(_) => JsValue::Unknown(
                            Some(Arc::new(JsValue::Member(box take(obj), take(prop)))),
                            "function property on object",
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
                        | JsValue::MemberCall(..)
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
                    | JsValue::MemberCall(..)
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
            JsValue::MemberCall(box ref mut obj, box ref mut prop, ref mut args) => {
                match obj {
                    JsValue::Array(items) => match prop {
                        JsValue::Constant(ConstantValue::Str(str)) => match &**str {
                            "concat" => {
                                if args.iter().all(|arg| {
                                    matches!(
                                        arg,
                                        JsValue::Array(_)
                                            | JsValue::Constant(_)
                                            | JsValue::Url(_)
                                            | JsValue::Concat(_)
                                            | JsValue::Add(_)
                                            | JsValue::WellKnownObject(_)
                                            | JsValue::WellKnownFunction(_)
                                            | JsValue::Function(_)
                                    )
                                }) {
                                    for arg in args {
                                        match arg {
                                            JsValue::Array(inner) => {
                                                items.extend(take(inner));
                                            }
                                            JsValue::Constant(_)
                                            | JsValue::Url(_)
                                            | JsValue::Concat(_)
                                            | JsValue::Add(_)
                                            | JsValue::WellKnownObject(_)
                                            | JsValue::WellKnownFunction(_)
                                            | JsValue::Function(_) => {
                                                items.push(take(arg));
                                            }
                                            _ => {
                                                unreachable!();
                                            }
                                        }
                                    }
                                    return (take(obj), true);
                                }
                            }
                            _ => {}
                        },
                        _ => {}
                    },
                    JsValue::Alternatives(alts) => {
                        return (
                            JsValue::Alternatives(
                                take(alts)
                                    .into_iter()
                                    .map(|alt| {
                                        JsValue::MemberCall(box alt, box prop.clone(), args.clone())
                                    })
                                    .collect(),
                            ),
                            true,
                        )
                    }
                    _ => {}
                }
                JsValue::Call(
                    box JsValue::Member(box take(obj), box take(prop)),
                    take(args),
                )
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
                    JsValue::Object(_) => JsValue::Unknown(
                        Some(Arc::new(JsValue::Call(box take(callee), take(args)))),
                        "call of object",
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
                    | JsValue::MemberCall(..)
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
