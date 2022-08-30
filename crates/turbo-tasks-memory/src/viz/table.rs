use turbo_tasks::util::FormatDuration;

use super::*;

pub fn wrap_html(table_html: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset=\"utf-8\">
  <title>turbo-tasks table</title>
  <style>{style}</style>
</head>
<body>
  {table_html}
  <script>{script}</script>
</body>
</html>"#,
        script = r#"// https://github.com/tofsjonas/sortable
document.addEventListener("click",function(b){try{var p=function(a){return v&&a.getAttribute("data-sort-alt")||a.getAttribute("data-sort")||a.innerText},q=function(a,c){a.className=a.className.replace(w,"")+c},e=function(a,c){return a.nodeName===c?a:e(a.parentNode,c)},w=/ dir-(u|d) /,v=b.shiftKey||b.altKey,f=e(b.target,"TH"),r=e(f,"TR"),g=e(r,"TABLE");if(/\bsortable\b/.test(g.className)){var h,d=r.cells;for(b=0;b<d.length;b++)d[b]===f?h=b:q(d[b],"");d=" dir-d ";-1!==f.className.indexOf(" dir-d ")&&
(d=" dir-u ");q(f,d);var k=g.tBodies[0],l=[].slice.call(k.rows,0),t=" dir-u "===d;l.sort(function(a,c){var m=p((t?a:c).cells[h]),n=p((t?c:a).cells[h]);return isNaN(m-n)?m.localeCompare(n):m-n});for(var u=k.cloneNode();l.length;)u.appendChild(l.splice(0,1)[0]);g.replaceChild(u,k)}}catch(a){}});"#,
        style = r#"body{margin:0;font-family:monospace;}.sortable thead{position:sticky;top:0}.sortable{border-spacing:0}.sortable td,.sortable th{padding:10px}.sortable th{background:gray;color:#fff;cursor:pointer;font-weight:normal;text-align:left;text-transform:capitalize;vertical-align:baseline;white-space:nowrap}.sortable th:hover{color:#000}.sortable th:hover::after{color:inherit;font-size:1.2em;content:' \025B8'}.sortable th::after{font-size:1.2em;color:transparent;content:' \025B8'}.sortable th.dir-d{color:#000}.sortable th.dir-d::after{color:inherit;content:' \025BE'}.sortable th.dir-u{color:#000}.sortable th.dir-u::after{color:inherit;content:' \025B4'}"#
    )
}

pub fn create_table(root: GroupTree) -> String {
    let max_values = get_max_values(&root);
    let mut out = String::new();
    out += r#"<table class="sortable"><thead><tr>"#;
    out += r#"<th>function</th>"#;
    out += r#"<th>initial executions</th>"#;
    out += r#"<th>active</th>"#;
    out += r#"<th>reexecutions</th>"#;
    out += r#"<th>total duration</th>"#;
    out += r#"<th>total current duration</th>"#;
    out += r#"<th>total update duration</th>"#;
    out += r#"<th>avg duration</th>"#;
    out += r#"<th>max duration</th>"#;
    out += r#"<th>root scopes</th>"#;
    out += r#"<th>avg scopes</th>"#;
    out += r#"<th>avg dependencies</th>"#;
    out += r#"<th>depth</th>"#;
    out += r#"<th>common parent</th>"#;
    out += r#"</tr></thead>"#;
    out += r#"<tbody>"#;
    let mut queue = Vec::new();
    queue.push((0, None, &root));
    fn add_task(
        out: &mut String,
        max_values: &MaxValues,
        depth: u32,
        parent: Option<&(TaskType, TaskStats)>,
        (ty, stats): &(TaskType, TaskStats),
    ) -> Result<(), std::fmt::Error> {
        *out += r#"<tr>"#;
        let name = ty.to_string();
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_hash_color(&name),
            escape_html(&name)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(stats.count, max_values.count),
            stats.count
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(stats.active_count, max_values.active_count),
            stats.active_count
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(
                stats.executions.saturating_sub(stats.count),
                max_values.updates
            ),
            stats.executions.saturating_sub(stats.count)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\" data-sort=\"{}\">{}</td>",
            as_frac_color(
                stats.total_duration.as_millis(),
                max_values.total_duration.as_millis(),
            ),
            stats.total_duration.as_micros(),
            FormatDuration(stats.total_duration)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\" data-sort=\"{}\">{}</td>",
            as_frac_color(
                stats.total_current_duration.as_millis(),
                max_values.total_current_duration.as_millis(),
            ),
            stats.total_current_duration.as_micros(),
            FormatDuration(stats.total_current_duration)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\" data-sort=\"{}\">{}</td>",
            as_frac_color(
                stats.total_update_duration.as_millis(),
                max_values.total_update_duration.as_millis(),
            ),
            stats.total_update_duration.as_micros(),
            FormatDuration(stats.total_update_duration)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\" data-sort=\"{}\">{}</td>",
            as_frac_color(
                stats.total_duration.as_micros() / (stats.executions as u128),
                max_values.avg_duration.as_micros()
            ),
            (stats.total_duration / (stats.executions as u32)).as_micros(),
            FormatDuration(stats.total_duration / (stats.executions as u32))
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\" data-sort=\"{}\">{}</td>",
            as_frac_color(
                stats.max_duration.as_millis(),
                max_values.max_duration.as_millis(),
            ),
            stats.max_duration.as_micros(),
            FormatDuration(stats.max_duration)
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(stats.roots, max_values.roots),
            stats.roots
        )?;
        let max_scopes = max_values.scopes.saturating_sub(100);
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(
                (100 * stats.scopes / stats.count).saturating_sub(100),
                max_scopes
            ),
            (100 * stats.scopes / stats.count) as f32 / 100.0
        )?;
        let dependencies = get_avg_dependencies_count_times_100(stats);
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(dependencies, max_values.dependencies),
            (dependencies as f32) / 100.0
        )?;
        write!(
            out,
            "<td bgcolor=\"{}\">{}</td>",
            as_frac_color(depth, max_values.depth),
            depth
        )?;
        if let Some((ty, _)) = parent {
            let name = ty.to_string();
            write!(
                out,
                "<td bgcolor=\"{}\">{}</td>",
                as_hash_color(&name),
                escape_html(&name)
            )?;
        } else {
            write!(out, "<td></td>",)?;
        }
        *out += r#"</tr>"#;
        Ok(())
    }
    while let Some((depth, parent, node)) = queue.pop() {
        let GroupTree {
            primary,
            children,
            task_types,
        } = node;
        if let Some(primary) = primary {
            add_task(&mut out, &max_values, depth, parent, primary).unwrap();
        }
        for task in task_types.iter() {
            add_task(&mut out, &max_values, depth + 1, primary.as_ref(), task).unwrap();
        }
        for child in children.iter() {
            queue.push((depth + 1, primary.as_ref(), child));
        }
    }
    out += r#"</tbody>"#;
    out += r#"</table>"#;
    out
}
