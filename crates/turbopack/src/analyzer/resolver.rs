use std::collections::HashSet;

use swc_ecmascript::ast::*;

use super::{graph::VarGraph, JsValue};

pub(crate) struct ResolveResult {
    pub value: JsValue,
    pub replaced_circular_references: HashSet<Id>,
}

pub(crate) fn resolve(
    graph: &VarGraph,
    val: JsValue,
    circle_stack: &mut HashSet<Id>,
) -> ResolveResult {
    let mut replaced_circular_references = HashSet::default();

    let val = match val {
        JsValue::Constant(_) | JsValue::FreeVar(_) | JsValue::Unknown => val,
        JsValue::Variable(var) => {
            // Replace with unknown for now
            if circle_stack.contains(&var) {
                replaced_circular_references.insert(var);
                JsValue::Unknown
            } else {
                circle_stack.insert(var.clone());
                let val = graph
                    .values
                    .get(&var)
                    .cloned()
                    .unwrap_or_else(|| panic!("should have var {:#?}", var));
                let res = resolve(graph, val, circle_stack);
                replaced_circular_references.extend(res.replaced_circular_references);

                // Skip current var as it's internal to this resolution
                replaced_circular_references.remove(&var);

                circle_stack.remove(&var);
                res.value
            }
        }

        JsValue::Alternatives(values) => JsValue::Alternatives(
            values
                .into_iter()
                .map(|val| {
                    let res = resolve(graph, val, circle_stack);
                    replaced_circular_references.extend(res.replaced_circular_references);
                    res.value
                })
                .collect(),
        ),
        JsValue::Concat(values) => JsValue::Concat(
            values
                .into_iter()
                .map(|val| {
                    let res = resolve(graph, val, circle_stack);
                    replaced_circular_references.extend(res.replaced_circular_references);
                    res.value
                })
                .collect(),
        ),

        JsValue::Add(values) => JsValue::Add(
            values
                .into_iter()
                .map(|val| {
                    let res = resolve(graph, val, circle_stack);
                    replaced_circular_references.extend(res.replaced_circular_references);
                    res.value
                })
                .collect(),
        ),
    };

    // TODO: The result can be cached when replaced_circular_references.is_empty()

    ResolveResult {
        value: val,
        replaced_circular_references,
    }
}
