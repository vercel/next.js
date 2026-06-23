use std::{collections::hash_map::Entry, fmt::Display, future::Future, mem::take};

use anyhow::Result;
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::ecma::ast::Id;
use turbo_rcstr::rcstr;

use super::{Bump, JsValue, ThreadLocal, graph::VarGraph};
use crate::analyzer::BumpVec;

pub async fn link<'a, 'l, B, RB, F, RF>(
    arena: &'a ThreadLocal<Bump>,
    graph: &'l VarGraph<'a>,
    mut val: JsValue<'a>,
    early_visitor: &'l B,
    visitor: &'l F,
    fun_args_values: &Mutex<FxHashMap<u32, BumpVec<'a, JsValue<'a>>>>,
    var_cache: &Mutex<FxHashMap<Id, JsValue<'a>>>,
) -> Result<(JsValue<'a>, u32)>
where
    RB: 'l + Future<Output = Result<(JsValue<'a>, bool)>> + Send,
    B: 'l + Fn(JsValue<'a>) -> RB + Sync,
    RF: 'l + Future<Output = Result<(JsValue<'a>, bool)>> + Send,
    F: 'l + Fn(JsValue<'a>) -> RF + Sync,
{
    val.normalize(arena.get_or_default());
    let (val, steps) = link_internal_iterative(
        arena,
        graph,
        val,
        early_visitor,
        visitor,
        fun_args_values,
        var_cache,
    )
    .await?;
    Ok((val, steps))
}

const LIMIT_NODE_SIZE: u32 = 100;
const LIMIT_IN_PROGRESS_NODES: u32 = 500;
const LIMIT_LINK_STEPS: u32 = 1500;

#[derive(Debug, PartialEq)]
enum Step<'a> {
    /// Take all children out of the value (replacing temporarily with unknown) and queue them
    /// for processing using individual `Enter`s.
    Enter(JsValue<'a>),
    /// Pop however many children there are from `done` and reinsert them into the value
    Leave(JsValue<'a>),
    /// Remove the variable from `cycle_stack` which detects e.g. circular reassignments
    LeaveVar(Id),
    LeaveLate(JsValue<'a>),
    /// Call the visitor callbacks, and requeue the value for further processing if it changed.
    Visit(JsValue<'a>),
    EarlyVisit(JsValue<'a>),
    /// Remove the call from `fun_args_values`
    LeaveCall(u32),
    /// Placeholder that is used to momentarily reserve a slot that is only filled after
    /// pushing some more steps
    TemporarySlot,
}

impl Display for Step<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Step::Enter(val) => write!(f, "Enter({val})"),
            Step::EarlyVisit(val) => write!(f, "EarlyVisit({val})"),
            Step::Leave(val) => write!(f, "Leave({val})"),
            Step::LeaveVar(var) => write!(f, "LeaveVar({var:?})"),
            Step::LeaveLate(val) => write!(f, "LeaveLate({val})"),
            Step::Visit(val) => write!(f, "Visit({val})"),
            Step::LeaveCall(func_ident) => write!(f, "LeaveCall({func_ident})"),
            Step::TemporarySlot => write!(f, "TemporarySlot"),
        }
    }
}
// If a variable was already visited in this linking call, don't visit it again.

pub(crate) async fn link_internal_iterative<'a, 'l, B, RB, F, RF>(
    arena: &'a ThreadLocal<Bump>,
    graph: &'l VarGraph<'a>,
    val: JsValue<'a>,
    early_visitor: &'l B,
    visitor: &'l F,
    fun_args_values: &Mutex<FxHashMap<u32, BumpVec<'a, JsValue<'a>>>>,
    var_cache: &Mutex<FxHashMap<Id, JsValue<'a>>>,
) -> Result<(JsValue<'a>, u32)>
where
    RB: 'l + Future<Output = Result<(JsValue<'a>, bool)>> + Send,
    B: 'l + Fn(JsValue<'a>) -> RB + Sync,
    RF: 'l + Future<Output = Result<(JsValue<'a>, bool)>> + Send,
    F: 'l + Fn(JsValue<'a>) -> RF + Sync,
{
    let mut work_queue_stack: Vec<Step<'a>> = Vec::new();
    let mut done: Vec<JsValue<'a>> = Vec::new();
    // Tracks the number of nodes in the queue and done combined
    let mut total_nodes = 0;
    let mut cycle_stack: FxHashSet<Id> = FxHashSet::default();
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
            // - (Step::LeaveVar potentially caches the value)
            Step::Enter(JsValue::Variable(var)) => {
                if cycle_stack.contains(&var) {
                    done.push(JsValue::unknown(
                        JsValue::Variable(var.clone()),
                        false,
                        rcstr!("circular variable reference"),
                    ));
                } else {
                    total_nodes -= 1;
                    let var_cache_lock = (cycle_stack.is_empty()
                        && fun_args_values.lock().is_empty())
                    .then(|| var_cache.lock());
                    if let Some(val) = var_cache_lock.as_deref().and_then(|cache| cache.get(&var)) {
                        total_nodes += val.total_nodes();
                        done.push(val.clone_in(arena.get_or_default()));
                    } else if let Some(value) = graph.values.get(&var) {
                        cycle_stack.insert(var.clone());
                        work_queue_stack.push(Step::LeaveVar(var));
                        total_nodes += value.total_nodes();
                        work_queue_stack.push(Step::Enter(value.clone_in(arena.get_or_default())));
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown(
                            JsValue::Variable(var.clone()),
                            false,
                            rcstr!("no value of this variable analyzed"),
                        ));
                    }
                };
            }
            // Leave a variable
            Step::LeaveVar(var) => {
                cycle_stack.remove(&var);
                if cycle_stack.is_empty() && fun_args_values.lock().is_empty() {
                    var_cache
                        .lock()
                        .insert(var, done.last().unwrap().clone_in(arena.get_or_default()));
                }
            }
            // Enter a function argument
            // We want to replace the argument with the value from the function call
            Step::Enter(JsValue::Argument(func_ident, index)) => {
                total_nodes -= 1;
                if let Some(args) = fun_args_values.lock().get(&func_ident) {
                    if let Some(val) = args.get(index) {
                        total_nodes += val.total_nodes();
                        done.push(val.clone_in(arena.get_or_default()));
                    } else {
                        total_nodes += 1;
                        done.push(JsValue::unknown_empty(
                            false,
                            rcstr!("unknown function argument (out of bounds)"),
                        ));
                    }
                } else {
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::Argument(func_ident, index),
                        false,
                        rcstr!("function calls are not analyzed yet"),
                    ));
                }
            }
            // Visit a function call
            // This need special handling, since we want to replace the function call and process
            // the function return value after that.
            Step::Visit(JsValue::Call(_, call))
                if matches!(call.callee(), JsValue::Function(..)) =>
            {
                let (callee, args) = call.into_parts();
                let JsValue::Function(function_nodes, func_ident, mut return_value) = callee else {
                    unreachable!()
                };
                total_nodes -= 2; // Call + Function
                if let Entry::Vacant(entry) = fun_args_values.lock().entry(func_ident) {
                    // Return value will stay in total_nodes
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    entry.insert(args);
                    work_queue_stack.push(Step::LeaveCall(func_ident));
                    work_queue_stack.push(Step::Enter(take(&mut *return_value)));
                } else {
                    total_nodes -= return_value.total_nodes();
                    for arg in args.iter() {
                        total_nodes -= arg.total_nodes();
                    }
                    total_nodes += 1;
                    done.push(JsValue::unknown(
                        JsValue::call_from_parts(
                            arena.get_or_default(),
                            JsValue::Function(function_nodes, func_ident, return_value),
                            args,
                        ),
                        true,
                        rcstr!("recursive function call"),
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
            Step::Enter(func @ JsValue::Function(..)) => {
                done.push(func);
            }
            // Enter a value
            // - take and queue children for processing
            // - on leave: insert children again and optimize
            Step::Enter(mut val) => {
                if !val.has_children() {
                    visit(
                        arena,
                        &mut total_nodes,
                        &mut done,
                        &mut work_queue_stack,
                        visitor,
                        val,
                    )
                    .await?;
                } else {
                    let i = work_queue_stack.len();
                    work_queue_stack.push(Step::TemporarySlot);
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
                    done.push(JsValue::unknown_empty(true, rcstr!("node limit reached")));
                    continue;
                }

                let (mut val, visit_modified) = early_visitor(val).await?;
                val.debug_assert_total_nodes_up_to_date();
                if visit_modified && val.total_nodes() > LIMIT_NODE_SIZE {
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(true, rcstr!("node limit reached")));
                    continue;
                }

                let count = val.total_nodes();
                if total_nodes + count > LIMIT_IN_PROGRESS_NODES {
                    // There is always space for one more node since we just popped at least one
                    // count
                    total_nodes += 1;
                    done.push(JsValue::unknown_empty(
                        true,
                        rcstr!("in progress nodes limit reached"),
                    ));
                    continue;
                }
                total_nodes += count;

                if visit_modified {
                    // When the early visitor has changed the value, we need to enter it again
                    work_queue_stack.push(Step::Enter(val));
                } else {
                    // Otherwise we can just process the late children
                    let i = work_queue_stack.len();
                    work_queue_stack.push(Step::TemporarySlot);
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
                    done.push(JsValue::unknown_empty(true, rcstr!("node limit reached")));
                    continue;
                }
                val.normalize_shallow(arena.get_or_default());

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
                    done.push(JsValue::unknown_empty(true, rcstr!("node limit reached")));
                    continue;
                }
                val.normalize_shallow(arena.get_or_default());

                val.debug_assert_total_nodes_up_to_date();

                total_nodes += val.total_nodes();
                work_queue_stack.push(Step::Visit(val));
            }
            // Visit a value with the visitor
            // - visited value is put into done
            Step::Visit(val) => {
                visit(
                    arena,
                    &mut total_nodes,
                    &mut done,
                    &mut work_queue_stack,
                    visitor,
                    val,
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
                                JsValue::unknown_empty(
                                    true,
                                    rcstr!("max number of linking steps reached"),
                                ),
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
                JsValue::unknown_empty(true, rcstr!("max number of linking steps reached")),
                steps,
            ));
        }
    }

    let final_value = done.pop().unwrap();

    debug_assert!(work_queue_stack.is_empty());
    debug_assert_eq!(total_nodes, final_value.total_nodes());

    Ok((final_value, steps))
}

async fn visit<'a, 'l, F, RF>(
    arena: &'a ThreadLocal<Bump>,
    total_nodes: &mut u32,
    done: &mut Vec<JsValue<'a>>,
    work_queue_stack: &mut Vec<Step<'a>>,
    visitor: &'l F,
    val: JsValue<'a>,
) -> Result<()>
where
    RF: 'l + Future<Output = Result<(JsValue<'a>, bool)>> + Send,
    F: 'l + Fn(JsValue<'a>) -> RF + Sync,
{
    *total_nodes -= val.total_nodes();

    let (mut val, visit_modified) = visitor(val).await?;
    if visit_modified {
        val.normalize_shallow(arena.get_or_default());
        #[cfg(debug_assertions)]
        val.debug_assert_total_nodes_up_to_date();
        if val.total_nodes() > LIMIT_NODE_SIZE {
            *total_nodes += 1;
            done.push(JsValue::unknown_empty(true, rcstr!("node limit reached")));
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
            rcstr!("in progress nodes limit reached"),
        ));
        return Ok(());
    }
    *total_nodes += count;
    if visit_modified {
        work_queue_stack.push(Step::Enter(val));
    } else {
        done.push(val);
    }
    Ok(())
}
