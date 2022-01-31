use std::collections::{HashMap, HashSet};

use crate::{node::Node, Task};

pub trait Visualizable {
    fn visualize(&self, visualizer: &mut impl Visualizer);
}

pub trait Visualizer {
    fn task(&mut self, task: *const Task, name: &str, state: &str) -> bool;
    fn node(&mut self, node: *const Node, type_name: &str);
    fn output(&mut self, task: *const Task, node: *const Node);
    fn child(&mut self, parent_task: *const Task, child_task: *const Task);
    fn dependency(&mut self, task: *const Task, node: *const Node);
}

pub struct GraphViz {
    visited_tasks: HashSet<*const Task>,
    id_map: HashMap<usize, usize>,
    output: String,
}

impl GraphViz {
    pub fn new() -> Self {
        Self {
            visited_tasks: HashSet::new(),
            id_map: HashMap::new(),
            output: String::new(),
        }
    }

    fn get_id<T>(&mut self, ptr: *const T) -> usize {
        let ptr = ptr as usize;
        match self.id_map.get(&ptr) {
            Some(id) => *id,
            None => {
                let id = self.id_map.len() + 1;
                self.id_map.insert(ptr, id);
                id
            }
        }
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

impl ToString for GraphViz {
    fn to_string(&self) -> String {
        return "digraph {
                  rankdir=LR
                  "
        .to_string()
            + &self.output
            + "}";
    }
}

fn escape(s: &str) -> String {
    s.replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
}

impl Visualizer for GraphViz {
    fn task(&mut self, task: *const Task, name: &str, state: &str) -> bool {
        if self.visited_tasks.contains(&task) {
            false
        } else {
            self.visited_tasks.insert(task);
            let id = self.get_id(task);
            self.output += &format!(
                "{} [shape=box, label=\"{}\"]\n",
                id,
                escape(&(name.to_string() + "\n" + state))
            );
            true
        }
    }
    fn node(&mut self, node: *const Node, type_name: &str) {
        let id = self.get_id(node);
        self.output += &format!("{} [label=\"{}\"]\n", id, escape(type_name));
    }
    fn output(&mut self, task: *const Task, node: *const Node) {
        let task = self.get_id(task);
        let node = self.get_id(node);
        self.output += &format!("{} -> {} [len=1]\n", task, node);
    }
    fn child(&mut self, parent_task: *const Task, child_task: *const Task) {
        let parent_task = self.get_id(parent_task);
        let child_task = self.get_id(child_task);
        self.output += &format!("{} -> {} [style=dashed, len=6]\n", parent_task, child_task);
    }
    fn dependency(&mut self, task: *const Task, node: *const Node) {
        let task = self.get_id(task);
        let node = self.get_id(node);
        self.output += &format!("{} -> {} [style=dotted, len=3]\n", task, node);
    }
}
