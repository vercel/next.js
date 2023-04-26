use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
    future::Future,
    mem::take,
};

use anyhow::Result;
use swc_core::ecma::ast::Id;

use super::{graph::VarGraph, JsValue};

pub async fn link<'a, B, RB, F, RF>(
    graph: &VarGraph,
    mut val: JsValue,
    early_visitor: &B,
    visitor: &F,
    fun_args_values: HashMap<u32, Vec<JsValue>>,
) -> Result<JsValue>
where
    RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    B: 'a + Fn(JsValue) -> RB + Sync,
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    val.normalize();
    let val = link_internal_iterative(graph, val, early_visitor, visitor, fun_args_values).await?;
    Ok(val)
}

const LIMIT_NODE_SIZE: usize = 300;
const LIMIT_IN_PROGRESS_NODES: usize = 1000;
const LIMIT_LINK_STEPS: usize = 1500;

pub(crate) async fn link_internal_iterative<'a, B, RB, F, RF>(
    graph: &'a VarGraph,
    val: JsValue,
    early_visitor: &'a B,
    visitor: &'a F,
    mut fun_args_values: HashMap<u32, Vec<JsValue>>,
) -> Result<JsValue>
where
    RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    B: 'a + Fn(JsValue) -> RB + Sync,
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    #[derive(Debug)]
    enum Step {
        Enter(JsValue),
        EarlyVisit(JsValue),
        Leave(JsValue),
        LeaveVar(Id),
        LeaveLate(JsValue),
        Visit(JsValue),
        LeaveCall(u32),
    }

    let mut work_queue_stack: Vec<Step> = Vec::new();
    let mut done: Vec<JsValue> = Vec::new();
    // Tracks the number of nodes in the queue and done combined
    let mut total_nodes = 0;
    let mut cycle_stack: HashSet<Id> = HashSet::new();
    // Tracks the number linking steps so far
    let mut steps = 0;

    total_nodes += val.total_nodes();
    work_queue_stack.push(Step::Enter(val));

    while let Some(step) = work_queue_stack.pop() {
        steps += 1;

        match step {
            // Enter a variable
            // - replace it with value from graph
            // - process value
            // - on leave: cache value
            Step::Enter(JsValue::Variable(var)) => {
                // Replace with unknown for now
                if cycle_stack.contains(&var) {
                    done.push(JsValue::unknown(
                        JsValue::Variable(var.clone()),
                        "circular variable reference",
                    ));
                } else {
                    total_nodes -= 1;
                    if let Some(val) = graph.values.get(&var) {
                        cycle_stack.insert(var.clone());
                        work_queue_stack.push(Step::LeaveVar(var));
                        total_nodes += val.total_nodes();
                        work_queue_stack.push(Step::Enter(val.clone()));
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown(
                            JsValue::Variable(var.clone()),
                            "no value of this variable analysed",
                        ));
                    };
                }
            }
            // Leave a variable
            Step::LeaveVar(var) => {
                cycle_stack.remove(&var);
            }
            // Enter a function argument
            // We want to replace the argument with the value from the function call
            Step::Enter(JsValue::Argument(func_ident, index)) => {
                total_nodes -= 1;
                if let Some(args) = fun_args_values.get(&func_ident) {
                    if let Some(val) = args.get(index) {
                        total_nodes += val.total_nodes();
                        done.push(val.clone());
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown_empty(
                            "unknown function argument (out of bounds)",
                        ));
                    }
                } else {
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::Argument(func_ident, index),
                        "function calls are not analysed yet",
                    ));
                }
            }
            // Visit a function call
            // This need special handling, since we want to replace the function call and process
            // the function return value after that.
            Step::Visit(JsValue::Call(
                _,
                box JsValue::Function(_, func_ident, return_value),
                args,
            )) => {
                total_nodes -= 2; // Call + Function
                if let Entry::Vacant(entry) = fun_args_values.entry(func_ident) {
                    // Return value will stay in total_nodes
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    entry.insert(args);
                    work_queue_stack.push(Step::LeaveCall(func_ident));
                    work_queue_stack.push(Step::Enter(*return_value));
                } else {
                    total_nodes -= return_value.total_nodes();
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::call(Box::new(JsValue::function(func_ident, return_value)), args),
                        "recursive function call",
                    ));
                }
            }
            // Leaving a function call evaluation
            // - remove function arguments from the map
            Step::LeaveCall(func_ident) => {
                fun_args_values.remove(&func_ident);
            }
            // Enter a function
            // We don't want to process the function return value yet, this will happen after
            // function calls
            // - just put it into done
            Step::Enter(func @ JsValue::Function(..)) => {
                done.push(func);
            }
            // Enter a value
            // - take and queue children for processing
            // - on leave: insert children again and optimize
            Step::Enter(mut val) => {
                let i = work_queue_stack.len();
                work_queue_stack.push(Step::Leave(JsValue::default()));
                let mut has_early_children = false;
                val.for_each_early_children_mut(&mut |child| {
                    has_early_children = true;
                    work_queue_stack.push(Step::Enter(take(child)));
                    false
                });
                if has_early_children {
                    work_queue_stack[i] = Step::EarlyVisit(val);
                } else {
                    val.for_each_children_mut(&mut |child| {
                        work_queue_stack.push(Step::Enter(take(child)));
                        false
                    });
                    work_queue_stack[i] = Step::Leave(val);
                }
            }
            // Early visit a value
            // - reconstruct the value from early children
            // - visit the value
            // - insert late children and process for Leave
            Step::EarlyVisit(mut val) => {
                val.for_each_early_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();
                total_nodes -= val.total_nodes();
                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("node limit reached"));
                    continue;
                }

                let (mut val, visit_modified) = early_visitor(val).await?;
                val.debug_assert_total_nodes_up_to_date();
                if visit_modified && val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("node limit reached"));
                    continue;
                }

                let count = val.total_nodes();
                if total_nodes + count > LIMIT_IN_PROGRESS_NODES {
                    // There is always space for one more node since we just popped at least one
                    // count
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("in progress nodes limit reached"));
                    continue;
                }
                total_nodes += count;

                if visit_modified {
                    // When the early visitor has changed the value, we need to enter it again
                    work_queue_stack.push(Step::Enter(val));
                } else {
                    // Otherwise we can just process the late children
                    let i = work_queue_stack.len();
                    work_queue_stack.push(Step::LeaveLate(JsValue::default()));
                    val.for_each_late_children_mut(&mut |child| {
                        work_queue_stack.push(Step::Enter(take(child)));
                        false
                    });
                    work_queue_stack[i] = Step::LeaveLate(val);
                }
            }
            // Leave a value
            Step::Leave(mut val) => {
                val.for_each_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();

                total_nodes -= val.total_nodes();

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                val.debug_assert_total_nodes_up_to_date();

                total_nodes += val.total_nodes();
                work_queue_stack.push(Step::Visit(val));
            }
            // Leave a value from EarlyVisit
            Step::LeaveLate(mut val) => {
                val.for_each_late_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();

                total_nodes -= val.total_nodes();

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                val.debug_assert_total_nodes_up_to_date();

                total_nodes += val.total_nodes();
                work_queue_stack.push(Step::Visit(val));
            }
            // Visit a value with the visitor
            // - visited value is put into done
            Step::Visit(val) => {
                total_nodes -= val.total_nodes();

                let (mut val, visit_modified) = visitor(val).await?;
                if visit_modified {
                    val.normalize_shallow();
                    #[cfg(debug_assertions)]
                    val.debug_assert_total_nodes_up_to_date();
                    if val.total_nodes() > LIMIT_NODE_SIZE {
                        total_nodes += 1;
                        done.push(JsValue::unknown_empty("node limit reached"));
                        continue;
                    }
                }

                let count = val.total_nodes();
                if total_nodes + count > LIMIT_IN_PROGRESS_NODES {
                    // There is always space for one more node since we just popped at least one
                    // count
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty("in progress nodes limit reached"));
                    continue;
                }
                total_nodes += count;
                if visit_modified {
                    work_queue_stack.push(Step::Enter(val));
                } else {
                    done.push(val);
                }
            }
        }
        if steps > LIMIT_LINK_STEPS {
            return Ok(JsValue::unknown_empty(
                "max number of linking steps reached",
            ));
        }
    }

    let final_value = done.pop().unwrap();

    debug_assert!(work_queue_stack.is_empty());
    debug_assert_eq!(total_nodes, final_value.total_nodes());

    Ok(final_value)
}
