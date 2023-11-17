use std::mem::take;

use swc_core::ecma::atoms::js_word;

use super::{ConstantNumber, ConstantValue, JsValue, LogicalOperator, ObjectPart};

/// Replaces some builtin values with their resulting values. Called early
/// without lazy nested values. This allows to skip a lot of work to process the
/// arguments.
pub fn early_replace_builtin(value: &mut JsValue) -> bool {
    match value {
        // matching calls like `callee(arg1, arg2, ...)`
        JsValue::Call(_, box ref mut callee, _) => match callee {
            // We don't know what the callee is, so we can early return
            JsValue::Unknown(_, _) => {
                value.make_unknown("unknown callee");
                true
            }
            // We known that these callee will lead to an error at runtime, so we can skip
            // processing them
            JsValue::Constant(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Alternatives(_, _)
            | JsValue::Concat(_, _)
            | JsValue::Add(_, _)
            | JsValue::Not(_, _) => {
                value.make_unknown("non-function callee");
                true
            }
            _ => false,
        },
        // matching calls with this context like `obj.prop(arg1, arg2, ...)`
        JsValue::MemberCall(_, box ref mut obj, box ref mut prop, _) => match obj {
            // We don't know what the callee is, so we can early return
            JsValue::Unknown(_, _) => {
                value.make_unknown("unknown callee object");
                true
            }
            // otherwise we need to look at the property
            _ => match prop {
                // We don't know what the property is, so we can early return
                JsValue::Unknown(_, _) => {
                    value.make_unknown("unknown callee property");
                    true
                }
                _ => false,
            },
        },
        // matching property access like `obj.prop` when we don't know what the obj is.
        // We can early return here
        JsValue::Member(_, box JsValue::Unknown(_, _), _) => {
            value.make_unknown("unknown object");
            true
        }
        _ => false,
    }
}

/// Replaces some builtin functions and values with their resulting values. In
/// contrast to early_replace_builtin this has all inner values already
/// processed.
pub fn replace_builtin(value: &mut JsValue) -> bool {
    match value {
        // matching property access like `obj.prop`
        // Accessing a property on something can be handled in some cases
        JsValue::Member(_, box ref mut obj, ref mut prop) => match obj {
            // matching property access when obj is a bunch of alternatives
            // like `(obj1 | obj2 | obj3).prop`
            // We expand these to `obj1.prop | obj2.prop | obj3.prop`
            JsValue::Alternatives(_, alts) => {
                *value = JsValue::alternatives(
                    take(alts)
                        .into_iter()
                        .map(|alt| JsValue::member(Box::new(alt), prop.clone()))
                        .collect(),
                );
                true
            }
            // matching property access on an array like `[1,2,3].prop` or `[1,2,3][1]`
            &mut JsValue::Array {
                ref mut items,
                mutable,
                ..
            } => {
                fn items_to_alternatives(items: &mut Vec<JsValue>, prop: &mut JsValue) -> JsValue {
                    items.push(JsValue::unknown(
                        JsValue::member(Box::new(JsValue::array(Vec::new())), Box::new(take(prop))),
                        "unknown array prototype methods or values",
                    ));
                    JsValue::alternatives(take(items))
                }
                match &mut **prop {
                    // accessing a numeric property on an array like `[1,2,3][1]`
                    // We can replace this with the value at the index
                    JsValue::Constant(ConstantValue::Num(num @ ConstantNumber(_))) => {
                        if let Some(index) = num.as_u32_index() {
                            if index < items.len() {
                                *value = items.swap_remove(index);
                                if mutable {
                                    value.add_unknown_mutations();
                                }
                                true
                            } else {
                                *value = JsValue::unknown(
                                    JsValue::member(Box::new(take(obj)), Box::new(take(prop))),
                                    "invalid index",
                                );
                                true
                            }
                        } else {
                            value.make_unknown("non-num constant property on array");
                            true
                        }
                    }
                    // accessing a non-numeric property on an array like `[1,2,3].length`
                    // We don't know what happens here
                    JsValue::Constant(_) => {
                        value.make_unknown("non-num constant property on array");
                        true
                    }
                    // accessing multiple alternative properties on an array like `[1,2,3][(1 | 2 |
                    // prop3)]`
                    JsValue::Alternatives(_, alts) => {
                        *value = JsValue::alternatives(
                            take(alts)
                                .into_iter()
                                .map(|alt| JsValue::member(Box::new(obj.clone()), Box::new(alt)))
                                .collect(),
                        );
                        true
                    }
                    // otherwise we can say that this might gives an item of the array
                    // but we also add an unknown value to the alternatives for other properties
                    _ => {
                        *value = items_to_alternatives(items, prop);
                        true
                    }
                }
            }
            // matching property access on an object like `{a: 1, b: 2}.a`
            &mut JsValue::Object {
                ref mut parts,
                mutable,
                ..
            } => {
                fn parts_to_alternatives(
                    parts: &mut Vec<ObjectPart>,
                    prop: &mut Box<JsValue>,
                    include_unknown: bool,
                ) -> JsValue {
                    let mut values = Vec::new();
                    for part in parts {
                        match part {
                            ObjectPart::KeyValue(_, value) => {
                                values.push(take(value));
                            }
                            ObjectPart::Spread(_) => {
                                values.push(JsValue::unknown(
                                    JsValue::member(
                                        Box::new(JsValue::object(vec![take(part)])),
                                        prop.clone(),
                                    ),
                                    "spreaded object",
                                ));
                            }
                        }
                    }
                    if include_unknown {
                        values.push(JsValue::unknown(
                            JsValue::member(
                                Box::new(JsValue::object(Vec::new())),
                                Box::new(take(prop)),
                            ),
                            "unknown object prototype methods or values",
                        ));
                    }
                    JsValue::alternatives(values)
                }

                /// Convert a list of potential values into
                /// JsValue::Alternatives Optionally add a
                /// unknown value to the alternatives for object prototype
                /// methods
                fn potential_values_to_alternatives(
                    mut potential_values: Vec<usize>,
                    parts: &mut Vec<ObjectPart>,
                    prop: &mut Box<JsValue>,
                    include_unknown: bool,
                ) -> JsValue {
                    // Note: potential_values are already in reverse order
                    let mut potential_values = take(parts)
                        .into_iter()
                        .enumerate()
                        .filter(|(i, _)| {
                            if potential_values.last() == Some(i) {
                                potential_values.pop();
                                true
                            } else {
                                false
                            }
                        })
                        .map(|(_, part)| part)
                        .collect();
                    parts_to_alternatives(&mut potential_values, prop, include_unknown)
                }

                match &mut **prop {
                    // matching constant string property access on an object like `{a: 1, b:
                    // 2}["a"]`
                    JsValue::Constant(ConstantValue::Str(_)) => {
                        let prop_str = prop.as_str().unwrap();
                        let mut potential_values = Vec::new();
                        for (i, part) in parts.iter_mut().enumerate().rev() {
                            match part {
                                ObjectPart::KeyValue(key, val) => {
                                    if let Some(key) = key.as_str() {
                                        if key == prop_str {
                                            if potential_values.is_empty() {
                                                *value = take(val);
                                            } else {
                                                potential_values.push(i);
                                                *value = potential_values_to_alternatives(
                                                    potential_values,
                                                    parts,
                                                    prop,
                                                    false,
                                                );
                                            }
                                            if mutable {
                                                value.add_unknown_mutations();
                                            }
                                            return true;
                                        }
                                    } else {
                                        potential_values.push(i);
                                    }
                                }
                                ObjectPart::Spread(_) => {
                                    value.make_unknown("spread object");
                                    return true;
                                }
                            }
                        }
                        if potential_values.is_empty() {
                            *value = JsValue::FreeVar(js_word!("undefined"));
                        } else {
                            *value = potential_values_to_alternatives(
                                potential_values,
                                parts,
                                prop,
                                true,
                            );
                        }
                        if mutable {
                            value.add_unknown_mutations();
                        }
                        true
                    }
                    // matching mutliple alternative properties on an object like `{a: 1, b: 2}[(a |
                    // b)]`
                    JsValue::Alternatives(_, alts) => {
                        *value = JsValue::alternatives(
                            take(alts)
                                .into_iter()
                                .map(|alt| JsValue::member(Box::new(obj.clone()), Box::new(alt)))
                                .collect(),
                        );
                        true
                    }
                    _ => {
                        *value = parts_to_alternatives(parts, prop, true);
                        true
                    }
                }
            }
            _ => false,
        },
        // matching calls with this context like `obj.prop(arg1, arg2, ...)`
        JsValue::MemberCall(_, box ref mut obj, box ref mut prop, ref mut args) => {
            match obj {
                // matching calls on an array like `[1,2,3].concat([4,5,6])`
                JsValue::Array { items, mutable, .. } => {
                    // matching cases where the property is a const string
                    if let Some(str) = prop.as_str() {
                        match str {
                            // The Array.prototype.concat method
                            "concat" => {
                                if args.iter().all(|arg| {
                                    matches!(
                                        arg,
                                        JsValue::Array { .. }
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
                                            JsValue::Array {
                                                items: inner,
                                                mutable: inner_mutable,
                                                ..
                                            } => {
                                                items.extend(take(inner));
                                                *mutable |= *inner_mutable;
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
                            // The Array.prototype.map method
                            "map" => {
                                if let Some(func) = args.get(0) {
                                    *value = JsValue::array(
                                        take(items)
                                            .into_iter()
                                            .enumerate()
                                            .map(|(i, item)| {
                                                JsValue::call(
                                                    Box::new(func.clone()),
                                                    vec![
                                                        item,
                                                        JsValue::Constant(ConstantValue::Num(
                                                            ConstantNumber(i as f64),
                                                        )),
                                                    ],
                                                )
                                            })
                                            .collect(),
                                    );
                                    return true;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                // matching calls on multiple alternative objects like `(obj1 | obj2).prop(arg1,
                // arg2, ...)`
                JsValue::Alternatives(_, alts) => {
                    *value = JsValue::alternatives(
                        take(alts)
                            .into_iter()
                            .map(|alt| {
                                JsValue::member_call(
                                    Box::new(alt),
                                    Box::new(prop.clone()),
                                    args.clone(),
                                )
                            })
                            .collect(),
                    );
                    return true;
                }
                _ => {}
            }
            // without special handling, we convert it into a normal call like
            // `(obj.prop)(arg1, arg2, ...)`
            *value = JsValue::call(
                Box::new(JsValue::member(Box::new(take(obj)), Box::new(take(prop)))),
                take(args),
            );
            true
        }
        // match calls when the callee are multiple alternative functions like `(func1 |
        // func2)(arg1, arg2, ...)`
        JsValue::Call(_, box JsValue::Alternatives(_, alts), ref mut args) => {
            *value = JsValue::alternatives(
                take(alts)
                    .into_iter()
                    .map(|alt| JsValue::call(Box::new(alt), args.clone()))
                    .collect(),
            );
            true
        }
        // match object literals
        JsValue::Object { parts, mutable, .. } => {
            // If the object contains any spread, we might be able to flatten that
            if parts
                .iter()
                .any(|part| matches!(part, ObjectPart::Spread(JsValue::Object { .. })))
            {
                let old_parts = take(parts);
                for part in old_parts {
                    if let ObjectPart::Spread(JsValue::Object {
                        parts: inner_parts,
                        mutable: inner_mutable,
                        ..
                    }) = part
                    {
                        parts.extend(inner_parts);
                        *mutable |= inner_mutable;
                    } else {
                        parts.push(part);
                    }
                }
                value.update_total_nodes();
                true
            } else {
                false
            }
        }
        // match logical expressions like `a && b` or `a || b || c` or `a ?? b`
        // Reduce logical expressions to their final value(s)
        JsValue::Logical(_, op, ref mut parts) => {
            let len = parts.len();
            for (i, part) in take(parts).into_iter().enumerate() {
                // The last part is never skipped.
                if i == len - 1 {
                    parts.push(part);
                    break;
                }
                // We might know at compile-time if a part is skipped or the final value.
                let skip_part = match op {
                    LogicalOperator::And => part.is_truthy(),
                    LogicalOperator::Or => part.is_falsy(),
                    LogicalOperator::NullishCoalescing => part.is_nullish(),
                };
                match skip_part {
                    Some(true) => {
                        // We known this part is skipped, so we can remove it.
                        continue;
                    }
                    Some(false) => {
                        // We known this part is the final value, so we can remove the rest.
                        parts.push(part);
                        break;
                    }
                    None => {
                        // We don't know if this part is skipped or the final value, so we keep it.
                        parts.push(part);
                        continue;
                    }
                }
            }
            // If we reduced the expression to a single value, we can replace it.
            if parts.len() == 1 {
                *value = parts.pop().unwrap();
                true
            } else {
                // If not, we know that it will be one of the remaining values.
                *value = JsValue::alternatives(take(parts));
                true
            }
        }
        // match a binary operator like `a == b`
        JsValue::Binary(..) => {
            if let Some(v) = value.is_truthy() {
                let v = if v {
                    ConstantValue::True
                } else {
                    ConstantValue::False
                };
                *value = JsValue::Constant(v);
                true
            } else {
                false
            }
        }
        // match the not operator like `!a`
        // Evaluate not when the inner value is truthy or falsy
        JsValue::Not(_, ref inner) => match inner.is_truthy() {
            Some(true) => {
                *value = JsValue::Constant(ConstantValue::False);
                true
            }
            Some(false) => {
                *value = JsValue::Constant(ConstantValue::True);
                true
            }
            None => false,
        },
        _ => false,
    }
}
