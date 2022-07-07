use std::{
    cmp::max,
    collections::HashMap,
    fmt::Debug,
    ops::{Div, Mul},
    time::Duration,
};

use crate::stats::{GroupTree, ReferenceStats, ReferenceType, TaskStats, TaskType};

fn escape(s: &str) -> String {
    s.replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
}

fn escape_html(s: &str) -> String {
    s.replace(">", "&gt;").replace("<", "&lt;")
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

struct MaxValues {
    pub total_duration: Duration,
    pub avg_duration: Duration,
    pub count: usize,
    pub updates: usize,
    pub roots: usize,
    /// stores as scopes * 100
    pub scopes: usize,
}

pub fn visualize_stats_tree(root: GroupTree) -> String {
    let max_values = get_max_values(&root);
    let mut out = String::new();
    let mut edges = String::new();
    let mut depths = HashMap::new();
    compute_depths(&root, 0, &mut depths);
    out += "digraph {\nrankdir=LR\n\n";
    // out += "digraph {\n\n";
    visualize_stats_tree_internal(
        &root,
        0,
        &max_values,
        &mut HashMap::new(),
        &depths,
        &mut out,
        &mut edges,
    );
    out += &edges;
    out += "\n}";
    out
}

fn get_max_values(node: &GroupTree) -> MaxValues {
    let mut max_duration = Duration::ZERO;
    let mut max_avg_duration = Duration::ZERO;
    let mut max_count = 0;
    let mut max_updates = 0;
    let mut max_roots = 0;
    let mut max_scopes = 0;
    for (_, ref s) in node.task_types.iter().chain(node.primary.iter()) {
        max_duration = max(max_duration, s.total_duration);
        max_avg_duration = max(max_avg_duration, s.total_duration / s.executions as u32);
        max_count = max(max_count, s.count);
        max_updates = max(max_updates, s.executions - s.count);
        max_roots = max(max_roots, s.roots);
        max_scopes = max(max_scopes, 100 * s.scopes / s.count);
    }
    for child in node.children.iter() {
        let MaxValues {
            total_duration,
            avg_duration,
            count,
            updates,
            roots,
            scopes,
        } = get_max_values(&child);
        max_duration = max(max_duration, total_duration);
        max_avg_duration = max(max_avg_duration, avg_duration);
        max_count = max(max_count, count);
        max_updates = max(max_updates, updates);
        max_roots = max(max_roots, roots);
        max_scopes = max(max_scopes, scopes);
    }
    MaxValues {
        total_duration: max_duration,
        avg_duration: max_avg_duration,
        count: max_count,
        updates: max_updates,
        roots: max_roots,
        scopes: max_scopes,
    }
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
    max_values: &MaxValues,
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
        let label = get_task_label(ty, stats, max_values);
        output.push_str(&format!("subgraph cluster_{id} {{\ncolor=lightgray;\n"));
        output.push_str(&format!("task_{id} [shape=plaintext, label={label}]\n"));
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
        let label = get_task_label(ty, stats, max_values);
        output.push_str(&format!("task_{id} [shape=plaintext, label={label}]\n"));
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
        visualize_stats_tree_internal(child, depth + 1, max_values, ids, depths, output, edges);
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
    let mut far_types = Vec::new();
    for ((ref_ty, ty), stats) in references.iter() {
        let target_id = get_id(ty, ids);
        let is_far = depths.get(ty).map(|d| *d < depth).unwrap_or(false);
        match ref_ty {
            ReferenceType::Child => {
                let label = get_child_label(ref_ty, stats, source_count);
                if is_far {
                    far_types.push((ty, label));
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
    if !far_types.is_empty() {
        if far_types.len() == 1 {
            let (ty, label) = far_types.iter().next().unwrap();
            let target_id = get_id(ty, ids);
            output.push_str(&format!(
                "far_task_{source_id}_{target_id} [label=\"{ty}\", style=dashed]\n"
            ));
            edges.push_str(&format!(
                "task_{source_id} -> far_task_{source_id}_{target_id} [style=dashed, \
                 color=lightgray, label=\"{label}\"]\n"
            ));
        } else {
            output.push_str(&format!(
                "far_tasks_{source_id} [label=\"{}\", style=dashed]\n",
                escape(
                    &far_types
                        .iter()
                        .map(|(ty, label)| format!("{label} {ty}"))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            ));
            edges.push_str(&format!(
                "task_{source_id} -> far_tasks_{source_id} [style=dashed, color=lightgray]\n"
            ));
        }
    }
}

fn get_task_label(ty: &TaskType, stats: &TaskStats, max_values: &MaxValues) -> String {
    fn as_frac<T: From<u8> + TryInto<u8> + Mul<T, Output = T> + Div<T, Output = T> + Ord + Copy>(
        current: T,
        total: T,
    ) -> u8
    where
        <T as TryInto<u8>>::Error: Debug,
    {
        let min: T = u8::MIN.into();
        let max: T = u8::MAX.into();
        let result = max * current / total;
        result.clamp(min, max).try_into().unwrap()
    }
    let total = as_frac(
        stats.total_duration.as_millis(),
        max_values.total_duration.as_millis(),
    );
    let avg = as_frac(
        stats.total_duration.as_micros() / (stats.executions as u128),
        max_values.avg_duration.as_micros(),
    );
    let count = as_frac(stats.count, max_values.count);
    let updates = as_frac(stats.executions - stats.count, max_values.updates);
    let roots = as_frac(stats.roots, max_values.roots);
    let max_scopes = max_values.scopes.saturating_sub(100);
    let scopes = if max_scopes == 0 {
        0
    } else {
        as_frac(
            (100 * stats.scopes / stats.count).saturating_sub(100),
            max_scopes,
        )
    };

    format!(
        "<
<table border=\"0\" cellborder=\"1\" cellspacing=\"0\">
    <tr><td bgcolor=\"{}\" colspan=\"2\">{}</td></tr>
    <tr><td bgcolor=\"{}\">{}</td><td bgcolor=\"{}\">+ {}</td></tr>
    <tr><td bgcolor=\"{}\">{} ms</td><td bgcolor=\"{}\">avg {} ms</td></tr>
    <tr><td bgcolor=\"{}\">{} roots</td><td bgcolor=\"{}\">avg {} scopes</td></tr>
</table>>",
        as_color(total),
        escape_html(&ty.to_string()),
        as_color(count),
        stats.count,
        as_color(updates),
        stats.executions - stats.count,
        as_color(total),
        stats.total_duration.as_millis(),
        as_color(avg),
        (stats.total_duration.as_micros() as usize / stats.executions) as f32 / 1000.0,
        as_color(roots),
        stats.roots,
        as_color(scopes),
        (100 * stats.scopes / stats.count) as f32 / 100.0
    )
}

// fn get_task_label(ty: &TaskType, stats: &TaskStats) -> String {
//     format!(
//         "{}\n{} + {}\n{} ms (avg {} ms)",
//         escape(&ty.to_string()),
//         stats.count,
//         stats.executions - stats.count,
//         stats.total_duration.as_millis(),
//         (stats.total_duration.as_micros() as usize / stats.executions) as f32
// / 1000.0     )
// }

// fn get_task_format(ty: &TaskType, stats: &TaskStats, max_values: &MaxValues)
// -> String {     let total = (u8::MAX as u128 *
// stats.total_duration.as_millis()         / max_values.total_duration.
// as_millis())     .clamp(0, u8::MAX as u128) as u8;
//     let avg = (u8::MAX as u128 * stats.total_duration.as_micros()
//         / (stats.executions as u128)
//         / max_values.avg_duration.as_micros())
//     .clamp(0, u8::MAX as u128) as u8;
//     let executions = (u8::MAX as usize * stats.executions /
// max_values.executions)         .clamp(0, u8::MAX as usize) as u8;

//     format!(
//         ", style=striped, fillcolor=\"{}:{}:{}\"",
//         as_color(total),
//         as_color(executions),
//         as_color(avg)
//     )
// }

fn as_color(n: u8) -> String {
    // interpolate #fff -> #ff0 -> #f00
    if n >= 64 {
        format!("#ff{:0>2x}00", u8::MAX - (n - 64) * 4 / 3)
    } else {
        format!("#ffff{:0>2x}", u8::MAX - n * 4)
    }
}

fn get_child_label(_ty: &ReferenceType, stats: &ReferenceStats, source_count: usize) -> String {
    if stats.count == source_count {
        "".to_string()
    } else {
        format!("{}", stats.count)
    }
}
