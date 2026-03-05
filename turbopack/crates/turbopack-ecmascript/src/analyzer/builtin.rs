use std::{mem::take, sync::Arc};

use super::{ConstantNumber, ConstantValue, JsValue, LogicalOperator, LogicalProperty, ObjectPart};
use crate::analyzer::JsValueUrlKind;

/// Replaces some builtin values with their resulting values. Called early
/// without lazy nested values. This allows to skip a lot of work to process the
/// arguments.
pub fn early_replace_builtin(value: &mut JsValue) -> bool {
    match value {
        // matching calls like `callee(arg1, arg2, ...)`
        JsValue::Call(_, callee, args) => {
            let args_have_side_effects = || args.iter().any(|arg| arg.has_side_effects());
            match Arc::make_mut(callee) {
                // We don't know what the callee is, so we can early return
                &mut JsValue::Unknown {
                    original_value: _,
                    reason: _,
                    has_side_effects,
                } => {
                    let has_side_effects = has_side_effects || args_have_side_effects();
                    value.make_unknown(has_side_effects, "unknown callee");
                    true
                }
                // We known that these callee will lead to an error at runtime, so we can skip
                // processing them
                JsValue::Constant(_)
                | JsValue::Url(_, _)
                | JsValue::WellKnownObject(_)
                | JsValue::Array { .. }
                | JsValue::Object { .. }
                | JsValue::Alternatives { .. }
                | JsValue::Concat(_, _)
                | JsValue::Add(_, _)
                | JsValue::Not(_, _) => {
                    let has_side_effects = args_have_side_effects();
                    value.make_unknown(has_side_effects, "non-function callee");
                    true
                }
                _ => false,
            }
        }
        // matching calls with this context like `obj.prop(arg1, arg2, ...)`
        JsValue::MemberCall(_, obj, prop, args) => {
            let args_have_side_effects = || args.iter().any(|arg| arg.has_side_effects());
            match obj.as_ref() {
                // We don't know what the callee is, so we can early return
                &JsValue::Unknown {
                    original_value: _,
                    reason: _,
                    has_side_effects,
                } => {
                    let side_effects =
                        has_side_effects || prop.has_side_effects() || args_have_side_effects();
                    value.make_unknown(side_effects, "unknown callee object");
                    true
                }
                // otherwise we need to look at the property
                _ => match prop.as_ref() {
                    // We don't know what the property is, so we can early return
                    &JsValue::Unknown {
                        original_value: _,
                        reason: _,
                        has_side_effects,
                    } => {
                        let side_effects = has_side_effects || args_have_side_effects();
                        value.make_unknown(side_effects, "unknown callee property");
                        true
                    }
                    _ => false,
                },
            }
        }
        // matching property access like `obj.prop` when we don't know what the obj is.
        // We can early return here
        JsValue::Member(_, obj, prop)
            if matches!(
                obj.as_ref(),
                JsValue::Unknown { .. }
            ) =>
        {
            let JsValue::Unknown {
                has_side_effects, ..
            } = obj.as_ref()
            else {
                unreachable!()
            };
            let side_effects = *has_side_effects || prop.has_side_effects();
            value.make_unknown(side_effects, "unknown object");
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
        JsValue::Add(_, list) => {
            // numeric addition
            let mut sum = 0f64;
            for arg in list {
                let JsValue::Constant(ConstantValue::Num(num)) = arg else {
                    return false;
                };
                sum += num.0;
            }
            *value = JsValue::Constant(ConstantValue::Num(ConstantNumber(sum)));
            true
        }

        // matching property access like `obj.prop`
        // Accessing a property on something can be handled in some cases
        JsValue::Member(_, obj, prop) => {
            if matches!(obj.as_ref(), JsValue::Alternatives { .. }) {
                // matching property access when obj is a bunch of alternatives
                // like `(obj1 | obj2 | obj3).prop`
                // We expand these to `obj1.prop | obj2.prop | obj3.prop`
                let JsValue::Alternatives {
                    total_nodes: _,
                    values,
                    logical_property: _,
                } = Arc::make_mut(obj)
                else {
                    unreachable!()
                };
                *value = JsValue::alternatives(
                    take(values)
                        .into_iter()
                        .map(|alt| JsValue::member(Arc::new(alt), prop.clone()))
                        .collect(),
                );
                true
            } else if matches!(obj.as_ref(), JsValue::Array { .. }) {
                // matching property access on an array like `[1,2,3].prop` or `[1,2,3][1]`
                fn items_to_alternatives(
                    items: &mut Vec<JsValue>,
                    prop: &mut Arc<JsValue>,
                ) -> JsValue {
                    items.push(JsValue::unknown(
                        JsValue::member(
                            Arc::new(JsValue::array(Vec::new())),
                            take(prop),
                        ),
                        false,
                        "unknown array prototype methods or values",
                    ));
                    JsValue::alternatives(take(items))
                }
                if matches!(
                    prop.as_ref(),
                    JsValue::Constant(ConstantValue::Num(ConstantNumber(_)))
                ) {
                    // accessing a numeric property on an array like `[1,2,3][1]`
                    // We can replace this with the value at the index
                    // Returns Some((item, mutable)) if found, None for invalid index,
                    // or Some((default, false)) with separate handling for non-index
                    let result = {
                        let JsValue::Array {
                            items,
                            mutable,
                            ..
                        } = Arc::make_mut(obj)
                        else {
                            unreachable!()
                        };
                        let JsValue::Constant(ConstantValue::Num(num @ ConstantNumber(_))) =
                            Arc::make_mut(prop)
                        else {
                            unreachable!()
                        };
                        if let Some(index) = num.as_u32_index() {
                            if index < items.len() {
                                // Found: return (item, mutable, true=found)
                                Ok((items.swap_remove(index), *mutable))
                            } else {
                                // Invalid index
                                Err(false)
                            }
                        } else {
                            // Not a valid index (e.g. negative or too large for u32)
                            Err(true)
                        }
                    };
                    match result {
                        Ok((item, mutable)) => {
                            *value = item;
                            if mutable {
                                value.add_unknown_mutations(true);
                            }
                            true
                        }
                        Err(true) => {
                            value.make_unknown(false, "non-num constant property on array");
                            true
                        }
                        Err(false) => {
                            *value = JsValue::unknown(
                                JsValue::member(take(obj), take(prop)),
                                false,
                                "invalid index",
                            );
                            true
                        }
                    }
                } else if matches!(prop.as_ref(), JsValue::Constant(_)) {
                    // accessing a non-numeric property on an array like `[1,2,3].length`
                    // We don't know what happens here
                    value.make_unknown(false, "non-num constant property on array");
                    true
                } else if matches!(prop.as_ref(), JsValue::Alternatives { .. }) {
                    // accessing multiple alternative properties on an array like `[1,2,3][(1 | 2 |
                    // prop3)]`
                    let JsValue::Alternatives {
                        total_nodes: _,
                        values,
                        logical_property: _,
                    } = Arc::make_mut(prop)
                    else {
                        unreachable!()
                    };
                    *value = JsValue::alternatives(
                        take(values)
                            .into_iter()
                            .map(|alt| JsValue::member(obj.clone(), Arc::new(alt)))
                            .collect(),
                    );
                    true
                } else {
                    // otherwise we can say that this might gives an item of the array
                    // but we also add an unknown value to the alternatives for other properties
                    let JsValue::Array {
                        items, ..
                    } = Arc::make_mut(obj)
                    else {
                        unreachable!()
                    };
                    *value = items_to_alternatives(items, prop);
                    true
                }
            } else if matches!(obj.as_ref(), JsValue::Object { .. }) {
                // matching property access on an object like `{a: 1, b: 2}.a`
                fn parts_to_alternatives(
                    parts: &mut Vec<ObjectPart>,
                    prop: &mut Arc<JsValue>,
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
                                        Arc::new(JsValue::object(vec![take(part)])),
                                        prop.clone(),
                                    ),
                                    true,
                                    "spread object",
                                ));
                            }
                        }
                    }
                    if include_unknown {
                        values.push(JsValue::unknown(
                            JsValue::member(
                                Arc::new(JsValue::object(Vec::new())),
                                take(prop),
                            ),
                            true,
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
                    prop: &mut Arc<JsValue>,
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

                if matches!(prop.as_ref(), JsValue::Constant(ConstantValue::Str(_))) {
                    // matching constant string property access on an object like `{a: 1, b:
                    // 2}["a"]`
                    //
                    // We compute the result in a block so that the Arc::make_mut
                    // borrow on obj is released before we assign to *value.
                    //
                    // Result is either:
                    // - Ok((new_value, mutable)) - replace *value with new_value
                    // - Err(()) - call value.make_unknown for spread case
                    let result: Result<(JsValue, bool), ()> = {
                        let JsValue::Object {
                            parts,
                            mutable,
                            ..
                        } = Arc::make_mut(obj)
                        else {
                            unreachable!()
                        };
                        let mutable = *mutable;
                        let prop_str = prop.as_str().unwrap();
                        let mut potential_values = Vec::new();
                        // found_key_index: Some(index) if exact key match found
                        // found_spread: true if a spread was encountered
                        let mut found_key_index: Option<usize> = None;
                        let mut found_spread = false;
                        for (i, part) in parts.iter_mut().enumerate().rev() {
                            match part {
                                ObjectPart::KeyValue(key, _) => {
                                    if let Some(key) = key.as_str() {
                                        if key == prop_str {
                                            if !potential_values.is_empty() {
                                                potential_values.push(i);
                                            }
                                            found_key_index = Some(i);
                                            break;
                                        }
                                    } else {
                                        potential_values.push(i);
                                    }
                                }
                                ObjectPart::Spread(_) => {
                                    found_spread = true;
                                    break;
                                }
                            }
                        }
                        if found_spread {
                            Err(())
                        } else if let Some(key_index) = found_key_index {
                            if potential_values.is_empty() {
                                // Exact match, take the value directly
                                if let ObjectPart::KeyValue(_, val) = &mut parts[key_index] {
                                    Ok((take(val), mutable))
                                } else {
                                    unreachable!()
                                }
                            } else {
                                Ok((
                                    potential_values_to_alternatives(
                                        potential_values,
                                        parts,
                                        prop,
                                        false,
                                    ),
                                    mutable,
                                ))
                            }
                        } else if potential_values.is_empty() {
                            Ok((JsValue::Constant(ConstantValue::Undefined), mutable))
                        } else {
                            Ok((
                                potential_values_to_alternatives(
                                    potential_values,
                                    parts,
                                    prop,
                                    true,
                                ),
                                mutable,
                            ))
                        }
                    };
                    match result {
                        Ok((new_value, mutable)) => {
                            *value = new_value;
                            if mutable {
                                value.add_unknown_mutations(true);
                            }
                        }
                        Err(()) => {
                            value.make_unknown(true, "spread object");
                        }
                    }
                    true
                } else if matches!(prop.as_ref(), JsValue::Alternatives { .. }) {
                    // matching multiple alternative properties on an object like `{a: 1, b: 2}[(a |
                    // b)]`
                    let JsValue::Alternatives {
                        total_nodes: _,
                        values,
                        logical_property: _,
                    } = Arc::make_mut(prop)
                    else {
                        unreachable!()
                    };
                    *value = JsValue::alternatives(
                        take(values)
                            .into_iter()
                            .map(|alt| JsValue::member(obj.clone(), Arc::new(alt)))
                            .collect(),
                    );
                    true
                } else {
                    let JsValue::Object {
                        parts, ..
                    } = Arc::make_mut(obj)
                    else {
                        unreachable!()
                    };
                    *value = parts_to_alternatives(parts, prop, true);
                    true
                }
            } else {
                false
            }
        }
        // matching calls with this context like `obj.prop(arg1, arg2, ...)`
        JsValue::MemberCall(_, obj, prop, args) => {
            if matches!(obj.as_ref(), JsValue::Array { .. }) {
                // matching calls on an array like `[1,2,3].concat([4,5,6])`
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
                                        | JsValue::Url(_, JsValueUrlKind::Absolute)
                                        | JsValue::Concat(..)
                                        | JsValue::Add(..)
                                        | JsValue::WellKnownObject(_)
                                        | JsValue::WellKnownFunction(_)
                                        | JsValue::Function(..)
                                )
                            }) {
                                {
                                    let JsValue::Array { items, mutable, .. } =
                                        Arc::make_mut(obj)
                                    else {
                                        unreachable!()
                                    };
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
                                            | JsValue::Url(_, JsValueUrlKind::Absolute)
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
                                }
                                Arc::make_mut(obj).update_total_nodes();
                                *value = Arc::unwrap_or_clone(take(obj));
                                return true;
                            }
                        }
                        // The Array.prototype.map method
                        "map" => {
                            if let Some(func) = args.first() {
                                let JsValue::Array { items, .. } = Arc::make_mut(obj) else {
                                    unreachable!()
                                };
                                *value = JsValue::array(
                                    take(items)
                                        .into_iter()
                                        .enumerate()
                                        .map(|(i, item)| {
                                            JsValue::call(
                                                Arc::new(func.clone()),
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
            } else if matches!(obj.as_ref(), JsValue::Alternatives { .. }) {
                // matching calls on multiple alternative objects like `(obj1 | obj2).prop(arg1,
                // arg2, ...)`
                let JsValue::Alternatives {
                    total_nodes: _,
                    values,
                    logical_property: _,
                } = Arc::make_mut(obj)
                else {
                    unreachable!()
                };
                *value = JsValue::alternatives(
                    take(values)
                        .into_iter()
                        .map(|alt| {
                            JsValue::member_call(
                                Arc::new(alt),
                                prop.clone(),
                                args.clone(),
                            )
                        })
                        .collect(),
                );
                return true;
            }

            // matching calls on strings like `"dayjs/locale/".concat(userLocale, ".js")`
            if obj.is_string() == Some(true)
                && let Some(str) = prop.as_str()
            {
                // The String.prototype.concat method
                if str == "concat" {
                    let mut values = vec![Arc::unwrap_or_clone(take(obj))];
                    values.extend(take(args));

                    *value = JsValue::concat(values);
                    return true;
                }
            }

            // without special handling, we convert it into a normal call like
            // `(obj.prop)(arg1, arg2, ...)`
            *value = JsValue::call(
                Arc::new(JsValue::member(take(obj), take(prop))),
                take(args),
            );
            true
        }
        // match calls when the callee are multiple alternative functions like `(func1 |
        // func2)(arg1, arg2, ...)`
        JsValue::Call(_, callee, args)
            if matches!(callee.as_ref(), JsValue::Alternatives { .. }) =>
        {
            let JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } = Arc::make_mut(callee)
            else {
                unreachable!()
            };
            *value = JsValue::alternatives(
                take(values)
                    .into_iter()
                    .map(|alt| JsValue::call(Arc::new(alt), args.clone()))
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
        JsValue::Logical(_, op, parts) => {
            let len = parts.len();
            let input_parts: Vec<JsValue> = take(parts);
            *parts = Vec::with_capacity(len);
            let mut part_properties = Vec::with_capacity(len);
            for (i, part) in input_parts.into_iter().enumerate() {
                // The last part is never skipped.
                if i == len - 1 {
                    // We intentionally omit the part_properties for the last part.
                    // This isn't always needed so we only compute it when actually needed.
                    parts.push(part);
                    break;
                }
                let property = match op {
                    LogicalOperator::And => part.is_truthy(),
                    LogicalOperator::Or => part.is_falsy(),
                    LogicalOperator::NullishCoalescing => part.is_nullish(),
                };
                // We might know at compile-time if a part is skipped or the final value.
                match property {
                    Some(true) => {
                        // We known this part is skipped, so we can remove it.
                        continue;
                    }
                    Some(false) => {
                        // We known this part is the final value, so we can remove the rest.
                        part_properties.push(property);
                        parts.push(part);
                        break;
                    }
                    None => {
                        // We don't know if this part is skipped or the final value, so we keep it.
                        part_properties.push(property);
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
                let last_part = parts.last().unwrap();
                let property = match op {
                    LogicalOperator::And => last_part.is_truthy(),
                    LogicalOperator::Or => last_part.is_falsy(),
                    LogicalOperator::NullishCoalescing => last_part.is_nullish(),
                };
                part_properties.push(property);
                let (any_unset, all_set) =
                    part_properties
                        .iter()
                        .fold((false, true), |(any_unset, all_set), part| match part {
                            Some(true) => (any_unset, all_set),
                            Some(false) => (true, false),
                            None => (any_unset, false),
                        });
                let property = match op {
                    LogicalOperator::Or => {
                        if any_unset {
                            Some(LogicalProperty::Truthy)
                        } else if all_set {
                            Some(LogicalProperty::Falsy)
                        } else {
                            None
                        }
                    }
                    LogicalOperator::And => {
                        if any_unset {
                            Some(LogicalProperty::Falsy)
                        } else if all_set {
                            Some(LogicalProperty::Truthy)
                        } else {
                            None
                        }
                    }
                    LogicalOperator::NullishCoalescing => {
                        if any_unset {
                            Some(LogicalProperty::NonNullish)
                        } else if all_set {
                            Some(LogicalProperty::Nullish)
                        } else {
                            None
                        }
                    }
                };
                if let Some(property) = property {
                    *value = JsValue::alternatives_with_additional_property(take(parts), property);
                    true
                } else {
                    *value = JsValue::alternatives(take(parts));
                    true
                }
            }
        }
        JsValue::Tenary(_, test, cons, alt) => {
            if test.is_truthy() == Some(true) {
                *value = Arc::unwrap_or_clone(take(cons));
                true
            } else if test.is_falsy() == Some(true) {
                *value = Arc::unwrap_or_clone(take(alt));
                true
            } else {
                false
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
        JsValue::Not(_, inner) => match inner.is_truthy() {
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

        JsValue::Iterated(_, iterable) => {
            if matches!(iterable.as_ref(), JsValue::Array { .. }) {
                let new_value = {
                    let JsValue::Array { items, mutable, .. } = Arc::make_mut(iterable) else {
                        unreachable!()
                    };
                    let mut new_value = JsValue::alternatives(take(items));
                    if *mutable {
                        new_value.add_unknown_mutations(true);
                    }
                    new_value
                };
                *value = new_value;
                true
            } else {
                false
            }
        }

        JsValue::Awaited(_, operand) => {
            if matches!(operand.as_ref(), JsValue::Promise(..)) {
                let inner_value = {
                    let JsValue::Promise(_, inner) = Arc::make_mut(operand) else {
                        unreachable!()
                    };
                    Arc::unwrap_or_clone(take(inner))
                };
                *value = inner_value;
                true
            } else {
                *value = Arc::unwrap_or_clone(take(operand));
                true
            }
        }

        _ => false,
    }
}
