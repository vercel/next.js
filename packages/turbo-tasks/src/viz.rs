use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use crate::{SlotRef, Task, WeakSlotRef};

pub struct TaskSnapshot {
    pub name: String,
    pub state: String,
    pub children: Vec<Arc<Task>>,
    pub dependencies: Vec<WeakSlotRef>,
    pub slots: Vec<SlotRef>,
    pub output_slot: SlotRef,
}

pub struct SlotSnapshot {
    pub name: String,
    pub content: String,
    pub updates: i32,
    pub linked_to_slot: Option<SlotRef>,
}

fn escape(s: &str) -> String {
    s.replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
}

#[derive(Hash, PartialEq, Eq)]
enum EdgeType {
    ChildTask,
    Slot,
    Dependency,
    LinkedSlot,
}

#[derive(Hash, PartialEq, Eq)]
enum NodeType {
    Task(String, String),
    Slot(String, String, i32),
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
            SlotRef::TaskOutput(task) => self.get_id(&**task as *const Task) + "_output",
            SlotRef::TaskCreated(task, index) => {
                format!("{}_{}", self.get_id(&**task as *const Task), index)
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
        self.nodes
            .insert((id.clone(), NodeType::Task(snapshot.name, snapshot.state)));
        for slot in snapshot.slots.iter() {
            let slot_id = self.get_slot_id(slot);
            self.edges.insert((id.clone(), slot_id, EdgeType::Slot));
        }
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

    pub fn add_slot_ref(&mut self, slot_ref: &SlotRef) {
        let id = self.get_slot_id(slot_ref);
        if self.visited.contains(&id) {
            return;
        }
        self.visited.insert(id.clone());
        let snapshot = slot_ref.get_snapshot_for_visualization();
        self.nodes.insert((
            id.clone(),
            NodeType::Slot(snapshot.name, snapshot.content, snapshot.updates),
        ));
        if let Some(linked) = &snapshot.linked_to_slot {
            let linked_id = self.get_slot_id(linked);
            self.edges
                .insert((id.clone(), linked_id, EdgeType::LinkedSlot));
        }
    }

    pub fn get_graph(&self) -> String {
        format!(
            "digraph {{
            rankdir=LR
            {}
            {}
        }}",
            self.nodes
                .iter()
                .map(|(id, node)| match node {
                    NodeType::Task(name, state) =>
                        format!("{} [shape=box, label=\"{}\\n{}\"]\n", id, name, state),
                    NodeType::Slot(name, content, updates) => format!(
                        "{} [label=\"{}\\n{}\\n{} updates\"]\n",
                        id, name, content, updates
                    ),
                })
                .collect::<String>(),
            self.edges
                .iter()
                .map(|(from, to, edge)| match edge {
                    EdgeType::ChildTask=>format!("{} {} [style=dashed, color=lightgray]\n", from ,to),
                    EdgeType::Dependency=>format!("{} {} [style=dotted, weight=0, arrowhead=empty, color=gray, constraint=false]\n", from ,to),
                    EdgeType::LinkedSlot=>format!("{} {} [color=\"#990000\", constraint=false]\n", from ,to),
                    EdgeType::Slot=>format!("{} {} [weight=0, arrowhead=empty, color=gray, constraint=false]\n", from ,to)
                })
                .collect::<String>()
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
//     pub fn new(include_nodes: bool) -> Self {
//         Self {
//             include_nodes,
//             visited: HashSet::new(),
//             output_has_task: HashSet::new(),
//             id_map: HashMap::new(),
//             output: String::new(),
//             edges: Vec::new(),
//         }
//     }

//

// }

// impl ToString for GraphViz {
//     fn to_string(&self) -> String {
//         return "digraph {
//                   rankdir=LR
//                   "
//         .to_string()
//             + &self.output
//             + &self
//                 .edges
//                 .iter()
//                 .filter(|(a, b, _)| self.visited.contains(a) && self.visited.contains(b))
//                 .map(|(_, _, o)| o.as_str())
//                 .collect::<String>()
//             + "}";
//     }
// }

// fn escape(s: &str) -> String {
//     s.replace("\\", "\\\\")
//         .replace("\"", "\\\"")
//         .replace("\n", "\\n")
// }

// impl Visualizer for GraphViz {
//     fn task(&mut self, task: *const Task, name: &str, state: &str) -> bool {
//         let id = self.get_id(task);
//         if self.visited.contains(&id) {
//             false
//         } else {
//             self.visited.insert(id);
//             self.output += &format!(
//                 "{} [shape=box, label=\"{}\"]\n",
//                 id,
//                 escape(&if state == "" {
//                     name.to_string()
//                 } else {
//                     name.to_string() + "\n" + state
//                 })
//             );
//             true
//         }
//     }

//     fn node(&mut self, node: *const Node, type_name: &str, state: &str) -> bool {
//         if !self.include_nodes && state == "" {
//             return true;
//         }
//         let id = self.get_id(node);
//         if self.visited.contains(&id) {
//             false
//         } else {
//             self.visited.insert(id);
//             self.output += &format!(
//                 "{} [label=\"{}\"]\n",
//                 id,
//                 escape(&if state == "" {
//                     type_name.to_string()
//                 } else {
//                     type_name.to_string() + "\n" + state
//                 })
//             );
//             true
//         }
//     }

//     fn output(&mut self, task: *const Task, node: *const Node) {
//         let task = self.get_id(task);
//         let node = self.get_id(node);
//         if !self.output_has_task.contains(&node) {
//             self.output_has_task.insert(node);
//             // self.edges += &format!("{}:e -> {}:w [color=red]\n", task, node);
//             if self.visited.contains(&node) && self.visited.contains(&task) {
//                 self.output += &format!(
//                     "subgraph cluster_{} {{\ncolor=lightgray; {}:e -> {}:w [color=red]\n}}\n",
//                     node, task, node
//                 );
//             }
//         } else {
//             self.edges.push((
//                 task,
//                 node,
//                 format!(
//                     "{}:e -> {}:n [color=\"#990000\", constraint=false]\n",
//                     task, node
//                 ),
//             ));
//         }
//     }

//     fn input(&mut self, task: *const Task, node: *const Node) {
//         let task = self.get_id(task);
//         let node = self.get_id(node);
//         if !self.visited.contains(&task) || !self.visited.contains(&node) {
//             return;
//         }
//         self.edges.push((
//             node,
//             task,
//             format!("{} -> {} [color=\"#009129\"]\n", node, task),
//         ));
//     }

//     fn dependency(&mut self, task: *const Task, node: *const Node) {
//         let task = self.get_id(task);
//         let node = self.get_id(node);
//         self.edges.push((
//             node,
//             task,
//             if self.include_nodes {
//                 format!(
//                     "{} -> {} [style=dotted, weight=0, arrowhead=empty, color=gray, constraint=false]\n",
//                     node, task
//                 )
//             } else {
//                 format!(
//                     "{} -> {} [style=dashed, weight=0, arrowhead=empty, color=\"#009129\", constraint=false]\n",
//                     node, task
//                 )
//             }
//         ));
//     }

//     fn created(&mut self, task: *const Task, node: *const Node) {
//         let task = self.get_id(task);
//         let node = self.get_id(node);
//         self.edges.push((
//             task,
//             node,
//             if self.include_nodes {
//                 format!(
//                     "{} -> {} [weight=0, arrowhead=empty, color=gray, constraint=false]\n",
//                     task, node
//                 )
//             } else {
//                 format!(
//                     "{} -> {} [style=dashed, weight=0, arrowhead=empty, color=red, constraint=false]\n",
//                     task, node
//                 )
//             },
//         ));
//     }

//     fn children_start(&mut self, parent_task: *const Task) {
//         let parent_task = self.get_id(parent_task);
//         self.output += &format!("subgraph cluster_{} {{\nrank=same\n", parent_task);
//     }

//     fn child(&mut self, parent_task: *const Task, child_task: *const Task) {
//         let parent_task = self.get_id(parent_task);
//         let child_task = self.get_id(child_task);
//         if self.visited.contains(&parent_task) && self.visited.contains(&child_task) {
//             self.output += &format!(
//                 "{}:e -> {}:w [style=dashed, color=lightgray]\n",
//                 parent_task, child_task
//             );
//         }
//     }

//     fn children_end(&mut self, _parent_task: *const Task) {
//         self.output += &format!("}}\n");
//     }

//     fn nested_start(&mut self, parent_node: *const Node) {
//         if !self.include_nodes {
//             return;
//         }
//         let parent_node = self.get_id(parent_node);
//         self.output += &format!("subgraph cluster_{} {{\ncolor=\"#c2e4ff\"\n", parent_node);
//     }

//     fn nested(&mut self, parent_node: *const Node, nested_node: *const Node) {
//         let parent_node = self.get_id(parent_node);
//         let nested_node = self.get_id(nested_node);
//         if self.visited.contains(&parent_node) && self.visited.contains(&nested_node) {
//             self.output += &format!("{} -> {} [color=\"#94c8f2\"]\n", parent_node, nested_node);
//         }
//     }

//     fn nested_end(&mut self, _parent_node: *const Node) {
//         if !self.include_nodes {
//             return;
//         }
//         self.output += &format!("}}\n");
//     }
// }
