use turbo_tasks::StatsType;

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
  <script src="https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@1.20.1/dist/index.min.js"></script><script src="https://cdn.jsdelivr.net/npm/viz.js@2.1.2/full.render.js"></script><script>
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
    ids: HashMap<&'a StatsTaskType, usize>,
    depths: HashMap<&'a StatsTaskType, usize>,
    output: String,
    edges: String,
}

impl<'a> GlobalData<'a> {
    fn get_id(&mut self, ty: &'a StatsTaskType) -> usize {
        get_id(ty, &mut self.ids)
    }
}

pub fn visualize_stats_tree(
    root: GroupTree,
    tree_ref_type: ReferenceType,
    stats_type: StatsType,
) -> String {
    let max_values = get_max_values(&root);
    let mut depths = HashMap::new();
    compute_depths(&root, 0, &mut depths);
    let mut global_data = GlobalData {
        ids: HashMap::new(),
        depths,
        output: "digraph {\nrankdir=LR\n\n".to_string(),
        edges: String::new(),
    };
    visualize_stats_tree_internal(
        &root,
        0,
        tree_ref_type,
        &max_values,
        &mut global_data,
        stats_type,
    );
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
    stats_type: StatsType,
) {
    let GroupTree {
        primary,
        children,
        task_types,
    } = node;
    if let Some((ty, stats)) = primary {
        let id = global_data.get_id(ty);
        let label = get_task_label(ty, stats, max_values, stats_type);
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
        let label = get_task_label(ty, stats, max_values, stats_type);
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
        visualize_stats_tree_internal(
            child,
            depth + 1,
            tree_ref_type,
            max_values,
            global_data,
            stats_type,
        );
    }
    if primary.is_some() {
        global_data.output.push_str("}\n");
    }
}

fn visualize_stats_references_internal<'a>(
    source_id: usize,
    source_count: usize,
    references: &'a HashMap<(ReferenceType, StatsTaskType), ReferenceStats>,
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

fn get_task_label(
    ty: &StatsTaskType,
    stats: &ExportedTaskStats,
    max_values: &MaxValues,
    stats_type: StatsType,
) -> String {
    let (total_millis, total_color) = if let Some((total_duration, max_total_duration)) =
        stats.total_duration.zip(max_values.total_duration)
    {
        let total_color = as_color(as_frac(
            total_duration.as_millis(),
            max_total_duration.as_millis(),
        ));
        let total_millis = format!("{}ms", total_duration.as_millis());
        (total_millis, total_color)
    } else {
        ("N/A".to_string(), "#ffffff".to_string())
    };

    let (avg_label, avg_color) = if let Some(((executions, total_duration), max_avg_duration)) =
        stats
            .executions
            .zip(stats.total_duration)
            .zip(max_values.avg_duration)
    {
        let avg_color = as_color(as_frac(
            total_duration.as_micros() / (executions as u128),
            max_avg_duration.as_micros(),
        ));
        let avg = (total_duration.as_micros() as u32 / executions) as f32 / 1000.0;
        (format!("avg {}ms", avg), avg_color)
    } else {
        ("avg N/A".to_string(), "#ffffff".to_string())
    };
    let count = as_frac(stats.count, max_values.count);
    let (updates_label, updates_color) =
        if let Some((executions, max_updates)) = stats.executions.zip(max_values.updates) {
            let updates_color = as_color(as_frac(
                executions.saturating_sub(stats.count as u32),
                max_updates as u32,
            ));
            let updates = executions - stats.count as u32;
            (format!("{}", updates), updates_color)
        } else {
            ("N/A".to_string(), "#ffffff".to_string())
        };
    let roots = as_frac(stats.roots, max_values.roots);
    let max_scopes = max_values.scopes.saturating_sub(100);
    let scopes = as_frac(
        (100 * stats.scopes / stats.count).saturating_sub(100),
        max_scopes,
    );

    let full_stats_disclaimer = if stats_type.is_full() {
        "".to_string()
    } else {
        r##"<tr>
    <td colspan="3" align="center" border="0" cellpadding="0">
        <font point-size="10" color="#00000090">
            <i>Full stats collection is disabled. Pass --full-stats to enable it.</i>
        </font>
    </td>
</tr>"##
            .to_string()
    };

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
        <td bgcolor=\"{}\">{}</td>
        <td bgcolor=\"{}\">{}</td>
    </tr>
    <tr>
        <td>scopes</td>
        <td bgcolor=\"{}\">{} roots</td>
        <td bgcolor=\"{}\">avg {}</td>
    </tr>
    {}
</table>>",
        total_color,
        escape_html(&ty.to_string()),
        as_color(count),
        stats.count,
        updates_color,
        updates_label,
        total_color,
        total_millis,
        avg_color,
        avg_label,
        as_color(roots),
        stats.roots,
        as_color(scopes),
        (100 * stats.scopes / stats.count) as f32 / 100.0,
        full_stats_disclaimer
    )
}
