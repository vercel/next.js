use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use crate::{SlotRef, Task, WeakSlotRef};

pub struct TaskSnapshot {
    pub name: String,
    pub inputs: Vec<SlotRef>,
    pub state: String,
    pub children: Vec<Arc<Task>>,
    pub dependencies: Vec<WeakSlotRef>,
    pub slots: Vec<SlotRef>,
    pub output_slot: SlotRef,
    pub executions: u32,
}

pub struct SlotSnapshot {
    pub name: String,
    pub content: String,
    pub updates: u32,
    pub linked_to_slot: Option<SlotRef>,
}

fn escape(s: &str) -> String {
    s.replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
}

#[derive(Clone, Hash, PartialEq, Eq)]
enum EdgeType {
    ChildTask,
    Dependency,
    LinkedSlot,
    Input,
    DependencyAndInput,
}

#[derive(Hash, PartialEq, Eq)]
struct Slot {
    id: String,
    name: String,
    content: String,
    updates: u32,
}

#[derive(Hash, PartialEq, Eq)]
enum NodeType {
    Task(String, String, u32, Vec<Slot>),
}

#[derive(Default)]
pub struct GraphViz {
    visited: HashSet<String>,
    id_map: HashMap<usize, usize>,
    nodes: HashSet<(String, NodeType)>,
    edges: HashSet<(String, String, EdgeType)>,
}

impl GraphViz {
    pub fn new() -> Self {
        Default::default()
    }

    fn get_id<T>(&mut self, ptr: *const T) -> String {
        let ptr = ptr as usize;
        match self.id_map.get(&ptr) {
            Some(id) => id.to_string(),
            None => {
                let id = self.id_map.len() + 1;
                self.id_map.insert(ptr, id);
                id.to_string()
            }
        }
    }

    fn get_slot_id(&mut self, slot_ref: &SlotRef) -> String {
        match slot_ref {
            SlotRef::TaskOutput(task) => {
                format!("slot_{}_output", self.get_id(&**task as *const Task))
            }
            SlotRef::TaskCreated(task, index) => {
                format!("slot_{}_{}", self.get_id(&**task as *const Task), index)
            }
            SlotRef::Nothing | SlotRef::SharedReference(_, _) | SlotRef::CloneableData(_, _) => {
                panic!("no ids for immutable data")
            }
        }
    }

    pub fn add_task(&mut self, task: &Arc<Task>) {
        let id = self.get_id(&**task as *const Task);
        if self.visited.contains(&id) {
            return;
        }
        self.visited.insert(id.clone());
        let snapshot = task.get_snapshot_for_visualization();
        let mut slots = Vec::new();
        for input in snapshot.inputs.iter() {
            let slot_id = self.get_slot_id(input);
            self.edges
            .insert((id.clone(), slot_id, EdgeType::Input));
        }
        for slot in snapshot.slots.iter() {
            let snapshot = slot.get_snapshot_for_visualization();
            let slot_id = self.get_slot_id(slot);
            slots.push(Slot {
                id: slot_id.clone(),
                name: snapshot.name,
                content: snapshot.content,
                updates: snapshot.updates,
            });
            if let Some(linked) = &snapshot.linked_to_slot {
                let linked_id = self.get_slot_id(linked);
                self.edges
                    .insert((slot_id.clone(), linked_id, EdgeType::LinkedSlot));
            }
        }
        self.nodes.insert((
            id.clone(),
            NodeType::Task(snapshot.name, snapshot.state, snapshot.executions, slots),
        ));
        for child in snapshot.children.iter() {
            self.add_task(child);
            let child_id = self.get_id(&**child as *const Task);
            self.edges
                .insert((id.clone(), child_id, EdgeType::ChildTask));
        }
        for dependency in snapshot.dependencies.iter().filter_map(|sr| sr.upgrade()) {
            let dep_id = self.get_slot_id(&dependency);
            self.edges
                .insert((id.clone(), dep_id, EdgeType::Dependency));
        }
    }
    
    pub fn drop_unchanged_slots(&mut self) {
        let mut dropped_ids = HashSet::new();
        for (id, node) in self.nodes.drain().collect::<Vec<_>>() {
            match node {
                NodeType::Task(name, state, executions, mut slots) => {
                    for slot in slots.drain(..).collect::<Vec<_>>() {
                        if slot.updates <= 1 {
                            dropped_ids.insert(slot.id);
                        } else {
                            slots.push(slot);
                        }
                    }
                    self.nodes.insert((id, NodeType::Task(name, state, executions, slots)));
                },
            }
        }
        self.edges.retain(|(from, to, _)| !dropped_ids.contains(from) && !dropped_ids.contains(to));
    }

    pub fn merge_edges(&mut self) {
        let mut new_edges = Vec::new();
        let old_edges = self.edges.clone();
        self.edges.retain(|(from, to, edge)| {
            match edge {
                EdgeType::Input => {
                    if old_edges.contains(&(from.clone(), to.clone(), EdgeType::Dependency)) {
                        new_edges.push((from.clone(), to.clone(), EdgeType::DependencyAndInput));
                        return false;
                    }
                }
                EdgeType::Dependency => {
                    if old_edges.contains(&(from.clone(), to.clone(), EdgeType::Input)) {
                        return false;
                    }
                }
                _ => {}
            }
            true
        });
        for edge in new_edges {
            self.edges.insert(edge);
        }
    }

    pub fn skip_loney_resolve(&mut self) {
        self.skip_loney("[resolve] ");
        self.skip_loney("[resolve trait] ");
    }

    fn skip_loney(&mut self, prefix: &str) {
        let mut map = self.nodes.iter().filter_map(|(id, node)| match node {
            NodeType::Task(name, _, _, _) => {
                if name.starts_with(prefix) {
                    Some((id.clone(), (Vec::new(), Vec::new())))
                } else {
                    None
                }
            },
        }).collect::<HashMap<_, _>>();
        for (from, to, edge) in self.edges.iter() {
            if let Some(entry) = map.get_mut(from) {
                entry.1.push((to.clone(), edge.clone()));
            }
            if let Some(entry) = map.get_mut(to) {
                entry.0.push((from.clone(), edge.clone()));
            }
        }
        let skipped_nodes = map.drain().filter_map(|(id, (a, b))| {
            if a.len() == 1 && b.len() == 1 && a[0].1 == b[0].1 {
                self.edges.insert((a[0].0.clone(), b[0].0.clone(), a[0].1.clone()));
                Some(id)
            } else {
                None
            }
        }).collect::<HashSet<_>>();
        self.nodes.retain(|(id, _)| !skipped_nodes.contains(id));
        self.edges.retain(|(from, to, _)| !skipped_nodes.contains(from) && !skipped_nodes.contains(to));
    }

    pub fn get_graph(&self) -> String {
        let nodes_info = self.nodes
            .iter()
            .map(|(id, node)| match node {
                NodeType::Task(name, state, executions, slots) => { 
                    let slots_info = slots.iter().map(|Slot{ id, name, content, updates }| if *updates > 1 {
                        format!(
                            "{} [style=filled, fillcolor=\"#77c199\", label=\"{}\\n{}\\n{} updates\"]\n",
                            id, escape(name), escape(content), updates
                        )
                    } else {
                        format!(
                            "{} [label=\"{}\\n{}\"]\n",
                            id, escape(name), escape(content)
                        )
                    }).collect::<String>();
                    let label = if *executions > 1 {
                        format!("style=filled, fillcolor=\"#77c199\", label=\"{}\\n{}\\n{} executions\"", escape(name), escape(state), executions)
                    } else if state == "done" {
                        format!("label=\"{}\"", escape(name))
                    } else {
                        format!("label=\"{}\\n{}\"", escape(name), escape(state))
                    };
                    format!("subgraph cluster_{} {{\ncolor=lightgray;\n{} [shape=box, {}]\n{}}}", id, id, label, slots_info)
                },
            })
            .collect::<String>();
        let edges_info = self.edges
            .iter()
            .map(|(from, to, edge)| match edge {
                EdgeType::ChildTask => format!("{} -> {} [style=dashed, color=lightgray]\n", from, to),
                EdgeType::Input => format!("{} -> {} [constraint=false]\n", to, from),
                EdgeType::Dependency => format!("{} -> {} [color=\"#77c199\", weight=0, constraint=false]\n", to, from),
                EdgeType::DependencyAndInput => format!("{} -> {} [color=\"#009129\", weight=0, constraint=false]\n", to, from),
                EdgeType::LinkedSlot => format!("{} -> {} [color=\"#990000\", constraint=false]\n", to, from),
            })
            .collect::<String>();
        format!(
            "digraph {{
            rankdir=LR
            {}
            {}
        }}",
            nodes_info,
            edges_info
        )
    }

    pub fn wrap_html(graph: &str) -> String {
        format!("<!DOCTYPE html>
          <html>
          <head>
            <meta charset=\"utf-8\">
            <title>Graph</title>
          </head>
          <body>
            <script src=\"https://cdn.jsdelivr.net/npm/viz.js@2.1.2-pre.1/viz.js\"></script>
            <script src=\"https://cdn.jsdelivr.net/npm/viz.js@2.1.2-pre.1/full.render.js\"></script>
            <script>
              const s = `{}`;
              new Viz().renderSVGElement(s).then(el => document.body.appendChild(el)).catch(e => console.error(e));
            </script>
          </body>
          </html>", escape(graph))
    }
}