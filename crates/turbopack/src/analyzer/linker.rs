use anyhow::Result;
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    mem::take,
    pin::Pin,
    sync::{Arc, Mutex},
};
use swc_ecmascript::utils::Id;

use super::{graph::VarGraph, JsValue};

pub struct LinkCache {
    non_nested: HashMap<Id, JsValue>,
    nested: HashMap<Id, Vec<(HashMap<Id, bool>, JsValue)>>,
}

impl LinkCache {
    pub fn new() -> Self {
        Self {
            non_nested: HashMap::new(),
            nested: HashMap::new(),
        }
    }

    fn store(&mut self, id: Id, value: JsValue, replaced_references: HashMap<Id, bool>) {
        if replaced_references.is_empty() {
            self.non_nested.insert(id, value);
        } else {
            self.nested
                .entry(id)
                .or_default()
                .push((replaced_references, value));
        }
    }

    fn get(&self, id: &Id, cycle_stack: &HashSet<Id>) -> Option<JsValue> {
        if let Some(direct) = self.non_nested.get(id) {
            return Some(direct.clone());
        }
        if let Some(nested) = self.nested.get(id) {
            for (list, value) in nested {
                if list
                    .iter()
                    .all(|(id, circular)| cycle_stack.contains(id) == *circular)
                {
                    return Some(value.clone());
                }
            }
        }
        None
    }
}

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
    let (val, _) = link_internal(graph, val, visitor, cache, &mut HashSet::new()).await?;
    Ok(val)
}

fn link_internal_boxed<'b, 'a: 'b, F, R>(
    graph: &'b VarGraph,
    val: JsValue,
    visitor: &'b F,
    cache: &'b Mutex<LinkCache>,
    cycle_stack: &'b mut HashSet<Id>,
) -> Pin<Box<dyn Future<Output = Result<(JsValue, Option<HashMap<Id, bool>>)>> + Send + 'b>>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    Box::pin(link_internal(graph, val, visitor, cache, cycle_stack))
}

pub(crate) async fn link_internal<'a, F, R>(
    graph: &'a VarGraph,
    val: JsValue,
    mut visitor: &'a F,
    cache: &Mutex<LinkCache>,
    cycle_stack: &'a mut HashSet<Id>,
) -> Result<(JsValue, Option<HashMap<Id, bool>>)>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    match val {
        JsValue::Variable(var) => {
            // Replace with unknown for now
            if cycle_stack.contains(&var) {
                Ok((
                    JsValue::Unknown(
                        Some(Arc::new(JsValue::Variable(var.clone()))),
                        "circular variable reference",
                    ),
                    Some(HashMap::from([(var, true)])),
                ))
            } else {
                {
                    if let Some(value) = cache.lock().unwrap().get(&var, &cycle_stack) {
                        return Ok((value, Some(HashMap::new())));
                    }
                }
                cycle_stack.insert(var.clone());
                let val = if let Some(val) = graph.values.get(&var) {
                    val.clone()
                } else {
                    JsValue::Unknown(
                        Some(Arc::new(JsValue::Variable(var.clone()))),
                        "no value of this variable analysed",
                    )
                };
                let mut res = link_internal_boxed(graph, val, visitor, cache, cycle_stack).await?;
                if res.1.is_none() {
                    res.1 = Some(HashMap::new());
                }
                res.1.as_mut().unwrap().insert(var.clone(), false);
                cache.lock().unwrap().store(
                    var.clone(),
                    res.0.clone(),
                    res.1.as_ref().unwrap().clone(),
                );
                cycle_stack.remove(&var);
                Ok(res)
            }
        }
        _ => {
            async fn child_visitor<'b, 'a: 'b, F, R>(
                child: JsValue,
                graph: &'b VarGraph,
                visitor: &'b F,
                cache: &'b Mutex<LinkCache>,
                cycle_stack: &'b Mutex<HashSet<Id>>,
                replaced_references: &'b Mutex<HashMap<Id, bool>>,
            ) -> Result<(JsValue, bool)>
            where
                R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
                F: 'a + Fn(JsValue) -> R + Sync,
            {
                let mut my_cycle_stack = take(&mut *cycle_stack.lock().unwrap());
                let (mut value, res) =
                    link_internal_boxed(graph, child, visitor, cache, &mut my_cycle_stack).await?;
                *cycle_stack.lock().unwrap() = my_cycle_stack;
                let modified = if let Some(res) = res {
                    value.normalize_shallow();
                    replaced_references.lock().unwrap().extend(res);
                    true
                } else {
                    false
                };
                Ok((value, modified))
            }
            let replaced_references = Mutex::new(HashMap::new());
            let cycle_stack_mutex = Mutex::new(take(cycle_stack));
            let (mut val, mut modified) = val
                .for_each_children_async(&mut |child| {
                    Box::pin(child_visitor(
                        child,
                        graph,
                        visitor,
                        cache,
                        &cycle_stack_mutex,
                        &replaced_references,
                    ))
                        as Pin<Box<dyn Future<Output = Result<(JsValue, bool)>> + Send>>
                })
                .await?;
            *cycle_stack = cycle_stack_mutex.into_inner().unwrap();

            if modified {
                val.normalize_shallow();
            }

            let mut val = val;
            let m;
            (val, m) = val.visit_async_until_settled(&mut visitor).await?;
            if m {
                modified = true;
            }

            // TODO: The result can be cached when
            // !modified || replaced_references.is_empty()
            if modified {
                Ok((val, Some(replaced_references.into_inner().unwrap())))
            } else {
                Ok((val, None))
            }
        }
    }
}
