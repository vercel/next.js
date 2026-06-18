use crate::analyzer::{
    ConstantValue, JsValue, LogicalOperator, LogicalProperty, ObjectPart, PositiveBinaryOperator,
    WellKnownFunctionKind,
};

// Compile-time information gathering
impl JsValue<'_> {
    /// Returns the constant string if the value represents a constant string.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::Constant(c) => c.as_str(),
            _ => None,
        }
    }

    /// Returns the constant bool if the value represents a constant boolean.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => c.as_bool(),
            _ => None,
        }
    }

    pub fn has_side_effects(&self) -> bool {
        match self {
            JsValue::Constant(_) => false,
            JsValue::Concat(_, values)
            | JsValue::Add(_, values)
            | JsValue::Logical(_, _, values)
            | JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => values.iter().any(JsValue::has_side_effects),
            JsValue::Binary(_, a, _, b) => a.has_side_effects() || b.has_side_effects(),
            JsValue::Tenary(_, test, cons, alt) => {
                test.has_side_effects() || cons.has_side_effects() || alt.has_side_effects()
            }
            JsValue::Not(_, value) => value.has_side_effects(),
            JsValue::Array { items, .. } => items.iter().any(JsValue::has_side_effects),
            JsValue::Object { parts, .. } => parts.iter().any(|v| match v {
                ObjectPart::KeyValue(k, v) => k.has_side_effects() || v.has_side_effects(),
                ObjectPart::Spread(v) => v.has_side_effects(),
            }),
            // As function bodies aren't analyzed for side-effects, we have to assume every call can
            // have sideeffects as well.
            // Otherwise it would be
            // `func_body(callee).has_side_effects() ||
            //      callee.has_side_effects() || args.iter().any(JsValue::has_side_effects`
            JsValue::New(_, _call) => true,
            JsValue::Call(_, _call) => true,
            JsValue::SuperCall(_, _args) => true,
            JsValue::MemberCall(_, _call) => true,
            JsValue::Member(_, obj, prop) => obj.has_side_effects() || prop.has_side_effects(),
            JsValue::Function(_, _, _) => false,
            JsValue::Url(_, _) => false,
            JsValue::Variable(_) => false,
            JsValue::Module(_) => false,
            JsValue::WellKnownObject(_) => false,
            JsValue::WellKnownFunction(_) => false,
            JsValue::FreeVar(_) => false,
            JsValue::Unknown {
                has_side_effects, ..
            } => *has_side_effects,
            JsValue::Argument(_, _) => false,
            JsValue::Iterated(_, iterable) => iterable.has_side_effects(),
            JsValue::TypeOf(_, operand) => operand.has_side_effects(),
            JsValue::Promise(_, operand) => operand.has_side_effects(),
            JsValue::Awaited(_, operand) => operand.has_side_effects(),
        }
    }

    /// Checks if the value is truthy. Returns None if we don't know. Returns
    /// Some if we know if or if not the value is truthy.
    pub fn is_truthy(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_truthy()),
            JsValue::Concat(..) => self.is_empty_string().map(|x| !x),
            JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Promise(..)
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Function(..) => Some(true),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => match logical_property {
                Some(LogicalProperty::Truthy) => Some(true),
                Some(LogicalProperty::Falsy) => Some(false),
                Some(LogicalProperty::Nullish) => Some(false),
                _ => merge_if_known(values, JsValue::is_truthy),
            },
            JsValue::Not(_, value) => value.is_truthy().map(|x| !x),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => all_if_known(list, JsValue::is_truthy),
                LogicalOperator::Or => any_if_known(list, JsValue::is_truthy),
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_truthy)
                }
            },
            JsValue::Binary(_, a, op, b) => {
                let (positive_op, negate) = op.positive_op();
                match (positive_op, &**a, &**b) {
                    (
                        PositiveBinaryOperator::StrictEqual,
                        JsValue::Constant(a),
                        JsValue::Constant(b),
                    ) if a.is_value_type() => Some(a == b),
                    (
                        PositiveBinaryOperator::StrictEqual,
                        JsValue::Constant(a),
                        JsValue::Constant(b),
                    ) if a.is_value_type() => {
                        let same_type = {
                            use ConstantValue::*;
                            matches!(
                                (a, b),
                                (Num(_), Num(_))
                                    | (Str(_), Str(_))
                                    | (BigInt(_), BigInt(_))
                                    | (True | False, True | False)
                                    | (Undefined, Undefined)
                                    | (Null, Null)
                            )
                        };
                        if same_type { Some(a == b) } else { None }
                    }
                    (
                        PositiveBinaryOperator::Equal,
                        JsValue::Constant(ConstantValue::Str(a)),
                        JsValue::Constant(ConstantValue::Str(b)),
                    ) => Some(a == b),
                    (
                        PositiveBinaryOperator::Equal,
                        JsValue::Constant(ConstantValue::Num(a)),
                        JsValue::Constant(ConstantValue::Num(b)),
                    ) => Some(a == b),
                    _ => None,
                }
                .map(|x| x ^ negate)
            }
            JsValue::Tenary(_, _, cons, alt) => {
                merge_if_known([&**cons, &**alt], JsValue::is_truthy)
            }
            _ => None,
        }
    }

    /// Checks if the value is falsy. Returns None if we don't know. Returns
    /// Some if we know if or if not the value is falsy.
    pub fn is_falsy(&self) -> Option<bool> {
        self.is_truthy().map(|x| !x)
    }

    /// Checks if the value is nullish (null or undefined). Returns None if we
    /// don't know. Returns Some if we know if or if not the value is nullish.
    pub fn is_nullish(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_nullish()),
            JsValue::Concat(..)
            | JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Not(..)
            | JsValue::Binary(..)
            | JsValue::Promise(..)
            | JsValue::Function(..) => Some(false),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => match logical_property {
                Some(LogicalProperty::Nullish) => Some(true),
                _ => merge_if_known(values, JsValue::is_nullish),
            },
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_nullish)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_nullish)
                }
                LogicalOperator::NullishCoalescing => all_if_known(list, JsValue::is_nullish),
            },
            JsValue::Tenary(_, _, cons, alt) => {
                merge_if_known([&**cons, &**alt], JsValue::is_nullish)
            }
            _ => None,
        }
    }

    /// Checks if we know that the value is not nullish. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is not
    /// nullish.
    pub fn is_not_nullish(&self) -> Option<bool> {
        self.is_nullish().map(|x| !x)
    }

    /// Checks if we know that the value is an empty string. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is an empty
    /// string.
    pub fn is_empty_string(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_empty_string()),
            JsValue::Concat(_, list) => all_if_known(list, JsValue::is_empty_string),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, JsValue::is_empty_string),
            JsValue::Tenary(_, _, cons, alt) => {
                merge_if_known([&**cons, &**alt], JsValue::is_empty_string)
            }
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_empty_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_empty_string)
                }
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_empty_string)
                }
            },
            // Booleans are not empty strings
            JsValue::Not(..) | JsValue::Binary(..) => Some(false),
            // Objects are not empty strings
            JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Function(..) => Some(false),
            _ => None,
        }
    }

    /// Returns true, if the value is unknown and storing it as condition
    /// doesn't make sense. This is for optimization purposes.
    pub fn is_unknown(&self) -> bool {
        match self {
            JsValue::Unknown { .. } => true,
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => values.iter().any(|x| x.is_unknown()),
            _ => false,
        }
    }

    /// Checks if we know that the value is a string. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is a string.
    pub fn is_string(&self) -> Option<bool> {
        match self {
            JsValue::Constant(ConstantValue::Str(..))
            | JsValue::Concat(..)
            | JsValue::TypeOf(..) => Some(true),

            // Objects are not strings
            JsValue::Constant(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Url(..)
            | JsValue::Module(..)
            | JsValue::Function(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Promise(_, _) => Some(false),

            // Booleans are not strings
            JsValue::Not(..) | JsValue::Binary(..) => Some(false),

            JsValue::Add(_, list) => any_if_known(list, JsValue::is_string),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_string)
                }
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_string)
                }
            },

            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, JsValue::is_string),

            JsValue::Tenary(_, _, cons, alt) => {
                merge_if_known([&**cons, &**alt], JsValue::is_string)
            }

            JsValue::Call(_, call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(
                        WellKnownFunctionKind::RequireResolve
                            | WellKnownFunctionKind::PathJoin
                            | WellKnownFunctionKind::PathResolve(..)
                            | WellKnownFunctionKind::OsArch
                            | WellKnownFunctionKind::OsPlatform
                            | WellKnownFunctionKind::PathDirname
                            | WellKnownFunctionKind::PathToFileUrl
                            | WellKnownFunctionKind::ProcessCwd,
                    )
                ) =>
            {
                Some(true)
            }

            JsValue::Awaited(_, operand) => match &**operand {
                JsValue::Promise(_, v) => v.is_string(),
                v => v.is_string(),
            },

            JsValue::FreeVar(..)
            | JsValue::Variable(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..)
            | JsValue::New(..)
            | JsValue::Call(..)
            | JsValue::MemberCall(..)
            | JsValue::Member(..)
            | JsValue::SuperCall(..)
            | JsValue::Iterated(..) => None,
        }
    }

    /// Checks if we know that the value starts with a given string. Returns
    /// None if we don't know. Returns Some if we know if or if not the
    /// value starts with the given string.
    pub fn starts_with(&self, str: &str) -> Option<bool> {
        if let Some(s) = self.as_str() {
            return Some(s.starts_with(str));
        }
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, |a| a.starts_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.iter().next() {
                    if item.starts_with(str) == Some(true) {
                        Some(true)
                    } else if let Some(s) = item.as_str() {
                        if str.starts_with(s) {
                            None
                        } else {
                            Some(false)
                        }
                    } else {
                        None
                    }
                } else {
                    Some(false)
                }
            }

            _ => None,
        }
    }

    /// Checks if we know that the value ends with a given string. Returns
    /// None if we don't know. Returns Some if we know if or if not the
    /// value ends with the given string.
    pub fn ends_with(&self, str: &str) -> Option<bool> {
        if let Some(s) = self.as_str() {
            return Some(s.ends_with(str));
        }
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, |alt| alt.ends_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.last() {
                    if item.ends_with(str) == Some(true) {
                        Some(true)
                    } else if let Some(s) = item.as_str() {
                        if str.ends_with(s) { None } else { Some(false) }
                    } else {
                        None
                    }
                } else {
                    Some(false)
                }
            }

            _ => None,
        }
    }
}

/// Compute the compile-time value of all elements of the list. If all evaluate
/// to the same value return that. Otherwise return None.
fn merge_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    let mut current = None;
    for item in list.into_iter().map(func) {
        if item.is_some() {
            if current.is_none() {
                current = item;
            } else if current != item {
                return None;
            }
        } else {
            return None;
        }
    }
    current
}

/// Evaluates all elements of the list and returns Some(true) if all elements
/// are compile-time true. If any element is compile-time false, return
/// Some(false). Otherwise return None.
fn all_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    let mut unknown = false;
    for item in list.into_iter().map(func) {
        match item {
            Some(false) => return Some(false),
            None => unknown = true,
            _ => {}
        }
    }
    if unknown { None } else { Some(true) }
}

/// Evaluates all elements of the list and returns Some(true) if any element is
/// compile-time true. If all elements are compile-time false, return
/// Some(false). Otherwise return None.
fn any_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    all_if_known(list, |x| func(x).map(|x| !x)).map(|x| !x)
}

/// Selects the first element of the list where `use_item` is compile-time true.
/// For this element returns the result of `item_value`. Otherwise returns None.
fn shortcircuit_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    use_item: impl Fn(T) -> Option<bool>,
    item_value: impl FnOnce(T) -> Option<bool>,
) -> Option<bool> {
    let mut it = list.into_iter().peekable();
    while let Some(item) = it.next() {
        if it.peek().is_none() {
            return item_value(item);
        } else {
            match use_item(item) {
                Some(true) => return item_value(item),
                None => return None,
                _ => {}
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use rstest::rstest;
    use turbo_rcstr::rcstr;

    use crate::analyzer::{Bump, ConstantValue, JsValue, ThreadLocal, graph::EvalContext};

    // A leaked arena for building test `JsValue`s with a `'static` lifetime. Tests are
    // short-lived processes, so the leak is inconsequential.
    fn test_arena() -> &'static Bump {
        Box::leak(Box::new(Bump::new()))
    }

    // `construct_test_ternary(cons, alt)` builds a ternary with an unknown test condition.
    fn construct_test_ternary(cons: JsValue<'static>, alt: JsValue<'static>) -> JsValue<'static> {
        JsValue::tenary(
            test_arena(),
            JsValue::unknown_empty(false, rcstr!("test")),
            cons,
            alt,
        )
    }

    #[rstest]
    #[case(JsValue::from(1.0))]
    #[case(JsValue::from("hi"))]
    #[case(ConstantValue::True.into())]
    #[case(JsValue::promise(test_arena(), ConstantValue::Null.into()))]
    #[case(construct_test_ternary(JsValue::from(1.0), JsValue::from("hi")))]
    fn is_truthy_positive(#[case] v: JsValue<'static>) {
        assert_eq!(v.is_truthy(), Some(true), "expected '{v}' to be truthy");
    }

    #[rstest]
    #[case(JsValue::from(0.0))]
    #[case(JsValue::from(""))]
    #[case(ConstantValue::False.into())]
    #[case(ConstantValue::Null.into())]
    #[case(ConstantValue::Undefined.into())]
    #[case(construct_test_ternary(JsValue::from(0.0), JsValue::from("")))]
    fn is_truthy_negative(#[case] v: JsValue<'static>) {
        assert_eq!(v.is_truthy(), Some(false), "expected '{v}' to be falsy");
    }

    #[rstest]
    #[case(ConstantValue::Null.into())]
    #[case(ConstantValue::Undefined.into())]
    #[case(construct_test_ternary(ConstantValue::Null.into(), ConstantValue::Undefined.into()))]
    fn is_nullish_positive(#[case] v: JsValue<'static>) {
        assert_eq!(v.is_nullish(), Some(true), "expected '{v}' to be nullish");
    }

    #[rstest]
    #[case(JsValue::from(0.0))]
    #[case(JsValue::from(""))]
    #[case(JsValue::from("hi"))]
    #[case(ConstantValue::True.into())]
    #[case(JsValue::promise(test_arena(), ConstantValue::Null.into()))]
    #[case(construct_test_ternary(JsValue::from(0.0), JsValue::from("hi")))]
    fn is_nullish_negative(#[case] v: JsValue<'static>) {
        assert_eq!(
            v.is_nullish(),
            Some(false),
            "expected '{v}' not to be nullish"
        );
    }

    #[rstest]
    #[case(JsValue::from("hi"))]
    #[case(JsValue::from(""))]
    #[case(construct_test_ternary(JsValue::from("a"), JsValue::from("b")))]
    fn is_string_positive(#[case] v: JsValue<'static>) {
        assert_eq!(v.is_string(), Some(true), "expected '{v}' to be a string");
    }

    #[rstest]
    #[case(JsValue::from(1.0))]
    #[case(ConstantValue::True.into())]
    #[case(ConstantValue::Null.into())]
    #[case(construct_test_ternary(JsValue::from(1.0), JsValue::from(2.0)))]
    fn is_string_negative(#[case] v: JsValue<'static>) {
        assert_eq!(
            v.is_string(),
            Some(false),
            "expected '{v}' not to be a string"
        );
    }

    #[rstest]
    #[case(JsValue::from(""))]
    #[case(construct_test_ternary(JsValue::from(""), JsValue::from("")))]
    fn is_empty_string_positive(#[case] v: JsValue<'static>) {
        assert_eq!(
            v.is_empty_string(),
            Some(true),
            "expected '{v}' to be an empty string"
        );
    }

    #[rstest]
    #[case(JsValue::from("hi"))]
    #[case(JsValue::from(1.0))]
    #[case(ConstantValue::True.into())]
    #[case(construct_test_ternary(JsValue::from("a"), JsValue::from("b")))]
    fn is_empty_string_negative(#[case] v: JsValue<'static>) {
        assert_eq!(
            v.is_empty_string(),
            Some(false),
            "expected '{v}' not to be an empty string"
        );
    }

    #[test]
    fn is_string_constant() {
        let arena = ThreadLocal::new();
        let value =
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &rcstr!("'hello'")).unwrap();
        assert_eq!(value.is_string(), Some(true));
    }

    #[rstest]
    #[case("1 && 'hello'")]
    #[case("'hello' || 'bye' || 2")]
    fn is_string_short_circuiting_positive(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_string(),
            Some(true),
            "expected '{}' to be a string",
            input
        );
    }

    #[rstest]
    #[case("'hello' && 2")]
    #[case("2 || 1 || 'hello' || 'bye'")]
    fn is_string_short_circuiting_negative(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_string(),
            Some(false),
            "expected '{}' not to be a string",
            input
        );
    }

    #[rstest]
    #[case("x && 2")]
    #[case("1 && x")]
    #[case("1 && 'a' && x")]
    #[case("x || 'bye'")]
    #[case("false || x")]
    fn is_string_short_circuiting_unknown(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_string(),
            None,
            "expected to be unable to determine whether '{}' is a string",
            input
        );
    }

    #[rstest]
    #[case("'' && 'string'")]
    #[case("false || ''")]
    #[case("1 && 'a' && ''")]
    fn is_empty_string_short_circuiting_positive(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_empty_string(),
            Some(true),
            "expected '{}' to be an empty string",
            input
        );
    }

    #[rstest]
    #[case("false && ''")]
    #[case("'' || 'string'")]
    #[case("'' || 0 || 'string'")]
    fn is_empty_string_short_circuiting_negative(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_empty_string(),
            Some(false),
            "expected '{}' not to be an empty string",
            input
        );
    }

    #[rstest]
    #[case("x && ''")]
    #[case("1 && x")]
    #[case("x || ''")]
    #[case("'' || x")]
    #[case("false || 0 || x")]
    fn is_empty_string_short_circuiting_unknown(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_empty_string(),
            None,
            "expected to be unable to determine whether '{}' is an empty string",
            input
        );
    }

    #[rstest]
    #[case("null && ''")]
    #[case("'' || null")]
    #[case("1 && 2 && null")]
    fn is_nullish_short_circuiting_positive(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_nullish(),
            Some(true),
            "expected '{}' to be nullish",
            input
        );
    }

    #[rstest]
    #[case("'' && null")]
    #[case("null || ''")]
    #[case("null || '' || 'a'")]
    fn is_nullish_short_circuiting_negative(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_nullish(),
            Some(false),
            "expected '{}' not to be nullish",
            input
        );
    }

    #[rstest]
    #[case("x && null")]
    #[case("1 && x")]
    #[case("x || null")]
    #[case("null || x")]
    #[case("false || x")]
    #[case("1 && x && null")]
    fn is_nullish_short_circuiting_unknown(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_nullish(),
            None,
            "expected to be unable to determine whether '{}' is nullish",
            input
        );
    }

    #[rstest]
    #[case("'' && null")]
    #[case("null || ''")]
    #[case("null || 0 || 'a'")]
    fn is_not_nullish_short_circuiting_positive(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_not_nullish(),
            Some(true),
            "expected '{}' to be not-nullish",
            input
        );
    }

    #[rstest]
    #[case("null && ''")]
    #[case("'' || null")]
    #[case("'' || 0 || null")]
    fn is_not_nullish_short_circuiting_negative(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_not_nullish(),
            Some(false),
            "expected '{}' not to be not-nullish",
            input
        );
    }

    #[rstest]
    #[case("x && null")]
    #[case("1 && x")]
    #[case("x || null")]
    #[case("null || x")]
    #[case("false || x")]
    #[case("false || x || ''")]
    fn is_not_nullish_short_circuiting_unknown(#[case] input: &str) {
        let arena = ThreadLocal::new();
        assert_eq!(
            EvalContext::eval_single_expr_lit(arena.get_or_default(), &input.into())
                .unwrap()
                .is_not_nullish(),
            None,
            "expected to be unable to determine whether '{}' is not-nullish",
            input
        );
    }
}
