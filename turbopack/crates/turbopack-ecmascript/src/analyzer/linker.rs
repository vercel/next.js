use std::{collections::hash_map::Entry, fmt::Display, future::Future, mem::take};

use anyhow::Result;
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::ecma::ast::Id;

use super::{JsValue, graph::VarGraph};
use crate::analyzer::graph::VarMeta;

pub async fn link<'a, B, RB, F, RF>(
    graph: &VarGraph,
    mut val: JsValue,
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
    val.normalize();
    let (val, steps) = link_internal_iterative(
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

#[derive(Debug, Hash, Clone, Eq, PartialEq)]
enum Step {
    /// Take all children out of the value (replacing temporarily with unknown) and queue them
    /// for processing using individual `Enter`s.
    Enter(JsValue),
    /// Pop however many children there are from `done` and reinsert them into the value
    Leave(JsValue),
    /// Remove the variable from `cycle_stack` which detects e.g. circular reassignments
    LeaveVar(Id),
    LeaveLate(JsValue),
    /// Call the visitor callbacks, and requeue the value for further processing if it changed.
    Visit(JsValue),
    EarlyVisit(JsValue),
    /// Remove the call from `fun_args_values`
    LeaveCall(u32),
    /// Placeholder that is used to momentarily reserve a slot that is only filled after
    /// pushing some more steps
    TemporarySlot,
}

impl Step {
    fn total_nodes(&self) -> u32 {
        match self {
            Step::Leave(js_value)
            | Step::EarlyVisit(js_value)
            | Step::Visit(js_value)
            | Step::LeaveLate(js_value)
            | Step::Enter(js_value) => js_value.total_nodes(),
            Step::TemporarySlot | Step::LeaveCall(_) | Step::LeaveVar(_) => 0,
        }
    }
}

impl Display for Step {
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

#[derive(Default)]
struct WorkQueue {
    /// Tracks the number of nodes in the queue and done combined
    total_nodes: u32,
    stack: Vec<Step>,
    done: Vec<JsValue>,
}

impl WorkQueue {
    fn enter(&mut self, mut val: JsValue) {
        val.debug_assert_total_nodes_up_to_date();
        self.total_nodes += val.total_nodes();
        self.stack.push(Step::Enter(val));
    }
    fn visit(&mut self, mut val: JsValue) {
        val.debug_assert_total_nodes_up_to_date();
        self.total_nodes += val.total_nodes();
        self.stack.push(Step::Visit(val));
    }

    fn leave_var(&mut self, var: Id) {
        self.stack.push(Step::LeaveVar(var));
    }

    fn leave_call(&mut self, func: u32) {
        self.stack.push(Step::LeaveCall(func));
    }

    fn reserve_slot(&mut self) -> usize {
        let i = self.stack.len();
        self.stack.push(Step::TemporarySlot);
        i
    }
    fn fill_slot(&mut self, step: Step, i: usize) {
        let Some(slot) = self.stack.get_mut(i) else {
            panic!("invalid slot");
        };
        debug_assert!(matches!(slot, Step::TemporarySlot));
        self.total_nodes += step.total_nodes();
        *slot = step;
    }

    fn next_step(&mut self) -> Option<Step> {
        let step = self.stack.pop();
        if let Some(step) = &step {
            self.total_nodes -= step.total_nodes();
        }
        step
    }

    fn done(&mut self, mut val: JsValue) {
        val.debug_assert_total_nodes_up_to_date();
        self.total_nodes += val.total_nodes();
        self.done.push(val);
    }

    /// Returns a copy of the most recently completed value, leaving it in the list
    fn last_completed_value(&self) -> JsValue {
        self.done.last().unwrap().clone()
    }

    // Returns the most recently completed value, removing it from the list
    fn pop_last_completed_value(&mut self) -> JsValue {
        let v = self.done.pop().unwrap();
        self.total_nodes -= v.total_nodes();
        v
    }

    fn in_progress_nodes(&self) -> u32 {
        self.total_nodes
    }

    fn finish(&mut self) -> JsValue {
        let prev_total_nodes = self.total_nodes;
        let final_value = self.pop_last_completed_value();
        debug_assert!(self.stack.is_empty());
        debug_assert_eq!(self.total_nodes, 0);
        debug_assert_eq!(
            prev_total_nodes,
            final_value.total_nodes(),
            "expected {} nodes in {:?}",
            prev_total_nodes,
            final_value
        );
        final_value
    }
}

pub(crate) async fn link_internal_iterative<'a, B, RB, F, RF>(
    graph: &'a VarGraph,
    val: JsValue,
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
    let mut work_queue = WorkQueue::default();
    let mut cycle_stack: FxHashSet<Id> = FxHashSet::default();
    // Tracks the number linking steps so far
    let mut steps = 0;

    work_queue.enter(val);

    while let Some(step) = work_queue.next_step() {
        steps += 1;

        match step {
            // Enter a variable
            // - replace it with value from graph
            // - process value
            // - (Step::LeaveVar potentially caches the value)
            Step::Enter(JsValue::Variable(var)) => {
                if cycle_stack.contains(&var) {
                    work_queue.done(JsValue::unknown(
                        JsValue::Variable(var.clone()),
                        false,
                        "circular variable reference",
                    ));
                } else {
                    let var_cache_lock = (cycle_stack.is_empty()
                        && fun_args_values.lock().is_empty())
                    .then(|| var_cache.lock());
                    if let Some(val) = var_cache_lock.as_deref().and_then(|cache| cache.get(&var)) {
                        work_queue.done(val.clone());
                    } else if let Some(VarMeta { value, .. }) = graph.values.get(&var) {
                        cycle_stack.insert(var.clone());
                        work_queue.leave_var(var);
                        work_queue.enter(value.clone());
                    } else {
                        work_queue.done(JsValue::unknown(
                            JsValue::Variable(var.clone()),
                            false,
                            "no value of this variable analyzed",
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
                        // TODO: avoid the clone here?
                        .insert(var, work_queue.last_completed_value());
                }
            }
            // Enter a function argument
            // We want to replace the argument with the value from the function call
            Step::Enter(JsValue::Argument(func_ident, index)) => {
                work_queue.done(
                    if let Some(args) = fun_args_values.lock().get(&func_ident) {
                        if let Some(val) = args.get(index) {
                            val.clone()
                        } else {
                            JsValue::unknown_empty(
                                false,
                                "unknown function argument (out of bounds)",
                            )
                        }
                    } else {
                        JsValue::unknown(
                            JsValue::Argument(func_ident, index),
                            false,
                            "function calls are not analyzed yet",
                        )
                    },
                );
            }
            // Visit a function call
            // This need special handling, since we want to replace the function call and process
            // the function return value after that.
            Step::Visit(JsValue::Call(
                _,
                box JsValue::Function(function_nodes, func_ident, return_value),
                args,
            )) => {
                if let Entry::Vacant(entry) = fun_args_values.lock().entry(func_ident) {
                    entry.insert(args);
                    work_queue.leave_call(func_ident);
                    work_queue.enter(*return_value);
                } else {
                    work_queue.done(JsValue::unknown(
                        JsValue::call(
                            Box::new(JsValue::Function(function_nodes, func_ident, return_value)),
                            args,
                        ),
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
            Step::Enter(func @ JsValue::Function(..)) => {
                work_queue.done(func);
            }
            Step::Enter(JsValue::Effectful(_, box inner)) => {
                work_queue.enter(inner);
            }
            // Enter a value
            // - take and queue children for processing
            // - on leave: insert children again and optimize
            Step::Enter(mut val) => {
                if !val.has_children() {
                    visit(&mut work_queue, visitor, val).await?;
                } else {
                    let i = work_queue.reserve_slot();
                    let mut has_early_children = false;
                    val.for_each_early_children_mut(&mut |child| {
                        has_early_children = true;
                        work_queue.enter(take(child));
                        false
                    });
                    if has_early_children {
                        work_queue.fill_slot(Step::EarlyVisit(val), i);
                    } else {
                        val.for_each_children_mut(&mut |child| {
                            work_queue.enter(take(child));
                            false
                        });
                        work_queue.fill_slot(Step::Leave(val), i);
                    }
                }
            }
            // Early visit a value
            // - reconstruct the value from early children
            // - visit the value
            // - insert late children and process for Leave
            Step::EarlyVisit(mut val) => {
                val.for_each_early_children_mut(&mut |child| {
                    let val = work_queue.pop_last_completed_value();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();
                if val.total_nodes() > LIMIT_NODE_SIZE {
                    work_queue.done(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }

                let (mut val, visit_modified) = early_visitor(val).await?;
                val.debug_assert_total_nodes_up_to_date();
                if visit_modified && val.total_nodes() > LIMIT_NODE_SIZE {
                    work_queue.done(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }

                let count = val.total_nodes();
                if work_queue.in_progress_nodes() + count > LIMIT_IN_PROGRESS_NODES {
                    // There is always space for one more node since we just popped at least one
                    // count
                    work_queue.done(JsValue::unknown_empty(
                        true,
                        "in progress nodes limit reached",
                    ));
                    continue;
                }

                if visit_modified {
                    // When the early visitor has changed the value, we need to enter it again
                    work_queue.enter(val);
                } else {
                    // Otherwise we can just process the late children
                    let i = work_queue.reserve_slot();
                    val.for_each_late_children_mut(&mut |child| {
                        work_queue.enter(take(child));
                        false
                    });
                    work_queue.fill_slot(Step::LeaveLate(val), i);
                }
            }
            // Leave a value
            Step::Leave(mut val) => {
                val.for_each_children_mut(&mut |child| {
                    let val = work_queue.pop_last_completed_value();
                    *child = val;
                    true
                });
                val.debug_assert_total_nodes_up_to_date();

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    work_queue.done(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                work_queue.visit(val);
            }
            // Leave a value from EarlyVisit
            Step::LeaveLate(mut val) => {
                val.for_each_late_children_mut(&mut |child| {
                    let val = work_queue.pop_last_completed_value();
                    *child = val;
                    true
                });

                if val.total_nodes() > LIMIT_NODE_SIZE {
                    work_queue.done(JsValue::unknown_empty(true, "node limit reached"));
                    continue;
                }
                val.normalize_shallow();

                work_queue.visit(val);
            }
            // Visit a value with the visitor
            // - visited value is put into done
            Step::Visit(val) => {
                visit(&mut work_queue, visitor, val).await?;
            }
            Step::TemporarySlot => unreachable!(),
        }

        if steps > LIMIT_LINK_STEPS {
            // Unroll the stack and apply steps that modify "global" state.
            while let Some(step) = work_queue.next_step() {
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

    let final_value = work_queue.finish();

    Ok((final_value, steps))
}

async fn visit<'a, F, RF>(work_queue: &mut WorkQueue, visitor: &'a F, val: JsValue) -> Result<()>
where
    RF: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> RF + Sync,
{
    let (mut val, visit_modified) = visitor(val).await?;
    if visit_modified {
        val.normalize_shallow();
        #[cfg(debug_assertions)]
        val.debug_assert_total_nodes_up_to_date();
        if val.total_nodes() > LIMIT_NODE_SIZE {
            work_queue.done(JsValue::unknown_empty(true, "node limit reached"));
            return Ok(());
        }
    }

    let count = val.total_nodes();
    if work_queue.in_progress_nodes() + count > LIMIT_IN_PROGRESS_NODES {
        // There is always space for one more node since we just popped at least one
        // count
        work_queue.done(JsValue::unknown_empty(
            true,
            "in progress nodes limit reached",
        ));
        return Ok(());
    }
    if visit_modified {
        work_queue.enter(val);
    } else {
        work_queue.done(val);
    }
    Ok(())
}
