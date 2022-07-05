use std::collections::HashMap;

use crate::stats::{GroupTree, ReferenceStats, ReferenceType, TaskStats, TaskType};

fn escape(s: &str) -> String {
    s.replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
}

pub fn wrap_html(graph: &str) -> String {
    format!("
<!DOCTYPE html>
<html>
<head>
  <meta charset=\"utf-8\">
  <title>Graph</title>
</head>
<body>
  <script src=\"https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist/index.min.js\"></script><script \
      src=\"https://cdn.jsdelivr.net/npm/viz.js@2.1.2/full.render.js\"></script><script>
      var wasmBinaryFile = \"https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist/graphvizlib.wasm\";
      var hpccWasm = window[\"@hpcc-js/wasm\"];
      const dot = `{}`;
      hpccWasm.graphviz.layout(dot, \"svg\", \"dot\").then(svg => {{
          const div = document.createElement(\"div\");
          div.innerHTML = svg;
          document.body.appendChild(div)
      }}).catch(err => console.error(err.message));
  </script>
</body>
</html>",
        escape(graph)
    )
}

fn get_id<'a>(ty: &'a TaskType, ids: &mut HashMap<&'a TaskType, usize>) -> usize {
    let len = ids.len();
    *ids.entry(ty).or_insert(len)
}

pub fn visualize_stats_tree(root: GroupTree) -> String {
    let mut out = String::new();
    let mut edges = String::new();
    let mut depths = HashMap::new();
    compute_depths(&root, 0, &mut depths);
    out += "digraph {\nrankdir=LR\n\n";
    // out += "digraph {\n\n";
    visualize_stats_tree_internal(&root, 0, &mut HashMap::new(), &depths, &mut out, &mut edges);
    out += &edges;
    out += "\n}";
    out
}

fn compute_depths<'a>(
    node: &'a GroupTree,
    depth: usize,
    output: &mut HashMap<&'a TaskType, usize>,
) {
    if let Some((ty, _)) = &node.primary {
        output.insert(ty, depth);
    }
    for (ty, _) in node.task_types.iter() {
        output.insert(ty, depth);
    }
    for child in node.children.iter() {
        compute_depths(child, depth + 1, output);
    }
}

fn visualize_stats_tree_internal<'a>(
    node: &'a GroupTree,
    depth: usize,
    ids: &mut HashMap<&'a TaskType, usize>,
    depths: &HashMap<&'a TaskType, usize>,
    output: &mut String,
    edges: &mut String,
) {
    let GroupTree {
        primary,
        children,
        task_types,
    } = node;
    if let Some((ty, stats)) = primary {
        let id = get_id(ty, ids);
        let label = get_task_label(ty, stats);
        output.push_str(&format!("subgraph cluster_{id} {{\ncolor=lightgray;\n"));
        output.push_str(&format!("task_{id} [shape=box, label=\"{label}\"]\n"));
        visualize_stats_references_internal(
            id,
            stats.count,
            &stats.references,
            depth,
            ids,
            depths,
            output,
            edges,
        );
    }
    for (ty, stats) in task_types.iter() {
        let id = get_id(ty, ids);
        let label = get_task_label(ty, stats);
        output.push_str(&format!("task_{id} [label=\"{label}\"]\n"));
        visualize_stats_references_internal(
            id,
            stats.count,
            &stats.references,
            depth,
            ids,
            depths,
            output,
            edges,
        );
    }
    for child in children.iter() {
        visualize_stats_tree_internal(child, depth + 1, ids, depths, output, edges);
    }
    if let Some(_) = primary {
        output.push_str("}\n");
    }
}

fn visualize_stats_references_internal<'a>(
    source_id: usize,
    source_count: usize,
    references: &'a HashMap<(ReferenceType, TaskType), ReferenceStats>,
    depth: usize,
    ids: &mut HashMap<&'a TaskType, usize>,
    depths: &HashMap<&'a TaskType, usize>,
    output: &mut String,
    edges: &mut String,
) {
    for ((ref_ty, ty), stats) in references.iter() {
        let target_id = get_id(ty, ids);
        let is_far = *depths.get(ty).unwrap() < depth;
        match ref_ty {
            ReferenceType::Child => {
                let label = get_child_label(ref_ty, stats, source_count);
                if is_far {
                    output.push_str(&format!(
                        "far_task_{source_id}_{target_id} [label=\"{ty}\", style=dashed]\n"
                    ));
                    edges.push_str(&format!(
                        "task_{source_id} -> far_task_{source_id}_{target_id} [style=dashed, \
                         color=lightgray, label=\"{label}\"]\n"
                    ));
                } else {
                    edges.push_str(&format!(
                        "task_{source_id} -> task_{target_id} [style=dashed, color=lightgray, \
                         label=\"{label}\"]\n"
                    ));
                }
            }
            ReferenceType::Dependency => {
                // output.push_str(&format!(
                //     "task_{source_id} -> task_{target_id} [color=\"#77c199\",
                // weight=0, \      constraint=false]\n"
                // ));
            }
            ReferenceType::Input => {
                //   output.push_str(&format!(
                //     "task_{source_id} -> task_{target_id}
                // [constraint=false]\n" ));
            }
        }
    }
}

fn get_task_label(ty: &TaskType, stats: &TaskStats) -> String {
    format!(
        "{}\n{}\n{} ms",
        escape(&ty.to_string()),
        stats.count,
        stats.total_duration.as_millis()
    )
}

fn get_child_label(_ty: &ReferenceType, stats: &ReferenceStats, source_count: usize) -> String {
    if stats.count == source_count {
        "".to_string()
    } else {
        format!("{}", stats.count)
    }
}
