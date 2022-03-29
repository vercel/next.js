use anyhow::Result;
use std::{collections::HashSet, future::Future, mem::take, pin::Pin, sync::Mutex};
use swc_ecmascript::utils::Id;

use super::{graph::VarGraph, JsValue};

pub struct LinkCache {
    // TODO
}

impl LinkCache {
    pub fn new() -> Self {
        Self {}
    }
}

pub(crate) async fn link<'a, F, R>(
    graph: &VarGraph,
    mut val: JsValue,
    visitor: &F,
    _cache: &Mutex<LinkCache>,
) -> Result<JsValue>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    val.normalize();
    let (val, _) = link_internal(graph, val, visitor, &mut HashSet::new()).await?;
    Ok(val)
}

fn link_internal_boxed<'b, 'a: 'b, F, R>(
    graph: &'b VarGraph,
    val: JsValue,
    visitor: &'b F,
    circle_stack: &'b mut HashSet<Id>,
) -> Pin<Box<dyn Future<Output = Result<(JsValue, Option<HashSet<Id>>)>> + Send + 'b>>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    Box::pin(link_internal(graph, val, visitor, circle_stack))
}

pub(crate) async fn link_internal<'a, F, R>(
    graph: &'a VarGraph,
    val: JsValue,
    visitor: &'a F,
    circle_stack: &'a mut HashSet<Id>,
) -> Result<(JsValue, Option<HashSet<Id>>)>
where
    R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
    F: 'a + Fn(JsValue) -> R + Sync,
{
    match val {
        JsValue::Variable(var) => {
            // Replace with unknown for now
            if circle_stack.contains(&var) {
                Ok((
                    JsValue::Unknown(
                        Some(box JsValue::Variable(var.clone())),
                        "circular variable reference",
                    ),
                    Some(HashSet::from([var])),
                ))
            } else {
                circle_stack.insert(var.clone());
                let val = if let Some(val) = graph.values.get(&var) {
                    val.clone()
                } else {
                    JsValue::Unknown(
                        Some(box JsValue::Variable(var.clone())),
                        "no value of this variable analysed",
                    )
                };
                let mut res = link_internal_boxed(graph, val, visitor, circle_stack).await?;
                if let Some(replaced_circular_references) = res.1.as_mut() {
                    // Skip current var as it's internal to this resolution
                    replaced_circular_references.remove(&var);
                };
                circle_stack.remove(&var);
                // TODO: The result can be cached when
                // res == None || replaced_circular_references.is_empty()
                Ok(res)
            }
        }
        _ => {
            async fn child_visitor<'b, 'a: 'b, F, R>(
                child: JsValue,
                graph: &'b VarGraph,
                visitor: &'b F,
                circle_stack: &'b Mutex<HashSet<Id>>,
                replaced_circular_references: &'b Mutex<HashSet<Id>>,
            ) -> Result<(JsValue, bool)>
            where
                R: 'a + Future<Output = Result<(JsValue, bool)>> + Send,
                F: 'a + Fn(JsValue) -> R + Sync,
            {
                let mut my_circle_stack = take(&mut *circle_stack.lock().unwrap());
                let (mut value, res) =
                    link_internal_boxed(graph, child, visitor, &mut my_circle_stack).await?;
                *circle_stack.lock().unwrap() = my_circle_stack;
                let modified = if let Some(res) = res {
                    value.normalize_shallow();
                    replaced_circular_references.lock().unwrap().extend(res);
                    true
                } else {
                    false
                };
                Ok((value, modified))
            }
            let replaced_circular_references = Mutex::new(HashSet::default());
            let circle_stack_mutex = Mutex::new(take(circle_stack));
            let (val, mut modified) = val
                .for_each_children_async(&mut |child| {
                    Box::pin(child_visitor(
                        child,
                        graph,
                        visitor,
                        &circle_stack_mutex,
                        &replaced_circular_references,
                    ))
                        as Pin<Box<dyn Future<Output = Result<(JsValue, bool)>> + Send>>
                })
                .await?;
            *circle_stack = circle_stack_mutex.into_inner().unwrap();

            let mut val = val;
            loop {
                let m;
                (val, m) = visitor(val).await?;
                if m {
                    val.normalize_shallow();
                    modified = true
                } else {
                    break;
                }
            }

            // TODO: The result can be cached when
            // !modified || replaced_circular_references.is_empty()
            if modified {
                Ok((
                    val,
                    Some(replaced_circular_references.into_inner().unwrap()),
                ))
            } else {
                Ok((val, None))
            }
        }
    }
}
