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

struct GlobalData<'a> {
    ids: HashMap<&'a TaskType, usize>,
    depths: HashMap<&'a TaskType, usize>,
    output: String,
    edges: String,
}

impl<'a> GlobalData<'a> {
    fn get_id(&mut self, ty: &'a TaskType) -> usize {
        get_id(ty, &mut self.ids)
    }
}

pub fn visualize_stats_tree(root: GroupTree, tree_ref_type: ReferenceType) -> String {
    let max_values = get_max_values(&root);
    let mut depths = HashMap::new();
    compute_depths(&root, 0, &mut depths);
    let mut global_data = GlobalData {
        ids: HashMap::new(),
        depths,
        output: "digraph {\nrankdir=LR\n\n".to_string(),
        edges: String::new(),
    };
    visualize_stats_tree_internal(&root, 0, tree_ref_type, &max_values, &mut global_data);
    global_data.output += &global_data.edges;
    global_data.output += "\n}";
    global_data.output
}

fn visualize_stats_tree_internal<'a>(
    node: &'a GroupTree,
    depth: usize,
    tree_ref_type: ReferenceType,
    max_values: &MaxValues,
    global_data: &mut GlobalData<'a>,
) {
    let GroupTree {
        primary,
        children,
        task_types,
    } = node;
    if let Some((ty, stats)) = primary {
        let id = global_data.get_id(ty);
        let label = get_task_label(ty, stats, max_values);
        writeln!(
            &mut global_data.output,
            "subgraph cluster_{id} {{\ncolor=lightgray;"
        )
        .unwrap();
        writeln!(
            &mut global_data.output,
            "task_{id} [shape=plaintext, label={label}]"
        )
        .unwrap();
        visualize_stats_references_internal(
            id,
            stats.count,
            &stats.references,
            depth,
            tree_ref_type,
            global_data,
        );
    }
    for (ty, stats) in task_types.iter() {
        let id = global_data.get_id(ty);
        let label = get_task_label(ty, stats, max_values);
        writeln!(
            &mut global_data.output,
            "task_{id} [shape=plaintext, label={label}]"
        )
        .unwrap();
        visualize_stats_references_internal(
            id,
            stats.count,
            &stats.references,
            depth,
            tree_ref_type,
            global_data,
        );
    }
    for child in children.iter() {
        visualize_stats_tree_internal(child, depth + 1, tree_ref_type, max_values, global_data);
    }
    if primary.is_some() {
        global_data.output.push_str("}\n");
    }
}

fn visualize_stats_references_internal<'a>(
    source_id: usize,
    source_count: usize,
    references: &'a HashMap<(ReferenceType, TaskType), ReferenceStats>,
    depth: usize,
    tree_ref_type: ReferenceType,
    global_data: &mut GlobalData<'a>,
) {
    let mut far_types = Vec::new();
    for ((ref_ty, ty), stats) in references.iter() {
        let target_id = global_data.get_id(ty);
        let is_far = global_data
            .depths
            .get(ty)
            .map(|d| *d < depth)
            .unwrap_or(false);
        if ref_ty == &tree_ref_type {
            let label = get_child_label(ref_ty, stats, source_count);
            if is_far {
                far_types.push((ty, label));
            } else {
                writeln!(
                    &mut global_data.edges,
                    "task_{source_id} -> task_{target_id} [style=dashed, color=lightgray, \
                     label=\"{label}\"]"
                )
                .unwrap();
            }
        }
    }
    if !far_types.is_empty() {
        if far_types.len() == 1 {
            let (ty, label) = far_types.get(0).unwrap();
            let target_id = global_data.get_id(ty);
            writeln!(
                &mut global_data.output,
                "far_task_{source_id}_{target_id} [label=\"{ty}\", style=dashed]"
            )
            .unwrap();
            writeln!(
                &mut global_data.edges,
                "task_{source_id} -> far_task_{source_id}_{target_id} [style=dashed, \
                 color=lightgray, label=\"{label}\"]"
            )
            .unwrap();
        } else {
            writeln!(
                &mut global_data.output,
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
                &mut global_data.edges,
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
