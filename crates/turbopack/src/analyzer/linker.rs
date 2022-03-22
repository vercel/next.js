use std::collections::HashSet;

use swc_atoms::JsWord;
use swc_ecmascript::ast::*;

use super::{graph::VarGraph, FreeVarKind, JsValue};

pub(crate) struct LinkResult {
    pub value: JsValue,
    pub replaced_circular_references: HashSet<Id>,
}

/// TODO(kdy1): Use this
pub trait Values {
    /// Get the value of `__dirname`
    fn dirname(&self) -> Option<JsWord>;
}

pub(crate) fn into_requests(
    graph: &VarGraph,
    val: JsValue,
    circle_stack: &mut HashSet<Id>,
) -> LinkResult {
    let mut replaced_circular_references = HashSet::default();

    macro_rules! handle {
        ($e:expr) => {{
            let res = into_requests(graph, $e, circle_stack);
            replaced_circular_references.extend(res.replaced_circular_references);
            res.value
        }};
    }

    let val = (|| {
        match val {
            JsValue::Constant(_) | JsValue::FreeVar(_) | JsValue::Module(..) | JsValue::Unknown => {
                val
            }
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
                    let res = into_requests(graph, val, circle_stack);
                    replaced_circular_references.extend(res.replaced_circular_references);

                    // Skip current var as it's internal to this resolution
                    replaced_circular_references.remove(&var);

                    circle_stack.remove(&var);
                    res.value
                }
            }

            JsValue::Alternatives(values) => {
                JsValue::Alternatives(values.into_iter().map(|val| handle!(val)).collect())
            }
            JsValue::Concat(values) => {
                JsValue::Concat(values.into_iter().map(|val| handle!(val)).collect())
            }

            JsValue::Add(values) => {
                JsValue::Add(values.into_iter().map(|val| handle!(val)).collect())
            }

            // `require` returns an object
            JsValue::Call(box JsValue::FreeVar(FreeVarKind::Require), args) if args.len() == 1 => {
                match &args[0] {
                    JsValue::Constant(Lit::Str(s)) => JsValue::Module(s.value.clone()),
                    _ => JsValue::Unknown,
                }
            }

            JsValue::Call(f, args) => {
                let f = handle!(*f);

                match &f {
                    JsValue::Member(box JsValue::Module(module), prop) => {
                        // path.join
                        if &**module == "path" && &**prop == "join" {
                            // Currently we only support constants.
                            if args.iter().any(|arg| !matches!(arg, JsValue::Constant(..))) {
                                return JsValue::Unknown;
                            }

                            let mut str_args = vec![];

                            for arg in &args {
                                match arg {
                                    JsValue::Constant(v) => match v {
                                        Lit::Str(v) => {
                                            str_args.push(&*v.value);
                                        }
                                        _ => {
                                            todo!()
                                        }
                                    },
                                    _ => {}
                                }
                            }

                            let joined = str_args.join("/");

                            let mut res: Vec<&str> = vec![];

                            for comp in joined.split("/") {
                                match comp {
                                    "." => {}
                                    ".." => {
                                        if let Some(last) = res.last() {
                                            if &**last != ".." {
                                                res.pop();
                                                continue;
                                            }
                                        }

                                        // leftmost `..`
                                        res.push("..");
                                    }
                                    _ => {
                                        res.push(comp);
                                    }
                                }
                            }

                            return res.join("/").into();
                        }
                    }
                    _ => {}
                }

                todo!("resolve(call: {:?}, {:?})", f, args)
            }

            JsValue::Member(obj, prop) => {
                let obj = box handle!(*obj);

                match (*obj, &*prop) {
                    (JsValue::FreeVar(FreeVarKind::Require), "resolve") => {
                        JsValue::FreeVar(FreeVarKind::RequireResolve)
                    }
                    (obj, _) => JsValue::Member(box obj, prop),
                }
            }
        }
    })();

    // TODO: The result can be cached when replaced_circular_references.is_empty()

    LinkResult {
        value: val,
        replaced_circular_references,
    }
}
