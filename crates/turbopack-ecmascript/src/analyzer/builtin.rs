use std::{mem::take, sync::Arc};

use super::{ConstantNumber, ConstantValue, JsValue, ObjectPart};
use crate::analyzer::FreeVarKind;

const ARRAY_METHODS: [&str; 2] = ["concat", "map"];

pub fn replace_builtin(value: &mut JsValue) -> bool {
    match value {
        JsValue::Member(_, box ref mut obj, ref mut prop) => {
            match obj {
                JsValue::Constant(_) => {
                    value.make_unknown("property on constant");
                    true
                }
                JsValue::Url(_) => {
                    value.make_unknown("property on url");
                    true
                }
                JsValue::Concat(..) => {
                    value.make_unknown("property on string");
                    true
                }
                JsValue::Add(..) => {
                    value.make_unknown("property on number or string");
                    true
                }
                JsValue::Unknown(..) => {
                    value.make_unknown("property on unknown");
                    true
                }
                JsValue::Function(..) => {
                    value.make_unknown("property on function");
                    true
                }
                JsValue::Alternatives(_, alts) => {
                    *value = JsValue::alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| JsValue::member(box alt, prop.clone()))
                            .collect(),
                    );
                    true
                }
                JsValue::Array(_, array) => {
                    fn items_to_alternatives(
                        items: &mut Vec<JsValue>,
                        prop: &mut JsValue,
                    ) -> JsValue {
                        items.push(JsValue::Unknown(
                            Some(Arc::new(JsValue::member(
                                box JsValue::array(Vec::new()),
                                box take(prop),
                            ))),
                            "unknown array prototype methods or values",
                        ));
                        JsValue::alternatives(take(items))
                    }
                    match &mut **prop {
                        JsValue::Unknown(_, _) => {
                            *value = items_to_alternatives(array, prop);
                            true
                        }
                        JsValue::Constant(ConstantValue::Num(ConstantNumber(num))) => {
                            let index: usize = *num as usize;
                            if index as f64 == *num && index < array.len() {
                                *value = array.swap_remove(index);
                                true
                            } else {
                                *value = JsValue::Unknown(
                                    Some(Arc::new(JsValue::member(box take(obj), box take(prop)))),
                                    "invalid index",
                                );
                                true
                            }
                        }
                        JsValue::Constant(c) => {
                            if let Some(s) = c.as_str() {
                                if ARRAY_METHODS.iter().any(|method| *method == s) {
                                    return false;
                                }
                            }
                            value.make_unknown("non-num constant property on array");
                            true
                        }
                        JsValue::Array(..) => {
                            value.make_unknown("array property on array");
                            true
                        }
                        JsValue::Object(..) => {
                            value.make_unknown("object property on array");
                            true
                        }
                        JsValue::Url(_) => {
                            value.make_unknown("url property on array");
                            true
                        }
                        JsValue::Function(..) => {
                            value.make_unknown("function property on array");
                            true
                        }
                        JsValue::Alternatives(_, alts) => {
                            *value = JsValue::alternatives(
                                take(alts)
                                    .into_iter()
                                    .map(|alt| JsValue::member(box obj.clone(), box alt))
                                    .collect(),
                            );
                            true
                        }
                        JsValue::Concat(..) | JsValue::Add(..) => {
                            if prop.has_placeholder() {
                                // keep the member infact since it might be handled later
                                false
                            } else {
                                *value = items_to_alternatives(array, prop);
                                true
                            }
                        }
                        JsValue::FreeVar(_)
                        | JsValue::Variable(_)
                        | JsValue::Call(..)
                        | JsValue::MemberCall(..)
                        | JsValue::Member(..)
                        | JsValue::WellKnownObject(_)
                        | JsValue::Argument(_)
                        | JsValue::WellKnownFunction(_)
                        | JsValue::Module(..) => {
                            // keep the member infact since it might be handled later
                            return false;
                        }
                    };
                    true
                }
                JsValue::Object(_, parts) => {
                    fn parts_to_alternatives(
                        parts: &mut Vec<ObjectPart>,
                        prop: &mut Box<JsValue>,
                    ) -> JsValue {
                        let mut values = Vec::new();
                        for part in parts {
                            match part {
                                ObjectPart::KeyValue(_, value) => {
                                    values.push(take(value));
                                }
                                ObjectPart::Spread(_) => {
                                    values.push(JsValue::Unknown(
                                        Some(Arc::new(JsValue::member(
                                            box JsValue::object(vec![take(part)]),
                                            prop.clone(),
                                        ))),
                                        "spreaded object",
                                    ));
                                }
                            }
                        }
                        values.push(JsValue::Unknown(
                            Some(Arc::new(JsValue::member(
                                box JsValue::object(Vec::new()),
                                box take(prop),
                            ))),
                            "unknown object prototype methods or values",
                        ));
                        JsValue::alternatives(values)
                    }
                    match &mut **prop {
                        JsValue::Unknown(_, _) => {
                            *value = parts_to_alternatives(parts, prop);
                            true
                        }
                        JsValue::Constant(_) => {
                            for part in parts.iter_mut().rev() {
                                match part {
                                    ObjectPart::KeyValue(key, val) => {
                                        if key == &**prop {
                                            *value = take(val);
                                            return true;
                                        }
                                    }
                                    ObjectPart::Spread(_) => {
                                        value.make_unknown("spreaded object");
                                        return true;
                                    }
                                }
                            }
                            *value = JsValue::FreeVar(FreeVarKind::Other("undefined".into()));
                            true
                        }
                        JsValue::Array(..) => {
                            value.make_unknown("array property on object");
                            true
                        }
                        JsValue::Object(..) => {
                            value.make_unknown("object property on object");
                            true
                        }
                        JsValue::Url(_) => {
                            value.make_unknown("url property on object");
                            true
                        }
                        JsValue::Function(..) => {
                            value.make_unknown("function property on object");
                            true
                        }
                        JsValue::Alternatives(_, alts) => {
                            *value = JsValue::alternatives(
                                take(alts)
                                    .into_iter()
                                    .map(|alt| JsValue::member(box obj.clone(), box alt))
                                    .collect(),
                            );
                            true
                        }
                        JsValue::Concat(..) | JsValue::Add(..) => {
                            if prop.has_placeholder() {
                                // keep the member intact since it might be handled later
                                false
                            } else {
                                *value = parts_to_alternatives(parts, prop);
                                true
                            }
                        }
                        JsValue::FreeVar(_)
                        | JsValue::Variable(_)
                        | JsValue::Call(..)
                        | JsValue::MemberCall(..)
                        | JsValue::Member(..)
                        | JsValue::WellKnownObject(_)
                        | JsValue::Argument(_)
                        | JsValue::WellKnownFunction(_)
                        | JsValue::Module(..) => {
                            // keep the member intact since it might be handled later
                            debug_assert!(prop.has_placeholder());
                            false
                        }
                    }
                }
                JsValue::FreeVar(_)
                | JsValue::Variable(_)
                | JsValue::Call(..)
                | JsValue::MemberCall(..)
                | JsValue::Member(..)
                | JsValue::WellKnownObject(_)
                | JsValue::Argument(_)
                | JsValue::WellKnownFunction(_)
                | JsValue::Module(..) => {
                    // keep the member intact since it might be handled later
                    debug_assert!(obj.has_placeholder());
                    false
                }
            }
        }
        JsValue::MemberCall(_, box ref mut obj, box ref mut prop, ref mut args) => {
            match obj {
                JsValue::Array(_, items) => {
                    if let Some(str) = prop.as_str() {
                        match str {
                            "concat" => {
                                if args.iter().all(|arg| {
                                    matches!(
                                        arg,
                                        JsValue::Array(..)
                                            | JsValue::Constant(_)
                                            | JsValue::Url(_)
                                            | JsValue::Concat(..)
                                            | JsValue::Add(..)
                                            | JsValue::WellKnownObject(_)
                                            | JsValue::WellKnownFunction(_)
                                            | JsValue::Function(..)
                                    )
                                }) {
                                    for arg in args {
                                        match arg {
                                            JsValue::Array(_, inner) => {
                                                items.extend(take(inner));
                                            }
                                            JsValue::Constant(_)
                                            | JsValue::Url(_)
                                            | JsValue::Concat(..)
                                            | JsValue::Add(..)
                                            | JsValue::WellKnownObject(_)
                                            | JsValue::WellKnownFunction(_)
                                            | JsValue::Function(..) => {
                                                items.push(take(arg));
                                            }
                                            _ => {
                                                unreachable!();
                                            }
                                        }
                                    }
                                    obj.update_total_nodes();
                                    *value = take(obj);
                                    return true;
                                }
                            }
                            // TODO This breaks the Function <-> Argument relationship
                            // We need to refactor that once we expand function calls
                            "map" => {
                                if let Some(JsValue::Function(_, box return_value)) =
                                    args.get_mut(0)
                                {
                                    match return_value {
                                        // ['a', 'b', 'c'].map((i) => require.resolve(i)))
                                        JsValue::Unknown(Some(call), _) => {
                                            if let JsValue::Call(len, callee, call_args) = &**call {
                                                *value =
                                                    JsValue::array(
                                                        items
                                                            .iter()
                                                            .map(|item| {
                                                                let new_args = call_args
                                                            .iter()
                                                            .map(|arg| {
                                                                if let JsValue::Argument(0) = arg {
                                                                    return item.clone();
                                                                } else if let JsValue::Unknown(
                                                                    Some(arg),
                                                                    _,
                                                                ) = arg
                                                                {
                                                                    if let JsValue::Argument(0) =
                                                                    &**arg
                                                                    {
                                                                        return item.clone();
                                                                    }
                                                                }
                                                                arg.clone()
                                                            })
                                                            .collect();
                                                                JsValue::Call(
                                                                    *len,
                                                                    callee.clone(),
                                                                    new_args,
                                                                )
                                                            })
                                                            .collect(),
                                                    );
                                            }
                                        }
                                        _ => {
                                            *value = JsValue::array(
                                                items
                                                    .iter()
                                                    .map(|_| return_value.clone())
                                                    .collect(),
                                            );
                                        }
                                    }
                                    // stop the iteration, let the `handle_call` to continue
                                    // processing the new mapped array
                                    return false;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                JsValue::Alternatives(_, alts) => {
                    *value = JsValue::alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| {
                                JsValue::member_call(box alt, box prop.clone(), args.clone())
                            })
                            .collect(),
                    );
                    return true;
                }
                _ => {}
            }
            *value = JsValue::call(
                box JsValue::member(box take(obj), box take(prop)),
                take(args),
            );
            true
        }
        JsValue::Call(_, box ref mut callee, ref mut args) => {
            match callee {
                JsValue::Unknown(..) => {
                    value.make_unknown("call of unknown function");
                    true
                }
                JsValue::Array(..) => {
                    value.make_unknown("call of array");
                    true
                }
                JsValue::Object(..) => {
                    value.make_unknown("call of object");
                    true
                }
                JsValue::Constant(_) => {
                    value.make_unknown("call of constant");
                    true
                }
                JsValue::Url(_) => {
                    value.make_unknown("call of url");
                    true
                }
                JsValue::Concat(..) => {
                    value.make_unknown("call of string");
                    true
                }
                JsValue::Add(..) => {
                    value.make_unknown("call of number or string");
                    true
                }
                JsValue::Function(_, box ref mut return_value) => {
                    let mut return_value = take(return_value);
                    return_value.visit_mut_conditional(
                        |value| !matches!(value, JsValue::Function(..)),
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

                    *value = return_value;
                    true
                }
                JsValue::Alternatives(_, alts) => {
                    *value = JsValue::alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| JsValue::call(box alt, args.clone()))
                            .collect(),
                    );
                    true
                }
                JsValue::FreeVar(_)
                | JsValue::Variable(_)
                | JsValue::Call(..)
                | JsValue::MemberCall(..)
                | JsValue::Member(..)
                | JsValue::WellKnownObject(_)
                | JsValue::Argument(_)
                | JsValue::WellKnownFunction(_)
                | JsValue::Module(..) => {
                    // keep the call infact since it might be handled later
                    debug_assert!(callee.has_placeholder());
                    false
                }
            }
        }
        JsValue::Object(_, parts) => {
            if parts
                .iter()
                .any(|part| matches!(part, ObjectPart::Spread(JsValue::Object(..))))
            {
                let old_parts = take(parts);
                for part in old_parts {
                    if let ObjectPart::Spread(JsValue::Object(_, inner_parts)) = part {
                        parts.extend(inner_parts);
                    } else {
                        parts.push(part);
                    }
                }
                true
            } else {
                false
            }
        }
        _ => false,
    }
}
