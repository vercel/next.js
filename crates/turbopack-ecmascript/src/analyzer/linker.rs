use std::{
    cmp::min,
    collections::{HashMap, HashSet},
    future::Future,
    mem::{swap, take},
    sync::{Arc, Mutex},
};

use anyhow::Result;
use swc_core::ecma::ast::Id;

use super::{graph::VarGraph, JsValue};

type LinkCacheValue = (
    Option<JsValue>,
    Vec<Vec<(HashSet<Id>, Vec<(HashSet<Id>, JsValue)>)>>,
);

#[derive(Default)]
pub struct LinkCache {
    data: HashMap<Id, LinkCacheValue>,
}

const LIMIT_CACHE_COMBINATIONS: usize = 100;

impl LinkCache {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    fn store(
        &mut self,
        id: Id,
        bailing: bool,
        value: &JsValue,
        replaced_references: &(HashSet<Id>, HashSet<Id>),
    ) {
        let (replaced_circular, replaced_non_circular) = replaced_references;
        let i = replaced_circular.len();
        let (bailed_value, data) = self.data.entry(id).or_default();
        if bailing {
            *bailed_value = Some(value.clone());
        } else {
            if data.len() <= i {
                data.resize(i + 1, Vec::new());
            }
            let list = &mut data[i];
            if let Some((_, list)) = list.iter_mut().find(|(key, _)| key == replaced_circular) {
                if list.len() > LIMIT_CACHE_COMBINATIONS {
                    return;
                }
                list.push((replaced_non_circular.clone(), value.clone()));
            } else {
                if list.len() > LIMIT_CACHE_COMBINATIONS {
                    return;
                }
                list.push((
                    replaced_circular.clone(),
                    vec![(replaced_non_circular.clone(), value.clone())],
                ));
            }
        }
    }

    fn get(
        &self,
        id: &Id,
        cycle_stack: &HashSet<Id>,
    ) -> Option<(bool, JsValue, (HashSet<Id>, HashSet<Id>))> {
        if let Some((bailing, data)) = self.data.get(id) {
            if let Some(bailing) = bailing {
                return Some((true, bailing.clone(), (HashSet::new(), HashSet::new())));
            }
            for list in data[0..min(cycle_stack.len() + 1, data.len())].iter() {
                for (key, list) in list.iter() {
                    if key.iter().all(|id| cycle_stack.contains(id)) {
                        for (non_circular, value) in list.iter() {
                            if non_circular.iter().all(|id| !cycle_stack.contains(id)) {
                                return Some((
                                    false,
                                    value.clone(),
                                    (key.clone(), non_circular.clone()),
                                ));
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

// pub async fn link<'a, F, R>(
//     graph: &VarGraph,
//     mut val: JsValue,
//     visitor: &F,
//     cache: &Mutex<LinkCache>,
// ) -> Result<JsValue>
// where
//     R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
//     F: 'a + Fn(JsValue) -> R + Sync,
// {
//     val.normalize();
//     let (val, _) = link_internal(graph, val, visitor, cache, &mut
// HashSet::new()).await?;     Ok(val)
// }

pub async fn link<'a, F, R>(
    graph: &VarGraph,
    mut val: JsValue,
    visitor: &F,
    cache: &Mutex<LinkCache>,
) -> Result<JsValue>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    val.normalize();
    let mut c = take(&mut *cache.lock().unwrap());
    let val = link_internal_iterative(graph, val, visitor, &mut c).await?;
    *cache.lock().unwrap() = c;
    Ok(val)
}

const LIMIT_NODE_SIZE: usize = 1000;
const LIMIT_IN_PROGRESS_NODES: usize = 2000;
const LIMIT_LINK_STEPS: usize = 10000;

pub(crate) async fn link_internal_iterative<'a, F, R>(
    graph: &'a VarGraph,
    val: JsValue,
    mut visitor: &'a F,
    cache: &mut LinkCache,
) -> Result<JsValue>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    fn swap_extend(
        replaced_references: &mut (HashSet<Id>, HashSet<Id>),
        mut prev_replaced_references: (HashSet<Id>, HashSet<Id>),
    ) {
        if replaced_references.0.len() < prev_replaced_references.0.len() {
            swap(&mut replaced_references.0, &mut prev_replaced_references.0);
        }
        if replaced_references.1.len() < prev_replaced_references.1.len() {
            swap(&mut replaced_references.1, &mut prev_replaced_references.1);
        }
        replaced_references.0.extend(prev_replaced_references.0);
        replaced_references.1.extend(prev_replaced_references.1);
    }

    let mut queue: Vec<(bool, JsValue)> = Vec::new();
    let mut done: Vec<(JsValue, bool)> = Vec::new();
    let mut total_nodes = 0;
    let mut cycle_stack: HashSet<Id> = HashSet::new();
    let mut replaced_references: (HashSet<Id>, HashSet<Id>) = (HashSet::new(), HashSet::new());
    let mut replaced_references_stack: Vec<(HashSet<Id>, HashSet<Id>)> = Vec::new();
    let mut steps = 0;

    total_nodes += val.total_nodes();
    queue.push((true, val));

    while let Some((enter, val)) = queue.pop() {
        steps += 1;
        match (enter, val) {
            // Enter a variable
            // - replace it with value from graph
            // - process value
            // - on leave: cache value
            (true, JsValue::Variable(var)) => {
                // Replace with unknown for now
                if cycle_stack.contains(&var) {
                    replaced_references.0.insert(var.clone());
                    done.push((
                        JsValue::Unknown(
                            Some(Arc::new(JsValue::Variable(var.clone()))),
                            "circular variable reference",
                        ),
                        true,
                    ));
                } else {
                    total_nodes -= 1;
                    {
                        if let Some((bailing, value, refs)) = cache.get(&var, &cycle_stack) {
                            replaced_references.0.extend(refs.0);
                            replaced_references.1.extend(refs.1);
                            total_nodes += value.total_nodes();
                            done.push((value, true));
                            if bailing {
                                break;
                            } else {
                                continue;
                            }
                        }
                    }
                    if let Some(val) = graph.values.get(&var) {
                        cycle_stack.insert(var.clone());
                        replaced_references_stack.push(take(&mut replaced_references));
                        queue.push((false, JsValue::Variable(var)));
                        total_nodes += val.total_nodes();
                        queue.push((true, val.clone()));
                    } else {
                        replaced_references.1.insert(var.clone());
                        total_nodes += 1;
                        done.push((
                            JsValue::Unknown(
                                Some(Arc::new(JsValue::Variable(var.clone()))),
                                "no value of this variable analysed",
                            ),
                            true,
                        ));
                    };
                }
            }
            // Leave a variable
            (false, JsValue::Variable(var)) => {
                let (val, _) = done.pop().unwrap();
                cache.store(var.clone(), false, &val, &replaced_references);
                swap_extend(
                    &mut replaced_references,
                    replaced_references_stack.pop().unwrap(),
                );
                replaced_references.0.remove(&var);
                replaced_references.1.insert(var.clone());
                cycle_stack.remove(&var);
                done.push((val, true));
            }
            // Enter a value
            // - take and queue children for processing
            // - on leave: insert children again and optimize
            (true, mut val) => {
                let i = queue.len();
                queue.push((false, JsValue::default()));
                val.for_each_children_mut(&mut |child| {
                    queue.push((true, take(child)));
                    false
                });
                queue[i].1 = val;
            }
            // Leave a value
            (false, mut val) => {
                let mut modified = val.for_each_children_mut(&mut |child| {
                    let (val, modified) = done.pop().unwrap();
                    *child = val;
                    modified
                });
                total_nodes -= val.total_nodes();

                if modified {
                    if val.total_nodes() > LIMIT_NODE_SIZE {
                        done.push((JsValue::Unknown(None, "node limit reached"), true));
                        break;
                    }
                    val.normalize_shallow();
                }

                let (val, visit_modified) = val.visit_async_until_settled(&mut visitor).await?;
                if visit_modified {
                    if val.total_nodes() > LIMIT_NODE_SIZE {
                        done.push((JsValue::Unknown(None, "node limit reached"), true));
                        break;
                    }
                    modified = true;
                }

                total_nodes += val.total_nodes();
                done.push((val, modified));
                if total_nodes > LIMIT_IN_PROGRESS_NODES {
                    done.push((
                        JsValue::Unknown(None, "in progress nodes limit reached"),
                        true,
                    ));
                    break;
                }
            }
        }
        if steps > LIMIT_LINK_STEPS {
            done.push((
                JsValue::Unknown(None, "max number of linking steps reached"),
                true,
            ));
            break;
        }
    }

    let final_value = done.pop().unwrap().0;

    // When there is still something on the queue
    // we reached the node limit and want to store
    // each open variable as "reached node limit"
    while let Some((enter, val)) = queue.pop() {
        if let (false, JsValue::Variable(var)) = (enter, val) {
            cache.store(var.clone(), true, &final_value, &replaced_references);
            swap_extend(
                &mut replaced_references,
                replaced_references_stack.pop().unwrap(),
            );
            replaced_references.0.remove(&var);
            replaced_references.1.insert(var.clone());
        }
    }

    Ok(final_value)
}
