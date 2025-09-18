use std::{collections::hash_map::Entry, fmt::Display, future::Future, mem::take};

use anyhow::Result;
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::ecma::ast::Id;

use super::{JsValue, graph::VarGraph};

// // Resolves variable references only, doesn't exhaustively evaluate everything inside of the
// value. pub async fn link_shallow<'a, B, RB, F, RF>(
//     graph: &VarGraph,
//     mut current_val: JsValue,
//     early_visitor: &B,
//     visitor: &F,
//     fun_args_values: &Mutex<FxHashMap<u32, Vec<JsValue>>>,
//     var_cache: &Mutex<FxHashMap<Id, JsValue>>,
// ) -> Result<JsValue>
// where
//     RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
//     B: 'a + Fn(JsValue) -> RB + Sync,
//     RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
//     F: 'a + Fn(JsValue) -> RF + Sync,
// {
//     current_val.normalize();

//     if let JsValue::Alternatives {
//         values,
//         logical_property,
//         ..
//     } = current_val
//     {
//         let values = values
//             .into_iter()
//             .map(|v| link_shallow(graph, v, early_visitor, visitor, fun_args_values, var_cache))
//             .try_join()
//             .await?;
//         return Ok(if let Some(logical_property) = logical_property {
//             JsValue::alternatives_with_additional_property(values, logical_property)
//         } else {
//             JsValue::alternatives(values)
//         });
//     }

//     let before = current_val.clone();

//     // Resolve variable references, don't do anything else.
//     loop {
//         match current_val {
//             JsValue::Variable(var) => {
//                 if let Some(val) = graph.values.get(&var) {
//                     current_val = val.clone();
//                     continue;
//                 } else {
//                     current_val = JsValue::unknown(
//                         JsValue::Variable(var),
//                         false,
//                         "no value of this variable analysed",
//                     );
//                 }
//             }
//             JsValue::Argument(func_ident, index) => {
//                 if let Some(args) = fun_args_values.lock().get(&func_ident) {
//                     if let Some(val) = args.get(index) {
//                         current_val = val.clone();
//                         continue;
//                     } else {
//                         current_val = JsValue::unknown_empty(
//                             false,
//                             "unknown function argument (out of bounds)",
//                         );
//                     }
//                 } else {
//                     current_val = JsValue::unknown(
//                         JsValue::Argument(func_ident, index),
//                         false,
//                         "function calls are not analysed yet",
//                     );
//                 }
//             }
//             val => {
//                 current_val = val;
//             }
//         };
//         break;
//     }

//     // async fn visit_member_recursively<'a, B, RB, F, RF>(
//     //     early_visitor: &B,
//     //     visitor: &F,
//     //     value: JsValue,
//     // ) -> Result<JsValue>
//     // where
//     //     RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
//     //     B: 'a + Fn(JsValue) -> RB + Sync,
//     //     RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
//     //     F: 'a + Fn(JsValue) -> RF + Sync,
//     // {
//     //     anyhow::Ok(if let JsValue::Member(_, obj, prop) = value {
//     //         let obj = visit_member_recursively(early_visitor, visitor, *obj).await?;
//     //         let prop
//     //         let value = JsValue::member(obj, prop);
//     //     } else {
//     //         value
//     //     })
//     // }

//     let after = current_val.clone();

//     let val = early_visitor(current_val).await?.0;
//     let val = visitor(val).await?.0;
//     println!(
//         "shallow {:?} {:?} {:?} {:?}",
//         before,
//         after,
//         val,
//         link(
//             graph,
//             before.clone(),
//             early_visitor,
//             visitor,
//             fun_args_values,
//             var_cache,
//         )
//         .await?
//         .0
//     );
//     Ok(val)
// }

pub async fn link<'a, B, RB, F, RF>(
    graph: &VarGraph,
    mut val: JsValue,
    earliest_toplevel_visitor: &impl Fn(JsValue) -> JsValue,
    early_visitor: &B,
    visitor: &F,
    fun_args_values: &Mutex<FxHashMap<u32, Vec<JsValue>>>,
    var_cache: &Mutex<FxHashMap<Id, JsValue>>,
) -> Result<(JsValue, u32)>
where
    RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    B: 'a + Fn(JsValue) -> RB + Sync,
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    // use tracing::Instrument;
    // let span = tracing::trace_span!("link", steps = tracing::field::Empty);
    val.normalize();
    let (val, steps) = async {
        link_internal_iterative(
            graph,
            val,
            earliest_toplevel_visitor,
            early_visitor,
            visitor,
            fun_args_values,
            var_cache,
        )
        .await
    }
    // .instrument(span.clone())
    .await?;
    // span.record("steps", steps);
    Ok((val, steps))
}

const LIMIT_NODE_SIZE: u32 = 100;
const LIMIT_IN_PROGRESS_NODES: u32 = 500;
const LIMIT_LINK_STEPS: u32 = 1500;

#[derive(Debug, Hash, Clone, Eq, PartialEq)]
enum Step {
    /// Take all chlidren out of the value (replacing temporarily with unknown) and queue them
    /// for processing using individual `Enter`s.
    Enter(JsValue, bool),
    /// Pop however many children there are from `done` and reinsert them into the value
    Leave(JsValue, bool),
    /// Remove the variable from `cycle_stack` which detects e.g. circular reassignments
    LeaveVar(Id),
    LeaveLate(JsValue, bool),
    /// Call the visitor callbacks, and requeue the value for further processing if it changed.
    Visit(JsValue, bool),
    EarlyVisit(JsValue, bool),
    /// Remove the call from `fun_args_values`
    LeaveCall(u32),
    /// Placeholder that is used to momentarily reserve a slot that is only filled after
    /// pushing some more steps
    TemporarySlot,
}

impl Display for Step {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Step::Enter(val, top_level) => write!(f, "Enter({val}, {top_level})"),
            Step::EarlyVisit(val, top_level) => write!(f, "EarlyVisit({val}, {top_level})"),
            Step::Leave(val, top_level) => write!(f, "Leave({val}, {top_level})"),
            Step::LeaveVar(var) => write!(f, "LeaveVar({var:?})"),
            Step::LeaveLate(val, top_level) => write!(f, "LeaveLate({val}, {top_level})"),
            Step::Visit(val, top_level) => write!(f, "Visit({val}, {top_level})"),
            Step::LeaveCall(func_ident) => write!(f, "LeaveCall({func_ident})"),
            Step::TemporarySlot => write!(f, "TemporarySlot"),
        }
    }
}
// If a variable was already visited in this linking call, don't visit it again.

pub(crate) async fn link_internal_iterative<'a, B, RB, F, RF>(
    graph: &'a VarGraph,
    val: JsValue,
    earliest_toplevel_visitor: &impl Fn(JsValue) -> JsValue,
    early_visitor: &'a B,
    visitor: &'a F,
    fun_args_values: &Mutex<FxHashMap<u32, Vec<JsValue>>>,
    var_cache: &Mutex<FxHashMap<Id, JsValue>>,
) -> Result<(JsValue, u32)>
where
    RB: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    B: 'a + Fn(JsValue) -> RB + Sync,
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    let mut work_queue_stack: Vec<Step> = Vec::new();
    let mut done: Vec<JsValue> = Vec::new();
    // Tracks the number of nodes in the queue and done combined
    let mut total_nodes = 0;
    let mut cycle_stack: FxHashSet<Id> = FxHashSet::default();
    // Tracks the number linking steps so far
    let mut steps = 0;

    total_nodes += val.total_nodes();
    work_queue_stack.push(Step::Enter(val, true));

    while let Some(step) = work_queue_stack.pop() {
        steps += 1;

        match step {
            // Enter a variable
            // - replace it with value from graph
            // - process value
            // - (Step::LeaveVar potentially caches the value)
            Step::Enter(JsValue::Variable(var), top_level) => {
                if cycle_stack.contains(&var) {
                    done.push(JsValue::unknown(
                        JsValue::Variable(var.clone()),
                        false,
                        "circular variable reference",
                    ));
                } else {
                    total_nodes -= 1;
                    let var_cache_lock = (cycle_stack.is_empty()
                        && fun_args_values.lock().is_empty())
                    .then(|| var_cache.lock());
                    if let Some(val) = var_cache_lock.as_deref().and_then(|cache| cache.get(&var)) {
                        total_nodes += val.total_nodes();
                        done.push(val.clone());
                    } else if let Some(val) = graph.values.get(&var) {
                        cycle_stack.insert(var.clone());
                        work_queue_stack.push(Step::LeaveVar(var));
                        total_nodes += val.total_nodes();
                        work_queue_stack.push(Step::Enter(val.clone(), top_level));
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown(
                            JsValue::Variable(var.clone()),
                            false,
                            "no value of this variable analysed",
                        ));
                    }
                };
            }
            // Leave a variable
            Step::LeaveVar(var) => {
                cycle_stack.remove(&var);
                if cycle_stack.is_empty() && fun_args_values.lock().is_empty() {
                    var_cache.lock().insert(var, done.last().unwrap().clone());
                }
            }
            // Enter a function argument
            // We want to replace the argument with the value from the function call
            Step::Enter(JsValue::Argument(func_ident, index), _) => {
                total_nodes -= 1;
                if let Some(args) = fun_args_values.lock().get(&func_ident) {
                    if let Some(val) = args.get(index) {
                        total_nodes += val.total_nodes();
                        done.push(val.clone());
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown_empty(
                            false,
                            "unknown function argument (out of bounds)",
                        ));
                    }
                } else {
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::Argument(func_ident, index),
                        false,
                        "function calls are not analysed yet",
                    ));
                }
            }
            // Visit a function call
            // This need special handling, since we want to replace the function call and process
            // the function return value after that.
            Step::Visit(
                JsValue::Call(_, box JsValue::Function(_, func_ident, return_value), args),
                _,
            ) => {
                total_nodes -= 2; // Call + Function
                if let Entry::Vacant(entry) = fun_args_values.lock().entry(func_ident) {
                    // Return value will stay in total_nodes
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    entry.insert(args);
                    work_queue_stack.push(Step::LeaveCall(func_ident));
                    work_queue_stack.push(Step::Enter(*return_value, false));
                } else {
                    total_nodes -= return_value.total_nodes();
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::call(Box::new(JsValue::function(func_ident, return_value)), args),
                        true,
                        "recursive function call",
                    ));
                }
            }
            // Leaving a function call evaluation
            // - remove function arguments from the map
            Step::LeaveCall(func_ident) => {
                fun_args_values.lock().remove(&func_ident);
            }
            // Enter a function
            // We don't want to process the function return value yet, this will happen after
            // function calls
            // - just put it into done
            Step::Enter(func @ JsValue::Function(..), _) => {
                done.push(func);
            }
            // Enter a value
            // - take and queue children for processing
            // - on leave: insert children again and optimize
            Step::Enter(mut val, top_level) => {
                if top_level {
                    total_nodes -= val.total_nodes();
                    val = earliest_toplevel_visitor(val);
                    total_nodes += val.total_nodes();
                }

                if !val.has_children() {
                    visit(
                        &mut total_nodes,
                        &mut done,
                        &mut work_queue_stack,
                        visitor,
                        val,
                        top_level,
                    )
                    .await?;
                } else {
                    let i = work_queue_stack.len();
                    work_queue_stack.push(Step::TemporarySlot);
                    let mut has_early_children = false;
                    val.for_each_early_children_mut(&mut |child| {
                        has_early_children = true;
                        work_queue_stack.push(Step::Enter(take(child), false));
                        false
                    });
                    if has_early_children {
                        work_queue_stack[i] = Step::EarlyVisit(val, top_level);
                    } else {
                        let child_top_level =
                            top_level && matches!(val, JsValue::Alternatives { .. });
                        val.for_each_children_mut(&mut |child| {
                            work_queue_stack.push(Step::Enter(take(child), child_top_level));
                            false
                        });
                        work_queue_stack[i] = Step::Leave(val, top_level);
                    }
                }
            }
            // Early visit a value
            // - reconstruct the value from early children
            // - visit the value
            // - insert late children and process for Leave
            Step::EarlyVisit(mut val, top_level) => {
                val.for_each_early_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();
                total_nodes -= val.total_nodes();
                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }

                let (mut val, visit_modified) = early_visitor(val).await?;
                val.debug_assert_total_nodes_up_to_date();
                if visit_modified && val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }

                let count = val.total_nodes();
                if total_nodes + count > LIMIT_IN_PROGRESS_NODES {
                    // There is always space for one more node since we just popped at least one
                    // count
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(
                        true,
                        "in progress nodes limit reached",
                    ));
                    continue;
                }
                total_nodes += count;

                if visit_modified {
                    // When the early visitor has changed the value, we need to enter it again
                    work_queue_stack.push(Step::Enter(val, top_level));
                } else {
                    // Otherwise we can just process the late children
                    let i = work_queue_stack.len();
                    work_queue_stack.push(Step::TemporarySlot);
                    let child_top_level = top_level && matches!(val, JsValue::Alternatives { .. });
                    val.for_each_late_children_mut(&mut |child| {
                        work_queue_stack.push(Step::Enter(take(child), child_top_level));
                        false
                    });
                    work_queue_stack[i] = Step::LeaveLate(val, top_level);
                }
            }
            // Leave a value
            Step::Leave(mut val, top_level) => {
                val.for_each_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();

                total_nodes -= val.total_nodes();

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                val.debug_assert_total_nodes_up_to_date();

                total_nodes += val.total_nodes();
                work_queue_stack.push(Step::Visit(val, top_level));
            }
            // Leave a value from EarlyVisit
            Step::LeaveLate(mut val, top_level) => {
                val.for_each_late_children_mut(&mut |child| {
                    let val = done.pop().unwrap();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();

                total_nodes -= val.total_nodes();

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                val.debug_assert_total_nodes_up_to_date();

                total_nodes += val.total_nodes();
                work_queue_stack.push(Step::Visit(val, top_level));
            }
            // Visit a value with the visitor
            // - visited value is put into done
            Step::Visit(val, top_level) => {
                visit(
                    &mut total_nodes,
                    &mut done,
                    &mut work_queue_stack,
                    visitor,
                    val,
                    top_level,
                )
                .await?;
            }
            Step::TemporarySlot => unreachable!(),
        }

        if steps > LIMIT_LINK_STEPS {
            // Unroll the stack and apply steps that modify "global" state.
            for step in work_queue_stack.into_iter().rev() {
                match step {
                    Step::LeaveVar(var) => {
                        cycle_stack.remove(&var);
                        if cycle_stack.is_empty() && fun_args_values.lock().is_empty() {
                            var_cache.lock().insert(
                                var,
                                JsValue::unknown_empty(true, "max number of linking steps reached"),
                            );
                        }
                    }
                    Step::LeaveCall(func_ident) => {
                        fun_args_values.lock().remove(&func_ident);
                    }
                    _ => {}
                }
            }

            tracing::trace!("link limit hit {}", steps);
            return Ok((
                JsValue::unknown_empty(true, "max number of linking steps reached"),
                steps,
            ));
        }
    }

    let final_value = done.pop().unwrap();

    debug_assert!(work_queue_stack.is_empty());
    debug_assert_eq!(total_nodes, final_value.total_nodes());

    Ok((final_value, steps))
}

async fn visit<'a, F, RF>(
    total_nodes: &mut u32,
    done: &mut Vec<JsValue>,
    work_queue_stack: &mut Vec<Step>,
    visitor: &'a F,
    val: JsValue,
    top_level: bool,
) -> Result<()>
where
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    *total_nodes -= val.total_nodes();

    let (mut val, visit_modified) = visitor(val).await?;
    if visit_modified {
        val.normalize_shallow();
        #[cfg(debug_assertions)]
        val.debug_assert_total_nodes_up_to_date();
        if val.total_nodes() > LIMIT_NODE_SIZE {
            *total_nodes += 1;
            done.push(JsValue::unknown_empty(true, "node limit reached"));
            return Ok(());
        }
    }

    let count = val.total_nodes();
    if *total_nodes + count > LIMIT_IN_PROGRESS_NODES {
        // There is always space for one more node since we just popped at least one
        // count
        *total_nodes += 1;
        done.push(JsValue::unknown_empty(
            true,
            "in progress nodes limit reached",
        ));
        return Ok(());
    }
    *total_nodes += count;
    if visit_modified {
        work_queue_stack.push(Step::Enter(val, top_level));
    } else {
        done.push(val);
    }
    Ok(())
}
