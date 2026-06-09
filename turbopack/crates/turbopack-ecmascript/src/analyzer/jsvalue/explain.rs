use std::fmt::Write;

use either::Either;

use crate::analyzer::{JsValue, ModuleValue, ObjectPart, jsvalue::pretty_join};

// Methods for explaining a value
impl JsValue<'_> {
    pub fn explain_args(
        args: &[JsValue<'_>],
        depth: usize,
        unknown_depth: usize,
    ) -> (String, String) {
        let mut hints = Vec::new();
        let args = args
            .iter()
            .map(|arg| arg.explain_internal(&mut hints, 1, depth, unknown_depth))
            .collect::<Vec<_>>();
        let explainer = pretty_join(&args, 0, ", ", ",", "");
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    pub fn explain(&self, depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let explainer = self.explain_internal(&mut hints, 0, depth, unknown_depth);
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    fn explain_internal_inner(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        if depth == 0 {
            return "...".to_string();
        }
        // let i = hints.len();

        // if explainer.len() < 100 {
        self.explain_internal(hints, indent_depth, depth - 1, unknown_depth)
        // }
        // hints.truncate(i);
        // hints.push(String::new());
        // hints[i] = format!(
        //     "- *{}* {}",
        //     i,
        //     self.explain_internal(hints, 1, depth - 1, unknown_depth)
        // );
        // format!("*{}*", i)
    }

    fn explain_internal(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        match self {
            JsValue::Constant(v) => format!("{v}"),
            JsValue::Array { items, mutable, .. } => format!(
                "{}[{}]",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &items
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Object { parts, mutable, .. } => format!(
                "{}{{{}}}",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &parts
                        .iter()
                        .map(|v| match v {
                            ObjectPart::KeyValue(key, value) => format!(
                                "{}: {}",
                                key.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                ),
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                            ObjectPart::Spread(value) => format!(
                                "...{}",
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Url(url, kind) => format!("{url} {kind}"),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => {
                let list = pretty_join(
                    &values
                        .iter()
                        .map(|v| {
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " | ",
                    "",
                    "| ",
                );
                if let Some(logical_property) = logical_property {
                    format!("({list}){{{logical_property}}}")
                } else {
                    format!("({list})")
                }
            }
            JsValue::FreeVar(name) => format!("FreeVar({name})"),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(_, index) => {
                format!("arguments[{index}]")
            }
            JsValue::Concat(_, list) => format!(
                "`{}`",
                list.iter()
                    .map(|v| v.as_str().map_or_else(
                        || format!(
                            "${{{}}}",
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        ),
                        |str| str.to_string()
                    ))
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(_, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " + ",
                    "",
                    "+ "
                )
            ),
            JsValue::Logical(_, op, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    op.joiner(),
                    "",
                    op.multi_line_joiner()
                )
            ),
            JsValue::Binary(_, a, op, b) => format!(
                "({}{}{})",
                a.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                op.joiner(),
                b.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Tenary(_, test, cons, alt) => format!(
                "({} ? {} : {})",
                test.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                cons.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                alt.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Not(_, value) => format!(
                "!({})",
                value.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
            ),
            JsValue::Iterated(_, iterable) => {
                format!(
                    "Iterated({})",
                    iterable.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::TypeOf(_, operand) => {
                format!(
                    "typeof({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Promise(_, operand) => {
                format!(
                    "Promise<{}>",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Awaited(_, operand) => {
                format!(
                    "await({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::New(_, call) => format!(
                "new {}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Call(_, call) => format!(
                "{}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::SuperCall(_, args) => {
                format!(
                    "super({})",
                    pretty_join(
                        &args
                            .iter()
                            .map(|v| v.explain_internal_inner(
                                hints,
                                indent_depth + 1,
                                depth,
                                unknown_depth
                            ))
                            .collect::<Vec<_>>(),
                        indent_depth,
                        ", ",
                        ",",
                        ""
                    )
                )
            }
            JsValue::MemberCall(_, call) => format!(
                "{}[{}]({})",
                call.obj()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                call.prop()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Member(_, obj, prop) => {
                format!(
                    "{}[{}]",
                    obj.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                    prop.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                format!(
                    "module<{}, {}>",
                    name.to_string_lossy(),
                    if let Some(annotations) = annotations {
                        Either::Left(annotations)
                    } else {
                        Either::Right("{}")
                    }
                )
            }
            JsValue::Unknown {
                original_value: inner,
                reason: explainer,
                has_side_effects,
            } => {
                let has_side_effects = *has_side_effects;
                if unknown_depth == 0 || explainer.is_empty() {
                    "???".to_string()
                } else if let Some(inner) = inner {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}\n  ⚠️  {}{}",
                        i,
                        inner.explain_internal(hints, 1, depth, unknown_depth - 1),
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                } else {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}{}",
                        i,
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                }
            }
            JsValue::WellKnownObject(obj) => {
                let (name, explainer) = obj.explain();
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name.to_string()
                }
            }
            JsValue::WellKnownFunction(func) => {
                let (name, explainer) = func.explain();
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name
                }
            }
            JsValue::Function(_, _, return_value) => {
                if depth > 0 {
                    format!(
                        "(...) => {}",
                        return_value.explain_internal(
                            hints,
                            indent_depth,
                            depth - 1,
                            unknown_depth
                        )
                    )
                } else {
                    "(...) => ...".to_string()
                }
            }
        }
    }
}
