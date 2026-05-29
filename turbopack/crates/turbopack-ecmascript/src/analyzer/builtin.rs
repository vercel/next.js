use std::mem::take;

use turbo_rcstr::rcstr;

use super::{ConstantNumber, ConstantValue, JsValue, LogicalOperator, LogicalProperty, ObjectPart};
use crate::analyzer::{
    JsValueUrlKind,
    arena::{Arena, BumpVec},
};

/// Replaces some builtin values with their resulting values. Called early
/// without lazy nested values. This allows to skip a lot of work to process the
/// arguments.
pub fn early_replace_builtin(value: &mut JsValue<'_>) -> bool {
    match value {
        // matching calls like `callee(arg1, arg2, ...)`
        JsValue::Call(_, call) => {
            let (args, callee) = call.as_parts_mut();
            let args_have_side_effects = || args.iter().any(|arg| arg.has_side_effects());
            match callee {
                // We don't know what the callee is, so we can early return
                &mut JsValue::Unknown {
                    original_value: _,
                    reason: _,
                    has_side_effects,
                } => {
                    let has_side_effects = has_side_effects || args_have_side_effects();
                    value.make_unknown(has_side_effects, rcstr!("unknown callee"));
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
                    value.make_unknown(has_side_effects, rcstr!("non-function callee"));
                    true
                }
                _ => false,
            }
        }
        // matching calls with this context like `obj.prop(arg1, arg2, ...)`
        JsValue::MemberCall(_, call) => {
            let (args, prop, obj) = call.as_parts_mut();
            let args_have_side_effects = || args.iter().any(|arg| arg.has_side_effects());
            match obj {
                // We don't know what the callee is, so we can early return
                &mut JsValue::Unknown {
                    original_value: _,
                    reason: _,
                    has_side_effects,
                } => {
                    let side_effects =
                        has_side_effects || prop.has_side_effects() || args_have_side_effects();
                    value.make_unknown(side_effects, rcstr!("unknown callee object"));
                    true
                }
                // otherwise we need to look at the property
                _ => match prop {
                    // We don't know what the property is, so we can early return
                    &mut JsValue::Unknown {
                        original_value: _,
                        reason: _,
                        has_side_effects,
                    } => {
                        let side_effects = has_side_effects || args_have_side_effects();
                        value.make_unknown(side_effects, rcstr!("unknown callee property"));
                        true
                    }
                    _ => false,
                },
            }
        }
        // matching property access like `obj.prop` when we don't know what the obj is.
        // We can early return here
        JsValue::Member(_, obj, prop) if matches!(&**obj, JsValue::Unknown { .. }) => {
            let JsValue::Unknown {
                has_side_effects, ..
            } = &**obj
            else {
                unreachable!()
            };
            let side_effects = *has_side_effects || prop.has_side_effects();
            value.make_unknown(side_effects, rcstr!("unknown object"));
            true
        }
        _ => false,
    }
}

/// Replaces some builtin functions and values with their resulting values. In
/// contrast to early_replace_builtin this has all inner values already
/// processed.
pub fn replace_builtin<'a>(arena: &'a Arena, value: &mut JsValue<'a>) -> bool {
    match value {
        JsValue::Add(_, list) => {
            // numeric addition
            let mut sum = 0f64;
            for arg in list {
                let JsValue::Constant(ConstantValue::Num(num)) = arg else {
                    return false;
                };
                sum += *num.0;
            }
            *value = JsValue::Constant(ConstantValue::Num(sum.into()));
            true
        }

        // matching property access like `obj.prop`
        // Accessing a property on something can be handled in some cases
        JsValue::Member(_, obj, prop) => match &mut **obj {
            // matching property access when obj is a bunch of alternatives
            // like `(obj1 | obj2 | obj3).prop`
            // We expand these to `obj1.prop | obj2.prop | obj3.prop`
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => {
                *value = JsValue::alternatives(arena.vec_from_iter(
                    values
                        .drain(..)
                        .map(|alt| JsValue::member(arena, alt, prop.clone_in(arena))),
                ));
                true
            }
            // matching property access on an array like `[1,2,3].prop` or `[1,2,3][1]`
            JsValue::Array {
                items,
                mutable,
                ..
            } => {
                let mutable = *mutable;
                fn items_to_alternatives<'a>(
                    arena: &'a Arena,
                    items: &mut BumpVec<'a, JsValue<'a>>,
                    prop: &mut JsValue<'a>,
                ) -> JsValue<'a> {
                    items.push(JsValue::unknown(
                        JsValue::member(arena, JsValue::array(arena.vec()), take(prop)),
                        false,
                        rcstr!("unknown array prototype methods or values"),
                    ));
                    JsValue::alternatives(arena.vec_from_iter(items.drain(..)))
                }
                match &mut **prop {
                    // accessing a numeric property on an array like `[1,2,3][1]`
                    // We can replace this with the value at the index
                    JsValue::Constant(ConstantValue::Num(num @ ConstantNumber(_))) => {
                        if let Some(index) = num.as_u32_index() {
                            if index < items.len() {
                                *value = items.swap_remove(index);
                                if mutable {
                                    value.add_unknown_mutations(arena, true);
                                }
                                true
                            } else {
                                *value = JsValue::unknown(
                                    JsValue::member(arena, take(&mut **obj), take(&mut **prop)),
                                    false,
                                    rcstr!("invalid index"),
                                );
                                true
                            }
                        } else {
                            value.make_unknown(false, rcstr!("non-num constant property on array"));
                            true
                        }
                    }
                    // accessing a non-numeric property on an array like `[1,2,3].length`
                    // We don't know what happens here
                    JsValue::Constant(_) => {
                        value.make_unknown(false, rcstr!("non-num constant property on array"));
                        true
                    }
                    // accessing multiple alternative properties on an array like `[1,2,3][(1 | 2 |
                    // prop3)]`
                    JsValue::Alternatives {
                        total_nodes: _,
                        values,
                        logical_property: _,
                    } => {
                        let alts: Vec<JsValue<'a>> = values.drain(..).collect();
                        *value = JsValue::alternatives(arena.vec_from_iter(
                            alts.into_iter()
                                .map(|alt| JsValue::member(arena, obj.clone_in(arena), alt)),
                        ));
                        true
                    }
                    // otherwise we can say that this might gives an item of the array
                    // but we also add an unknown value to the alternatives for other properties
                    _ => {
                        *value = items_to_alternatives(arena, items, prop);
                        true
                    }
                }
            }
            // matching property access on an object like `{a: 1, b: 2}.a`
            JsValue::Object {
                parts,
                mutable,
                ..
            } => {
                let mutable = *mutable;
                fn parts_to_alternatives<'a>(
                    arena: &'a Arena,
                    parts: &mut [ObjectPart<'a>],
                    prop: &mut JsValue<'a>,
                    include_unknown: bool,
                ) -> JsValue<'a> {
                    let mut values = Vec::new();
                    for part in parts {
                        match part {
                            ObjectPart::KeyValue(_, value) => {
                                values.push(take(value));
                            }
                            ObjectPart::Spread(_) => {
                                values.push(JsValue::unknown(
                                    JsValue::member(
                                        arena,
                                        JsValue::object(arena.vec_from_iter([take(part)])),
                                        prop.clone_in(arena),
                                    ),
                                    true,
                                    rcstr!("spread object"),
                                ));
                            }
                        }
                    }
                    if include_unknown {
                        values.push(JsValue::unknown(
                            JsValue::member(
                                arena,
                                JsValue::object(arena.vec()),
                                take(prop),
                            ),
                            true,
                            rcstr!("unknown object prototype methods or values"),
                        ));
                    }
                    JsValue::alternatives(arena.vec_from_iter(values))
                }

                /// Convert a list of potential values into
                /// JsValue::Alternatives Optionally add a
                /// unknown value to the alternatives for object prototype
                /// methods
                fn potential_values_to_alternatives<'a>(
                    arena: &'a Arena,
                    mut potential_values: Vec<usize>,
                    parts: &mut BumpVec<'a, ObjectPart<'a>>,
                    prop: &mut JsValue<'a>,
                    include_unknown: bool,
                ) -> JsValue<'a> {
                    // Note: potential_values are already in reverse order
                    let mut potential_values: Vec<ObjectPart<'a>> = parts
                        .drain(..)
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
                    parts_to_alternatives(arena, &mut potential_values, prop, include_unknown)
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
                                                    arena,
                                                    potential_values,
                                                    parts,
                                                    prop,
                                                    false,
                                                );
                                            }
                                            if mutable {
                                                value.add_unknown_mutations(arena, true);
                                            }
                                            return true;
                                        }
                                    } else {
                                        potential_values.push(i);
                                    }
                                }
                                ObjectPart::Spread(_) => {
                                    value.make_unknown(true, rcstr!("spread object"));
                                    return true;
                                }
                            }
                        }
                        if potential_values.is_empty() {
                            *value = JsValue::Constant(ConstantValue::Undefined);
                        } else {
                            *value = potential_values_to_alternatives(
                                arena,
                                potential_values,
                                parts,
                                prop,
                                true,
                            );
                        }
                        if mutable {
                            value.add_unknown_mutations(arena, true);
                        }
                        true
                    }
                    // matching multiple alternative properties on an object like `{a: 1, b: 2}[(a |
                    // b)]`
                    JsValue::Alternatives {
                        total_nodes: _,
                        values,
                        logical_property: _,
                    } => {
                        let alts: Vec<JsValue<'a>> = values.drain(..).collect();
                        *value = JsValue::alternatives(arena.vec_from_iter(
                            alts.into_iter()
                                .map(|alt| JsValue::member(arena, obj.clone_in(arena), alt)),
                        ));
                        true
                    }
                    _ => {
                        *value = parts_to_alternatives(arena, parts, prop, true);
                        true
                    }
                }
            }
            _ => false,
        },

        JsValue::MemberCall(_, _) => {
            // `into_parts` pops obj + prop off the tail of the underlying `Vec`, and the
            // remaining `Vec` (owned, not reallocated) becomes `args`. We take the whole
            // value (which has a `Default`) to move the `MemberCallList` out, as the list
            // itself has no `Default`.
            let JsValue::MemberCall(_, call) = take(value) else {
                unreachable!()
            };
            let (mut obj, prop, args) = call.into_parts();
            match &mut obj {
                // matching calls on an array like `[1,2,3].concat([4,5,6])`
                JsValue::Array { items, mutable, .. } => {
                    // matching cases where the property is a const string
                    if let Some(str) = prop.as_str() {
                        match str {
                            // The Array.prototype.concat method
                            "concat"
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
                                }) => {
                                    for arg in args {
                                        match arg {
                                            JsValue::Array {
                                                items: inner,
                                                mutable: inner_mutable,
                                                ..
                                            } => {
                                                items.extend(inner);
                                                *mutable |= inner_mutable;
                                            }
                                            other @ (JsValue::Constant(_)
                                            | JsValue::Url(_, JsValueUrlKind::Absolute)
                                            | JsValue::Concat(..)
                                            | JsValue::Add(..)
                                            | JsValue::WellKnownObject(_)
                                            | JsValue::WellKnownFunction(_)
                                            | JsValue::Function(..)) => {
                                                items.push(other);
                                            }
                                            _ => {
                                                unreachable!();
                                            }
                                        }
                                    }
                                    obj.update_total_nodes();
                                    *value = obj;
                                    return true;
                                }
                            // The Array.prototype.map method
                            "map" => {
                                if let Some(func) = args.first() {
                                    let func = func.clone_in(arena);
                                    let mapped: Vec<JsValue<'a>> = items
                                        .drain(..)
                                        .enumerate()
                                        .map(|(i, item)| {
                                            JsValue::call_from_iter(
                                                arena,
                                                func.clone_in(arena),
                                                [
                                                    item,
                                                    JsValue::Constant(ConstantValue::Num(
                                                        (i as f64).into(),
                                                    )),
                                                ],
                                            )
                                        })
                                        .collect();
                                    *value = JsValue::array(arena.vec_from_iter(mapped));
                                    return true;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                // matching calls on multiple alternative objects like `(obj1 | obj2).prop(arg1,
                // arg2, ...)`
                JsValue::Alternatives {
                    total_nodes: _,
                    values,
                    logical_property: _,
                } => {
                    let alts: Vec<JsValue<'a>> = values.drain(..).collect();
                    *value = JsValue::alternatives(arena.vec_from_iter(alts.into_iter().map(
                        |alt| {
                            JsValue::member_call_from_iter(
                                arena,
                                alt,
                                prop.clone_in(arena),
                                args.iter().map(|a| a.clone_in(arena)),
                            )
                        },
                    )));
                    return true;
                }
                _ => {}
            }

            // matching calls on strings like `"dayjs/locale/".concat(userLocale, ".js")`
            if obj.is_string() == Some(true)
                && let Some(str) = prop.as_str()
            {
                // The String.prototype.concat method
                if str == "concat" {
                    let mut values = arena.vec_with_capacity(1 + args.len());
                    values.push(obj);
                    values.extend(args);

                    *value = JsValue::concat(values);
                    return true;
                }
            }

            // without special handling, we convert it into a normal call like
            // `(obj.prop)(arg1, arg2, ...)`.
            //
            // Pass-through path: `args` came from `MemberCallList::into_parts` which yields
            // a `Vec` with `cap >= len + 2` (slack from the original layout). Re-wrapping it
            // into a `JsValue::Call` only needs `+1` slot, which fits in the existing slack —
            // no realloc. This is the original motivation for the `[args..., prop, obj]`
            // tail layout.
            *value = JsValue::call_from_parts(JsValue::member(arena, obj, prop), args);
            true
        }
        // match calls when the callee are multiple alternative functions like `(func1 |
        // func2)(arg1, arg2, ...)`
        JsValue::Call(_, call)
            if matches!(call.callee(), JsValue::Alternatives { .. }) =>
        {
            // Take ownership so we can move the alternatives `values` out of the callee.
            // We take the whole value (which has a `Default`) to move the `CallList` out, as
            // the list itself has no `Default`.
            let JsValue::Call(_, call) = take(value) else {
                unreachable!()
            };
            let (callee, args) = call.into_parts();
            let JsValue::Alternatives { values, .. } = callee else {
                unreachable!()
            };
            *value = JsValue::alternatives(arena.vec_from_iter(
                values
                    .into_iter()
                    .map(|alt| JsValue::call_from_iter(arena, alt, args.iter().map(|a| a.clone_in(arena)))),
            ));
            true
        }
        // match object literals
        JsValue::Object { parts, mutable, .. }
            // If the object contains any spread, we might be able to flatten that
            if parts
                .iter()
                .any(|part| matches!(part, ObjectPart::Spread(JsValue::Object { .. })))
            => {
                let old_parts: Vec<ObjectPart<'a>> = parts.drain(..).collect();
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
            }
        // match logical expressions like `a && b` or `a || b || c` or `a ?? b`
        // Reduce logical expressions to their final value(s)
        JsValue::Logical(..) => {
            // Take the whole value (which has a `Default`) to move the operator and the
            // `BumpVec` of parts out, as the `BumpVec` itself has no `Default`.
            let JsValue::Logical(_, op, input_parts) = take(value) else {
                unreachable!()
            };
            let len = input_parts.len();
            let mut parts = arena.vec_with_capacity::<JsValue<'a>>(len);
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
                    *value = JsValue::alternatives_with_additional_property(parts, property);
                    true
                } else {
                    *value = JsValue::alternatives(parts);
                    true
                }
            }
        }
        JsValue::Tenary(_, test, cons, alt) => {
            if test.is_truthy() == Some(true) {
                *value = take(&mut **cons);
                true
            } else if test.is_falsy() == Some(true) {
                *value = take(&mut **alt);
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
            if let JsValue::Array { items, mutable, .. } = &mut **iterable {
                let mut new_value = JsValue::alternatives(arena.vec_from_iter(items.drain(..)));
                if *mutable {
                    new_value.add_unknown_mutations(arena, true);
                }
                *value = new_value;
                true
            } else {
                false
            }
        }

        JsValue::Awaited(_, operand) => {
            if let JsValue::Promise(_, inner) = &mut **operand {
                *value = take(&mut **inner);
                true
            } else {
                *value = take(&mut **operand);
                true
            }
        }

        _ => false,
    }
}
