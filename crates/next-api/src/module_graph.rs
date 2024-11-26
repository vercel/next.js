use std::collections::HashMap;

use anyhow::{Context, Result};
use petgraph::graph::{DiGraph, NodeIndex};
use turbo_tasks::Vc;
use turbopack_core::{module::Module, reference::primary_referenced_modules};

#[derive(Debug)]
pub struct SingleModuleGraph {
    graph: DiGraph<Vc<Box<dyn Module>>, ()>,
    modules: HashMap<Vc<Box<dyn Module>>, NodeIndex<u32>>,
}

impl SingleModuleGraph {
    pub fn new() -> Self {
        Self {
            graph: Default::default(),
            modules: Default::default(),
        }
    }

    pub async fn add_module_subgraph(&mut self, module: Vc<Box<dyn Module>>) -> Result<()> {
        let mut stack = vec![(None, module)];
        while let Some((parent_idx, module)) = stack.pop() {
            if let Some(idx) = self.modules.get(&module) {
                let parent_idx = parent_idx.context("Existing module without parent")?;
                self.graph.add_edge(parent_idx, *idx, ());
                continue;
            }

            let idx = self.graph.add_node(module);
            self.modules.insert(module, idx);
            if let Some(parent_idx) = parent_idx {
                self.graph.add_edge(parent_idx, idx, ());
            }

            for reference in primary_referenced_modules(module).await?.iter() {
                stack.push((Some(idx), **reference));
            }
        }
        Ok(())
    }
}
