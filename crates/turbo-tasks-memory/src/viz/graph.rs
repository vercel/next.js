use super::*;

pub fn wrap_html(graph: &str) -> String {
    format!(
        r#"
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>turbo-tasks graph</title>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist/index.min.js"></script><script src="https://cdn.jsdelivr.net/npm/viz.js@2.1.2/full.render.js"></script><script>
      var wasmBinaryFile = "https://cdn.jsdelivr.net/npm/@hpcc-js/wasm/dist/graphvizlib.wasm";
      var hpccWasm = window["@hpcc-js/wasm"];
      const dot = `{}`;
      hpccWasm.graphviz.layout(dot, "svg", "dot").then(svg => {{
          const div = document.createElement("div");
          div.innerHTML = svg;
          document.body.appendChild(div)
      }}).catch(err => console.error(err.message));
  </script>
</body>
</html>"#,
        escape_in_template_str(graph)
    )
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
        writeln!(output, "subgraph cluster_{id} {{\ncolor=lightgray;").unwrap();
        writeln!(output, "task_{id} [shape=plaintext, label={label}]").unwrap();
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
        writeln!(output, "task_{id} [shape=plaintext, label={label}]").unwrap();
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
    if primary.is_some() {
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
                    writeln!(
                        edges,
                        "task_{source_id} -> task_{target_id} [style=dashed, color=lightgray, \
                         label=\"{label}\"]"
                    )
                    .unwrap();
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
            let (ty, label) = far_types.get(0).unwrap();
            let target_id = get_id(ty, ids);
            writeln!(
                output,
                "far_task_{source_id}_{target_id} [label=\"{ty}\", style=dashed]"
            )
            .unwrap();
            writeln!(
                edges,
                "task_{source_id} -> far_task_{source_id}_{target_id} [style=dashed, \
                 color=lightgray, label=\"{label}\"]"
            )
            .unwrap();
        } else {
            writeln!(
                output,
                "far_tasks_{source_id} [label=\"{}\", style=dashed]",
                escape_in_template_str(
                    &far_types
                        .iter()
                        .map(|(ty, label)| format!("{label} {ty}"))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            )
            .unwrap();
            writeln!(
                edges,
                "task_{source_id} -> far_tasks_{source_id} [style=dashed, color=lightgray]"
            )
            .unwrap();
        }
    }
}

fn get_task_label(ty: &TaskType, stats: &TaskStats, max_values: &MaxValues) -> String {
    let total = as_frac(
        stats.total_duration.as_millis(),
        max_values.total_duration.as_millis(),
    );
    let avg = as_frac(
        stats.total_duration.as_micros() / (stats.executions as u128),
        max_values.avg_duration.as_micros(),
    );
    let count = as_frac(stats.count, max_values.count);
    let updates = as_frac(
        stats.executions.saturating_sub(stats.count),
        max_values.updates,
    );
    let roots = as_frac(stats.roots, max_values.roots);
    let max_scopes = max_values.scopes.saturating_sub(100);
    let scopes = as_frac(
        (100 * stats.scopes / stats.count).saturating_sub(100),
        max_scopes,
    );

    format!(
        "<
<table border=\"0\" cellborder=\"1\" cellspacing=\"0\">
    <tr><td bgcolor=\"{}\" colspan=\"3\">{}</td></tr>
    <tr>
        <td>count</td>
        <td bgcolor=\"{}\">{}</td>
        <td bgcolor=\"{}\">+ {}</td>
    </tr>
    <tr>
        <td>exec</td>
        <td bgcolor=\"{}\">{} ms</td>
        <td bgcolor=\"{}\">avg {} ms</td>
    </tr>
    <tr>
        <td>scopes</td>
        <td bgcolor=\"{}\">{} roots</td>
        <td bgcolor=\"{}\">avg {}</td>
    </tr>
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
