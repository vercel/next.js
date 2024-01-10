//! Parses a raw trace file and outputs a new-line separated JSON file
//! compatible with the chrome tracing format.
//!
//! https://ui.perfetto.dev/ can be used to visualize the output file.
//!
//! ## Usage:
//!
//! ```sh
//! turbopack-convert-trace [/path/to/trace.log]
//! ```
//!
//! ## Options:
//!
//! - `--single`: Shows all cpu time as it would look like when a single cpu
//!   would execute the workload.
//! - `--merged`: Shows all cpu time scaled by the concurrency.
//! - `--threads`: Shows cpu time distributed on infinite virtual cpus/threads.
//! - `--idle`: Adds extra info spans when cpus are idle.
//! - `--graph`: Collapse spans with the same name into a single span per
//!   parent.
//! - `--collapse-names`: Collapse spans with the same type into a single span
//!   per parent.
//!
//! Default is `--merged`.

#![feature(iter_intersperse)]

use std::{
    borrow::Cow,
    cmp::{max, min, Reverse},
    collections::{hash_map::Entry, HashMap, HashSet},
    eprintln,
    io::{stderr, Write},
    mem::take,
    ops::Range,
    time::Instant,
};

use indexmap::IndexMap;
use intervaltree::{Element, IntervalTree};
use turbopack_trace_utils::tracing::{TraceRow, TraceValue};

macro_rules! pjson {
    ($($tt:tt)*) => {
        println!(",");
        print!($($tt)*);
    }
}

fn main() {
    // Read first argument from argv
    let mut args: HashSet<String> = std::env::args().skip(1).collect();
    let single = args.remove("--single");
    let mut merged = args.remove("--merged");
    let threads = args.remove("--threads");
    let idle = args.remove("--idle");
    let graph = args.remove("--graph");
    let show_count = args.remove("--count");
    let collapse_names = args.remove("--collapse-names");
    let collapse_min_count = 1;
    if !single && !merged && !threads && !show_count {
        merged = true;
    }
    let arg = args
        .iter()
        .next()
        .map_or(".turbopack/trace.log", String::as_str);

    eprint!("Reading content from {}...", arg);
    let start = Instant::now();

    // Read file to string
    let file = std::fs::read(arg).unwrap();
    eprintln!(
        " done ({} MiB, {:.3}s)",
        file.len() / 1024 / 1024,
        start.elapsed().as_secs_f32()
    );

    eprint!("Parsing trace from content...");
    let start = Instant::now();

    let mut trace_rows = Vec::new();
    let mut current = &file[..];
    while !current.is_empty() {
        match postcard::take_from_bytes(current) {
            Ok((row, remaining)) => {
                trace_rows.push(row);
                current = remaining;
            }
            Err(err) => {
                eprintln!(
                    "Error parsing trace data at {} bytes: {err}",
                    file.len() - current.len()
                );
                break;
            }
        }
    }
    eprintln!(
        " done ({} items, {:.3}s)",
        trace_rows.len(),
        start.elapsed().as_secs_f32()
    );

    eprint!(
        "Analysing trace into span tree... 0 / {} (0%)",
        trace_rows.len()
    );
    let start = Instant::now();

    let mut spans = Vec::new();
    spans.push(Span {
        parent: 0,
        count: 1,
        name: "".into(),
        target: "".into(),
        start: 0,
        end: 0,
        self_start: None,
        self_time: 0,
        items: Vec::new(),
        values: IndexMap::new(),
    });

    let mut active_ids = HashMap::new();

    fn ensure_span(active_ids: &mut HashMap<u64, usize>, spans: &mut Vec<Span>, id: u64) -> usize {
        match active_ids.entry(id) {
            Entry::Occupied(entry) => *entry.get(),
            Entry::Vacant(entry) => {
                let internal_id = spans.len();
                entry.insert(internal_id);
                let span = Span {
                    parent: 0,
                    count: 1,
                    name: "".into(),
                    target: "".into(),
                    start: 0,
                    end: 0,
                    self_start: None,
                    self_time: 0,
                    items: Vec::new(),
                    values: IndexMap::new(),
                };
                spans.push(span);
                internal_id
            }
        }
    }

    let mut all_self_times = Vec::new();
    let mut name_counts: HashMap<Cow<'_, str>, usize> = HashMap::new();
    let mut name_self_times: HashMap<Cow<'_, str>, u64> = HashMap::new();
    let mut tasks = 0;

    fn get_name<'a>(
        name: Cow<'a, str>,
        values: &IndexMap<Cow<'a, str>, TraceValue<'a>>,
        collapse_names: bool,
    ) -> Cow<'a, str> {
        match &*name {
            "turbo_tasks::function" => {
                if let Some(v) = values.get("name") {
                    return format!("{v} ({name})").into();
                }
            }
            "turbo_tasks::resolve_call" | "turbo_tasks::resolve_trait_call" => {
                if let Some(v) = values.get("name") {
                    return format!("*{v} ({name})").into();
                }
            }
            _ => {}
        }
        if collapse_names || values.is_empty() {
            return name;
        }
        let mut name = name.to_string();
        name.push_str(" (");
        for (i, (key, value)) in values.iter().enumerate() {
            use std::fmt::Write;
            if i > 0 {
                name.push_str(", ");
            }
            write!(name, "{key}={value}").unwrap();
        }
        name.push(')');
        name.into()
    }

    let number_of_trace_rows = trace_rows.len();
    for (i, data) in trace_rows.into_iter().enumerate() {
        if i % 131072 == 0 {
            eprint!(
                "\rAnalysing trace into span tree... {} / {} ({}%)",
                i,
                number_of_trace_rows,
                i * 100 / number_of_trace_rows
            );
            let _ = stderr().flush();
        }
        match data {
            TraceRow::Start {
                ts,
                id,
                parent,
                name,
                target,
                values,
            } => {
                let values = values.into_iter().collect();
                if matches!(
                    &*name,
                    "turbo_tasks::function"
                        | "turbo_tasks::resolve_call"
                        | "turbo_tasks::resolve_trait_call"
                ) {
                    tasks += 1;
                }
                let name = get_name(name, &values, collapse_names && parent.is_some());
                let internal_id = ensure_span(&mut active_ids, &mut spans, id);
                spans[internal_id].name = name.clone();
                spans[internal_id].target = target;
                spans[internal_id].start = ts;
                spans[internal_id].end = ts;
                spans[internal_id].values = values;
                let internal_parent =
                    parent.map_or(0, |id| ensure_span(&mut active_ids, &mut spans, id));
                spans[internal_id].parent = internal_parent;
                let parent = &mut spans[internal_parent];
                parent.items.push(SpanItem::Child(internal_id));
                *name_counts.entry(name).or_default() += 1;
            }
            TraceRow::End { ts, id } => {
                // id might be reused
                if let Some(internal_id) = active_ids.remove(&id) {
                    let span = &mut spans[internal_id];
                    span.end = ts;
                }
            }
            TraceRow::Enter { ts, id, thread_id } => {
                let internal_id = ensure_span(&mut active_ids, &mut spans, id);
                let mut parent_id = spans[internal_id].parent;
                let mut in_parent = 0;
                loop {
                    let parent = &mut spans[parent_id];
                    if let Some(SelfTimeStarted {
                        ts: ref mut parent_ts,
                        thread_id: parent_thread_id,
                        ..
                    }) = parent.self_start
                    {
                        if parent_thread_id == thread_id {
                            let ts_start = *parent_ts;
                            *parent_ts = ts;
                            add_self_time(
                                ts_start,
                                ts,
                                internal_id,
                                parent,
                                &mut all_self_times,
                                &mut name_self_times,
                            );
                            in_parent = parent_id;
                            break;
                        }
                    }
                    if parent_id == 0 {
                        break;
                    }
                    parent_id = parent.parent;
                }
                let span = &mut spans[internal_id];
                span.self_start = Some(SelfTimeStarted {
                    ts,
                    thread_id,
                    in_parent,
                });
            }
            TraceRow::Exit {
                ts,
                id,
                thread_id: _,
            } => {
                let internal_id = ensure_span(&mut active_ids, &mut spans, id);
                let span = &mut spans[internal_id];
                if let Some(SelfTimeStarted {
                    ts: ts_start,
                    in_parent,
                    ..
                }) = span.self_start.take()
                {
                    add_self_time(
                        ts_start,
                        ts,
                        internal_id,
                        span,
                        &mut all_self_times,
                        &mut name_self_times,
                    );
                    if in_parent > 0 {
                        let parent_id = span.parent;
                        let span = &mut spans[parent_id];
                        if let Some(SelfTimeStarted {
                            ts: ref mut parent_ts,
                            ..
                        }) = span.self_start
                        {
                            *parent_ts = max(ts, ts_start);
                        }
                    }
                }
            }
            TraceRow::Event { ts, parent, values } => {
                let mut values = values.into_iter().collect::<IndexMap<_, _>>();
                let duration = values.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
                let name: Cow<'_, str> = values
                    .remove("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string().into()))
                    .unwrap_or("event".into());
                let internal_parent =
                    parent.map_or(0, |id| ensure_span(&mut active_ids, &mut spans, id));
                *name_counts.entry(name.clone()).or_default() += 1;
                let internal_id = spans.len();
                let start = ts - duration;
                spans.push(Span {
                    parent: internal_parent,
                    count: 1,
                    name,
                    target: "event".into(),
                    start,
                    end: ts,
                    self_start: None,
                    self_time: 0,
                    items: vec![SpanItem::SelfTime { start, duration }],
                    values,
                });
                if duration > 0 {
                    all_self_times.push(Element {
                        range: start..ts,
                        value: internal_id,
                    });
                }
                let parent = &mut spans[internal_parent];
                parent.items.push(SpanItem::Child(internal_id));
            }
            TraceRow::Allocation { .. } => {
                // ignore
            }
        }
    }

    eprintln!(
        "\rAnalysing trace into span tree... {} / {} done ({} spans, {:.3}s)",
        number_of_trace_rows,
        number_of_trace_rows,
        spans.len(),
        start.elapsed().as_secs_f64()
    );

    if !active_ids.is_empty() {
        let active_spans = active_ids
            .into_values()
            .map(|id| &spans[id])
            .filter(|span| span.end == span.start)
            .filter(|span| {
                !span.items.iter().any(|item| {
                    if let &SpanItem::Child(c) = item {
                        spans[c].end == spans[c].start
                    } else {
                        false
                    }
                })
            })
            .collect::<Vec<_>>();
        if !active_spans.is_empty() {
            eprintln!("{} spans still active:", active_spans.len());
            for span in active_spans {
                let mut parents = Vec::new();
                let mut current = span;
                loop {
                    parents.push(current);
                    if current.parent == 0 {
                        break;
                    }
                    current = &spans[current.parent];
                }
                let mut parents = parents
                    .iter()
                    .rev()
                    .map(|span| &*span.name)
                    .collect::<Vec<_>>();
                if parents.len() > 10 {
                    parents.drain(5..parents.len() - 5);
                    parents.insert(5, "...")
                }
                let message = parents
                    .into_iter()
                    .intersperse("\n  > ")
                    .collect::<String>();
                eprintln!("- {}", message);
            }
        }
    }

    let mut name_self_times_per_execution = name_self_times
        .iter()
        .filter_map(|(name, time)| {
            name_counts
                .get(name)
                .map(|count| (name.clone(), *time / *count as u64))
        })
        .collect::<Vec<_>>();
    name_self_times_per_execution.sort_by_key(|(_, time)| Reverse(*time));

    let mut name_counts: Vec<(Cow<'_, str>, usize)> = name_counts.into_iter().collect();
    name_counts.sort_by_key(|(_, count)| Reverse(*count));

    eprintln!("Total number of tasks: {}", tasks);

    eprintln!("Top 10 span names:");
    for (name, count) in name_counts.into_iter().take(10) {
        eprintln!("{} x {}", count, name);
    }
    eprintln!();

    let mut name_self_times: Vec<(Cow<'_, str>, u64)> = name_self_times.into_iter().collect();
    name_self_times.sort_by_key(|(_, duration)| Reverse(*duration));

    eprintln!("Top 10 span durations:");
    for (name, duration) in name_self_times.into_iter().take(10) {
        eprintln!("{}s {}", duration / 1000 / 1000, name);
    }
    eprintln!();

    eprintln!("Top 10 span durations per execution:");
    for (name, duration) in name_self_times_per_execution.into_iter().take(10) {
        eprintln!("{}ms {}", duration / 1000, name);
    }
    eprintln!();

    println!("[");
    print!(r#"{{"ph":"M","pid":1,"name":"thread_name","tid":0,"args":{{"name":"Single CPU"}}}}"#);
    pjson!(r#"{{"ph":"M","pid":2,"name":"thread_name","tid":0,"args":{{"name":"Scaling CPU"}}}}"#);

    let busy_len = all_self_times.len();
    let busy: IntervalTree<u64, usize> = all_self_times.into_iter().collect::<IntervalTree<_, _>>();

    if threads {
        eprint!("Distributing time into virtual threads...");
        let start = Instant::now();
        let mut virtual_threads = Vec::new();

        let find_thread = |virtual_threads: &mut Vec<VirtualThread>,
                           stack: &[usize],
                           start: u64| {
            let idle_threads = virtual_threads
                .iter()
                .enumerate()
                .filter(|(_, thread)| thread.ts <= start)
                .collect::<Vec<_>>();
            for (index, id) in stack.iter().enumerate() {
                for &(i, thread) in &idle_threads {
                    if thread.stack.len() > index && thread.stack[index] == *id {
                        return i;
                    }
                }
            }
            if let Some((index, _)) = idle_threads.into_iter().max_by_key(|(_, thread)| thread.ts) {
                return index;
            }
            virtual_threads.push(VirtualThread {
                stack: Vec::new(),
                ts: 0,
            });
            let index = virtual_threads.len() - 1;
            pjson!(
                r#"{{"ph":"M","pid":3,"name":"thread_name","tid":{index},"args":{{"name":"Virtual Thread"}}}}"#
            );
            index
        };

        let get_stack = |mut id: usize| {
            let mut stack = Vec::new();
            while id != 0 {
                let span = &spans[id];
                stack.push(id);
                id = span.parent;
            }
            stack.reverse();
            stack
        };

        for (
            i,
            &Element {
                range: Range { start, end },
                value: id,
            },
        ) in busy.iter_sorted().enumerate()
        {
            if i % 1000 == 0 {
                eprint!("\rDistributing time into virtual threads... {i} / {busy_len}",);
                let _ = stderr().flush();
            }
            let stack = get_stack(id);
            let thread = find_thread(&mut virtual_threads, &stack, start);

            let virtual_thread = &mut virtual_threads[thread];
            let ts = virtual_thread.ts;
            let thread_stack = &mut virtual_thread.stack;

            let long_idle = virtual_thread.ts + 10000 < start;

            // Leave old spans on that thread
            while !thread_stack.is_empty()
                && (long_idle || thread_stack.last() != stack.get(thread_stack.len() - 1))
            {
                let id = thread_stack.pop().unwrap();
                let span = &spans[id];
                pjson!(
                    r#"{{"ph":"E","pid":3,"ts":{ts},"name":{},"cat":{},"tid":{thread},"_id":{id},"_stack":"{:?}"}}"#,
                    serde_json::to_string(&span.name).unwrap(),
                    serde_json::to_string(&span.target).unwrap(),
                    stack.get(thread_stack.len())
                );
            }

            // Advance thread time to start
            if virtual_thread.ts + 100 < start {
                if !thread_stack.is_empty() {
                    pjson!(
                        r#"{{"ph":"B","pid":3,"ts":{ts},"name":"idle","cat":"idle","tid":{thread}}}"#,
                    );
                    pjson!(
                        r#"{{"ph":"E","pid":3,"ts":{start},"name":"idle","cat":"idle","tid":{thread}}}"#,
                    );
                }
                virtual_thread.ts = start;
            }

            // Enter new spans on that thread
            for id in stack[thread_stack.len()..].iter() {
                thread_stack.push(*id);
                let span = &spans[*id];
                pjson!(
                    r#"{{"ph":"B","pid":3,"ts":{start},"name":{},"cat":{},"tid":{thread},"_id":{id}}}"#,
                    serde_json::to_string(&span.name).unwrap(),
                    serde_json::to_string(&span.target).unwrap(),
                );
            }

            virtual_thread.ts = end;
        }

        // Leave all threads
        for (i, VirtualThread { ts, mut stack }) in virtual_threads.into_iter().enumerate() {
            while let Some(id) = stack.pop() {
                let span = &spans[id];
                pjson!(
                    r#"{{"ph":"E","pid":3,"ts":{ts},"name":{},"cat":{},"tid":{i}}}"#,
                    serde_json::to_string(&span.name).unwrap(),
                    serde_json::to_string(&span.target).unwrap(),
                );
            }
        }
        eprintln!(" done ({:.3}s)", start.elapsed().as_secs_f32());
    }

    if single || merged || show_count {
        let number_of_spans = spans.len();
        eprint!("Emitting span tree... 0 / {} (0%)", number_of_spans);
        let mut span_counter = 0;
        let mut add_to_span_counter = {
            let span_counter = &mut span_counter;
            || {
                *span_counter += 1;
                if *span_counter % 16384 == 0 {
                    eprint!(
                        "\rEmitting span tree... {} / {} ({}%)",
                        *span_counter,
                        number_of_spans,
                        *span_counter * 100 / number_of_spans
                    );
                    let _ = stderr().flush();
                }
            }
        };
        let start = Instant::now();

        const CONCURRENCY_FIXED_POINT_FACTOR: u64 = 100;
        const CONCURRENCY_FIXED_POINT_FACTOR_F: f32 = 100.0;

        let get_concurrency = |range: Range<u64>| {
            if range.end <= range.start {
                return CONCURRENCY_FIXED_POINT_FACTOR;
            }
            let mut sum = 0;
            for interval in busy.query(range.clone()) {
                let start = max(interval.range.start, range.start);
                let end = min(interval.range.end, range.end);
                sum += end - start;
            }
            CONCURRENCY_FIXED_POINT_FACTOR * sum / (range.end - range.start)
        };

        let target_concurrency = 2 * CONCURRENCY_FIXED_POINT_FACTOR;
        let warn_concurrency = 4 * CONCURRENCY_FIXED_POINT_FACTOR;

        enum Task {
            Enter {
                id: usize,
                root: bool,
            },
            Exit {
                name_json: String,
                target_json: String,
                start: u64,
                start_scaled: u64,
            },
            SelfTime {
                duration: u64,
                concurrency: u64,
            },
        }
        let mut ts = 0;
        let mut tts = 0;
        let mut merged_ts = 0;
        let mut merged_tts = 0;
        let mut count_ts = 0;
        let mut stack = spans
            .iter()
            .enumerate()
            .skip(1)
            .rev()
            .filter_map(|(id, span)| {
                if span.parent == 0 {
                    add_to_span_counter();
                    Some(Task::Enter { id, root: true })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        while let Some(task) = stack.pop() {
            match task {
                Task::Enter { id, root } => {
                    let mut span = take(&mut spans[id]);
                    let mut count = span.count;
                    let mut items = take(&mut span.items);
                    if graph && !items.is_empty() {
                        let parent_name = &*span.name;
                        let mut groups = IndexMap::new();
                        let mut self_items = 0;
                        fn add_items_to_groups<'a>(
                            groups: &mut IndexMap<(Cow<'a, str>, usize), Vec<SpanItem>>,
                            self_items: &mut usize,
                            spans: &mut Vec<Span<'a>>,
                            parent_count: &mut u32,
                            parent_name: &str,
                            items: Vec<SpanItem>,
                            add_to_span_counter: &mut impl FnMut(),
                        ) {
                            for item in items {
                                match item {
                                    SpanItem::SelfTime { .. } => {
                                        if let Some(((key, _), last)) = groups.last_mut() {
                                            if key == &Cow::Borrowed("SELF_TIME") {
                                                last.push(item);
                                                continue;
                                            }
                                        }
                                        groups.insert(
                                            (Cow::Borrowed("SELF_TIME"), *self_items),
                                            vec![item],
                                        );
                                        *self_items += 1;
                                    }
                                    SpanItem::Child(id) => {
                                        let key = spans[id].name.clone();
                                        if key == parent_name {
                                            // Recursion
                                            *parent_count += 1;
                                            let items = take(&mut spans[id].items);
                                            add_items_to_groups(
                                                groups,
                                                self_items,
                                                spans,
                                                parent_count,
                                                parent_name,
                                                items,
                                                add_to_span_counter,
                                            );
                                            add_to_span_counter();
                                        } else {
                                            let group = groups.entry((key, 0)).or_default();
                                            if !group.is_empty() {
                                                add_to_span_counter();
                                            }
                                            group.push(item);
                                        }
                                    }
                                }
                            }
                        }
                        add_items_to_groups(
                            &mut groups,
                            &mut self_items,
                            &mut spans,
                            &mut count,
                            parent_name,
                            items,
                            &mut add_to_span_counter,
                        );
                        let groups = groups.into_values().collect::<Vec<_>>();
                        let mut new_items = Vec::new();
                        for group in groups {
                            if group.len() >= collapse_min_count {
                                let mut group = group.into_iter();
                                let new_item = group.next().unwrap();
                                match new_item {
                                    SpanItem::SelfTime { .. } => {
                                        new_items.push(new_item);
                                        new_items.extend(group);
                                    }
                                    SpanItem::Child(new_item_id) => {
                                        new_items.push(new_item);
                                        let mut count = 1;
                                        for item in group {
                                            let SpanItem::Child(id) = item else {
                                                unreachable!();
                                            };
                                            assert!(spans[id].name == spans[new_item_id].name);
                                            let old_items = take(&mut spans[id].items);
                                            spans[new_item_id].items.extend(old_items);
                                            count += 1;
                                        }
                                        if count != 1 {
                                            let span = &mut spans[new_item_id];
                                            span.count = count;
                                        }
                                    }
                                }
                            } else {
                                new_items.extend(group);
                            }
                        }
                        items = new_items;
                    }
                    if root {
                        if ts < span.start {
                            ts = span.start;
                        }
                        if tts < span.start {
                            tts = span.start;
                        }
                        if merged_ts < span.start {
                            merged_ts = span.start;
                        }
                        if merged_tts < span.start {
                            merged_tts = span.start;
                        }
                    }
                    let name_json = if count == 1 {
                        serde_json::to_string(&span.name).unwrap()
                    } else {
                        serde_json::to_string(&format!("{count} x {}", span.name)).unwrap()
                    };
                    let target_json = serde_json::to_string(&span.target).unwrap();
                    let args_json = serde_json::to_string(&span.values).unwrap();
                    if single {
                        pjson!(
                            r#"{{"ph":"B","pid":1,"ts":{ts},"tts":{tts},"name":{name_json},"cat":{target_json},"tid":0,"args":{args_json}}}"#,
                        );
                    }
                    if merged {
                        pjson!(
                            r#"{{"ph":"B","pid":2,"ts":{merged_ts},"tts":{merged_tts},"name":{name_json},"cat":{target_json},"tid":0,"args":{args_json}}}"#,
                        );
                    }
                    if show_count {
                        pjson!(
                            r#"{{"ph":"B","pid":3,"ts":{count_ts},"name":{name_json},"cat":{target_json},"tid":0,"args":{args_json}}}"#,
                        );
                        count_ts += count;
                    }
                    stack.push(Task::Exit {
                        name_json,
                        target_json,
                        start: ts,
                        start_scaled: tts,
                    });

                    for item in items.iter().rev() {
                        match item {
                            SpanItem::SelfTime {
                                start, duration, ..
                            } => {
                                let range = *start..(start + duration);
                                let new_concurrency = get_concurrency(range);
                                let new_duration = *duration;
                                if let Some(Task::SelfTime {
                                    duration,
                                    concurrency,
                                }) = stack.last_mut()
                                {
                                    let total_duration = *duration + new_duration;
                                    if total_duration > 0 {
                                        *concurrency = ((*concurrency) * (*duration)
                                            + new_concurrency * new_duration)
                                            / total_duration;
                                        *duration += new_duration;
                                    }
                                } else {
                                    stack.push(Task::SelfTime {
                                        duration: new_duration,
                                        concurrency: max(
                                            CONCURRENCY_FIXED_POINT_FACTOR,
                                            new_concurrency,
                                        ),
                                    });
                                }
                            }
                            SpanItem::Child(id) => {
                                add_to_span_counter();
                                stack.push(Task::Enter {
                                    id: *id,
                                    root: false,
                                });
                            }
                        }
                    }
                }
                Task::Exit {
                    name_json,
                    target_json,
                    start,
                    start_scaled,
                } => {
                    if ts > start && tts > start_scaled {
                        let concurrency = (ts - start) * target_concurrency / (tts - start_scaled);
                        if single {
                            pjson!(
                                r#"{{"ph":"E","pid":1,"ts":{ts},"tts":{tts},"name":{name_json},"cat":{target_json},"tid":0,"args":{{"concurrency":{}}}}}"#,
                                concurrency as f32 / CONCURRENCY_FIXED_POINT_FACTOR_F,
                            );
                        }
                        if merged {
                            pjson!(
                                r#"{{"ph":"E","pid":2,"ts":{merged_ts},"tts":{merged_tts},"name":{name_json},"cat":{target_json},"tid":0,"args":{{"concurrency":{}}}}}"#,
                                concurrency as f32 / CONCURRENCY_FIXED_POINT_FACTOR_F,
                            );
                        }
                    } else {
                        if single {
                            pjson!(
                                r#"{{"ph":"E","pid":1,"ts":{ts},"tts":{tts},"name":{name_json},"cat":{target_json},"tid":0}}"#,
                            );
                        }
                        if merged {
                            pjson!(
                                r#"{{"ph":"E","pid":2,"ts":{merged_ts},"tts":{merged_tts},"name":{name_json},"cat":{target_json},"tid":0}}"#,
                            );
                        }
                    }
                    if show_count {
                        pjson!(
                            r#"{{"ph":"E","pid":3,"ts":{count_ts},"name":{name_json},"cat":{target_json},"tid":0}}"#,
                        );
                    }
                }
                Task::SelfTime {
                    duration,
                    concurrency,
                } => {
                    let scaled_duration =
                        (duration * target_concurrency + concurrency - 1) / concurrency;
                    let merged_duration = (duration * 100 + concurrency - 1) / concurrency;
                    let merged_scaled_duration =
                        (merged_duration * target_concurrency + concurrency - 1) / concurrency;
                    let target_duration = duration * concurrency / warn_concurrency;
                    let merged_target_duration = merged_duration * concurrency / warn_concurrency;
                    if idle && concurrency <= warn_concurrency {
                        let target = ts + target_duration;
                        let merged_target = merged_ts + merged_target_duration;
                        if single {
                            pjson!(
                                r#"{{"ph":"B","pid":1,"ts":{target},"tts":{tts},"name":"idle cpus","cat":"low concurrency","tid":0,"args":{{"concurrency":{}}}}}"#,
                                concurrency as f32 / CONCURRENCY_FIXED_POINT_FACTOR_F,
                            );
                        }
                        if merged {
                            pjson!(
                                r#"{{"ph":"B","pid":2,"ts":{merged_target},"tts":{merged_tts},"name":"idle cpus","cat":"low concurrency","tid":0,"args":{{"concurrency":{}}}}}"#,
                                concurrency as f32 / CONCURRENCY_FIXED_POINT_FACTOR_F,
                            );
                        }
                    }
                    ts += duration;
                    tts += scaled_duration;
                    merged_ts += merged_duration;
                    merged_tts += merged_scaled_duration;
                    if idle && concurrency <= warn_concurrency {
                        if single {
                            pjson!(
                                r#"{{"ph":"E","pid":1,"ts":{ts},"tts":{tts},"name":"idle cpus","cat":"low concurrency","tid":0}}"#,
                            );
                        }
                        if merged {
                            pjson!(
                                r#"{{"ph":"E","pid":2,"ts":{merged_ts},"tts":{merged_tts},"name":"idle cpus","cat":"low concurrency","tid":0}}"#,
                            );
                        }
                    }
                }
            }
        }
        eprintln!(
            "\rEmitting span tree... {} / {} done ({:.3}s)",
            spans.len(),
            spans.len(),
            start.elapsed().as_secs_f64()
        );
    }
    println!();
    println!("]");
}

fn add_self_time<'a>(
    ts_start: u64,
    ts: u64,
    internal_id: usize,
    span: &mut Span<'a>,
    all_self_times: &mut Vec<Element<u64, usize>>,
    name_self_times: &mut HashMap<Cow<'a, str>, u64>,
) {
    let (start, end) = if ts_start > ts {
        (ts, ts_start)
    } else {
        (ts_start, ts)
    };
    let duration = end.saturating_sub(start);
    span.items.push(SpanItem::SelfTime { start, duration });
    if duration > 0 {
        all_self_times.push(Element {
            range: start..end,
            value: internal_id,
        });
    }
    span.self_time += duration;
    *name_self_times.entry(span.name.clone()).or_default() += duration;
}

#[derive(Debug)]
struct SelfTimeStarted {
    ts: u64,
    thread_id: u64,
    in_parent: usize,
}

#[derive(Debug, Default)]
struct Span<'a> {
    parent: usize,
    count: u32,
    name: Cow<'a, str>,
    target: Cow<'a, str>,
    start: u64,
    end: u64,
    self_start: Option<SelfTimeStarted>,
    self_time: u64,
    items: Vec<SpanItem>,
    values: IndexMap<Cow<'a, str>, TraceValue<'a>>,
}

#[derive(Debug, Clone)]
enum SpanItem {
    SelfTime { start: u64, duration: u64 },
    Child(usize),
}

#[derive(Debug)]
struct VirtualThread {
    ts: u64,
    stack: Vec<usize>,
}
