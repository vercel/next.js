//! Golden tests over every derived value the viewer and the query API render.
//!
//! The memory work ahead rewrites how spans are stored: events and args move
//! into arenas, the lazily-computed half moves into side arrays keyed by chunk,
//! `SpanEvent` loses a field, and index widths narrow. None of that is supposed
//! to change a single number the client sees — but nothing in the crate's other
//! tests would notice if it did. These tests are that safety net.
//!
//! Two kinds of test live here, and they are treated differently.
//!
//! 1. **Snapshot tests**, comparing [`dump`] and the query/viewer output against the checked-in
//!    `golden_*_expected.txt` files. These are `#[ignore]`d, so they do not run in CI: they pin
//!    exact output, which means any intentional behaviour change fails them, and that speed bump
//!    should not land on an unrelated contributor's PR. Run them deliberately with `cargo test -p
//!    turbopack-trace-server --lib -- --ignored`. To accept a change, regenerate with
//!    `UPDATE_GOLDEN=1` added to that command and read the resulting `git diff` — the diff *is* the
//!    behaviour change, so it is the review.
//! 2. **Invariant tests**, which assert properties rather than pinned bytes and so run normally in
//!    CI. The important one is cache coherence: forcing every lazy value, invalidating, and forcing
//!    again must reproduce a store that was never queried at all. That catches a stale arena handle
//!    or a mis-encoded "unset" sentinel — the failure modes the upcoming stages introduce — and it
//!    cannot fail spuriously, because it compares two stores built in the same process rather than
//!    against a file.
//!
//! The fixture deliberately covers the awkward paths rather than the common
//! one: out-of-order self time, orphan-style late children, the
//! `CUT_OFF_DEPTH` re-parenting branch, incomplete spans, `add_args` arriving
//! after names were already computed, every arm of `compute_names`, and the
//! `set_parent` / `set_total_time` pair that only the Next.js JSON reader ever
//! calls (and which, without this, nothing exercises at all).

use std::{fmt::Write, sync::Arc};

use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;

use crate::{
    QueryOptions, SortMode, query_spans,
    server::ViewRect,
    span::{SpanArgs, SpanIndex},
    span_ref::{SpanEventRef, SpanRef},
    store::Store,
    store_container::StoreContainer,
    timestamp::Timestamp,
    viewer::Viewer,
};

const EXPECTED: &str = include_str!("golden_expected.txt");
const QUERY_EXPECTED: &str = include_str!("golden_query_expected.txt");
const VIEWER_EXPECTED: &str = include_str!("golden_viewer_expected.txt");

/// Compare against a checked-in snapshot, or rewrite it when `UPDATE_GOLDEN` is
/// set. Reports the first differing line rather than dumping two multi-kilobyte
/// strings, which is the difference between a usable failure and an unreadable
/// one.
fn compare_golden(label: &str, actual: &str, expected: &str, file: &str) {
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        let path = format!("{}/src/{file}", env!("CARGO_MANIFEST_DIR"));
        std::fs::write(&path, actual).expect("failed to write golden file");
        eprintln!("golden file rewritten: {path}");
        return;
    }
    if actual == expected {
        return;
    }
    let first_diff = actual
        .lines()
        .zip(expected.lines())
        .enumerate()
        .find(|(_, (a, b))| a != b);
    match first_diff {
        Some((line, (a, b))) => panic!(
            "{label} golden mismatch at line {}:\n  actual:   {a}\n  expected: {b}\n\nIf this \
             change is intended, regenerate with UPDATE_GOLDEN=1 cargo test -p \
             turbopack-trace-server and review the diff.",
            line + 1
        ),
        None => panic!(
            "{label} golden mismatch in length: actual {} lines, expected {} lines. Regenerate \
             with UPDATE_GOLDEN=1 and review the diff.",
            actual.lines().count(),
            expected.lines().count()
        ),
    }
}

fn args(pairs: &[(&str, &str)]) -> SpanArgs {
    pairs
        .iter()
        .map(|(k, v)| (RcStr::from(*k), RcStr::from(*v)))
        .collect()
}

fn ts(micros: u64) -> Timestamp {
    Timestamp::from_micros(micros)
}

fn span_at(store: &Store, index: usize) -> SpanRef<'_> {
    SpanRef {
        span: &store.spans[index],
        store,
        index,
    }
}

/// A deterministic store covering the paths the memory work touches.
///
/// Returns nothing: the assertions all run off [`dump`], so adding a span here
/// only requires regenerating the golden file, not editing assertions.
fn build_reference_store() -> Store {
    let mut store = Store::new();
    populate(&mut store);
    store
}

/// The same fixture behind a [`StoreContainer`], for the APIs that take one.
fn build_reference_container() -> Arc<StoreContainer> {
    let container = Arc::new(StoreContainer::new());
    populate(&mut container.write());
    container
}

/// Fail loudly if the environment changes what these snapshots pin.
///
/// The fixture needs no trace file and no fixtures on disk — it is built purely
/// through the `Store` API — but `Store::new` and `build_bottom_up_graph` both
/// read env vars at runtime. `NO_CORRECTED_TIME` matters most: it drops the
/// interval tree entirely, so every corrected time becomes a raw duration and
/// three of these tests fail. It is also exactly the variable someone working on
/// this crate plausibly has exported, since it is the standard workaround for
/// loading a huge trace. Without this guard that surfaces as three unrelated
/// snapshot diffs instead of as its actual cause.
fn assert_env_does_not_affect_fixture() {
    for var in ["NO_CORRECTED_TIME", "BOTTOM_UP_DEPTH"] {
        assert!(
            std::env::var_os(var).is_none(),
            "{var} is set in the environment, which changes the values these snapshots pin. Unset \
             it and re-run."
        );
    }
}

fn populate(store: &mut Store) {
    assert_env_does_not_affect_fixture();
    let mut outdated = FxHashSet::default();

    // ---- every arm of `compute_names` --------------------------------------
    // Function: category becomes the span name, title becomes the `name` arg,
    // and both names are identical — the clone-only arm, no `format!`.
    let func = store.add_span(
        None,
        ts(0),
        RcStr::from("turbopack"),
        RcStr::from("turbo_tasks::function"),
        args(&[("name", "module_graph"), ("extra", "1")]),
        &mut outdated,
    );
    // Resolve: both names are built with `format!`, differently.
    let resolve = store.add_span(
        Some(func),
        ts(1),
        RcStr::from("turbopack"),
        RcStr::from("turbo_tasks::resolve_call"),
        args(&[("name", "resolve_module")]),
        &mut outdated,
    );
    // Other + name arg: `nice_name` is formatted, `group_name` is generic.
    let other_named = store.add_span(
        Some(func),
        ts(2),
        RcStr::from("parse"),
        RcStr::from("parse_file"),
        args(&[("name", "index.js")]),
        &mut outdated,
    );
    // No `name` arg at all: both names fall back to (category, name).
    let unnamed = store.add_span(
        Some(func),
        ts(3),
        RcStr::from("io"),
        RcStr::from("read_file"),
        SpanArgs::new(),
        &mut outdated,
    );

    // ---- self time, deliberately out of chronological order ----------------
    // `LazySortedVec` sorts on first read, so the stored order must not matter.
    store.add_self_time(other_named, ts(60), ts(90), &mut outdated);
    store.add_self_time(other_named, ts(10), ts(30), &mut outdated);
    store.add_self_time(other_named, ts(40), ts(50), &mut outdated);
    // Overlapping self time across two spans, so the corrected-time interval
    // tree actually has to divide a range rather than pass it through.
    store.add_self_time(resolve, ts(20), ts(45), &mut outdated);
    store.add_self_time(unnamed, ts(25), ts(35), &mut outdated);
    // A zero-duration self time is dropped at construction; it must still move
    // `self_end` and `self_time` bookkeeping consistently.
    store.add_self_time(unnamed, ts(35), ts(35), &mut outdated);

    // ---- allocations, including a span with only deallocations -------------
    // Values are well above the 32-byte / 4-allocation tracing overhead that
    // `self_allocations()` subtracts, so the saturation is not what is tested.
    store.add_allocation(func, 4096, 40, &mut outdated);
    store.add_allocation(resolve, 2048, 20, &mut outdated);
    store.add_deallocation(resolve, 512, 5, &mut outdated);
    // Deallocations exceeding allocations: `self_persistent_allocations`
    // saturates to zero per span, which is why subtree persistent totals are
    // not derivable from the allocation and deallocation totals.
    store.add_deallocation(other_named, 8192, 80, &mut outdated);
    // `unnamed` gets nothing, so the "no allocation data" path is covered.

    store.complete_span(resolve);
    store.complete_span(other_named);
    // `unnamed` is deliberately left incomplete.

    // ---- a span whose args arrive after its names were computed ------------
    // `add_args` does not invalidate `names`, so this span must keep the name
    // it had at first touch. That is load-bearing behaviour, not a bug to fix
    // silently — the golden file pins it.
    let late_args = store.add_span(
        None,
        ts(100),
        RcStr::from("late"),
        RcStr::from("late_span"),
        SpanArgs::new(),
        &mut outdated,
    );
    // Force the name cache *before* the args land.
    let _ = span_at(store, late_args.get()).nice_name();
    store.add_args(late_args, args(&[("name", "arrived_late")]), &mut outdated);
    store.add_self_time(late_args, ts(100), ts(120), &mut outdated);
    store.complete_span(late_args);

    // ---- an "event" span: created, given self time, completed in one go ----
    // This is how `InternalRowType::Event` is handled, and it is the shape the
    // events arena can flush immediately without ever staging.
    let event = store.add_span(
        Some(func),
        ts(130),
        RcStr::from("event"),
        RcStr::from("instant"),
        args(&[("name", "tick")]),
        &mut outdated,
    );
    store.add_self_time(event, ts(130), ts(131), &mut outdated);
    store.complete_span(event);

    // ---- a child arriving after its parent already completed ---------------
    // Rows are only ordered per thread, so this happens in real traces. It is
    // the case that stops the events arena from assuming a completed span's
    // extent is final.
    let late_child = store.add_span(
        Some(resolve),
        ts(46),
        RcStr::from("io"),
        RcStr::from("late_child"),
        SpanArgs::new(),
        &mut outdated,
    );
    store.add_self_time(late_child, ts(46), ts(48), &mut outdated);
    store.complete_span(late_child);

    // ---- the CUT_OFF_DEPTH re-parenting branch -----------------------------
    // Depth is capped at 80; deeper spans are flattened onto an ancestor. Build
    // past the cap so both the normal and the flattened branch are covered.
    let mut parent = store.add_span(
        None,
        ts(200),
        RcStr::from("deep"),
        RcStr::from("chain"),
        SpanArgs::new(),
        &mut outdated,
    );
    let chain_root = parent;
    for i in 0..84u64 {
        parent = store.add_span(
            Some(parent),
            ts(201 + i),
            RcStr::from("deep"),
            RcStr::from("link"),
            SpanArgs::new(),
            &mut outdated,
        );
    }
    // Give the deepest span some self time so the chain contributes real
    // durations rather than only structure.
    store.add_self_time(parent, ts(290), ts(300), &mut outdated);
    store.complete_span(parent);
    store.complete_span(chain_root);

    // ---- the Next.js-only mutation paths ----------------------------------
    // Nothing else in the crate exercises these, and both are the awkward
    // cases for an events arena: one removes a child event from a parent's
    // run, the other replaces a run wholesale.
    let reparent_a = store.add_span(
        None,
        ts(400),
        RcStr::from("json"),
        RcStr::from("first_parent"),
        SpanArgs::new(),
        &mut outdated,
    );
    let reparent_b = store.add_span(
        None,
        ts(401),
        RcStr::from("json"),
        RcStr::from("second_parent"),
        SpanArgs::new(),
        &mut outdated,
    );
    let moved = store.add_span(
        Some(reparent_a),
        ts(402),
        RcStr::from("json"),
        RcStr::from("moved_child"),
        SpanArgs::new(),
        &mut outdated,
    );
    store.add_self_time(moved, ts(402), ts(410), &mut outdated);
    // Force the parents' caches before the move, so invalidation has something
    // real to clear.
    let _ = span_at(store, reparent_a.get()).total_time();
    let _ = span_at(store, reparent_b.get()).total_time();
    store.set_parent(moved, reparent_b, &mut outdated);
    store.complete_span(moved);

    // `set_total_time` rebuilds the whole event run from the child list,
    // synthesizing the self-time gaps between children.
    let totalled = store.add_span(
        None,
        ts(500),
        RcStr::from("json"),
        RcStr::from("totalled"),
        SpanArgs::new(),
        &mut outdated,
    );
    let totalled_child = store.add_span(
        Some(totalled),
        ts(520),
        RcStr::from("json"),
        RcStr::from("totalled_child"),
        SpanArgs::new(),
        &mut outdated,
    );
    store.add_self_time(totalled_child, ts(520), ts(540), &mut outdated);
    store.complete_span(totalled_child);
    store.set_total_time(totalled, ts(500), ts(100), &mut outdated);
    store.complete_span(totalled);

    store.complete_span(func);
    store.complete_span(reparent_a);
    store.complete_span(reparent_b);

    // Memory samples are indexed by timestamp and queried by range; include a
    // few so the query API has something to return.
    store.add_memory_sample(ts(10), 1_000_000, 5);
    store.add_memory_sample(ts(200), 4_000_000, 40);
    store.add_memory_sample(ts(500), 2_000_000, 12);

    // The reader calls this at the end of every read; the corrected-time tree
    // is a different shape before and after, so match production.
    store.optimize();

    // Apply the accumulated invalidations exactly as the reader does after a
    // batch, so the fixture starts from the same state a real ingest leaves.
    store.invalidate_outdated_spans(&outdated);
}

/// Render every derived value for every span, in index order.
///
/// Index order (rather than tree order) is deliberate: it keeps the output
/// stable when a change reorders children, and it makes a diff point at the
/// span that actually changed.
fn dump(store: &Store) -> String {
    let mut out = String::new();
    writeln!(out, "spans: {}", store.spans.len()).unwrap();

    for index in 0..store.spans.len() {
        let span = span_at(store, index);
        let (nice_cat, nice_title) = span.nice_name();
        let (group_cat, group_title) = span.group_name();

        writeln!(
            out,
            "[{index}] depth={} complete={} parent={:?}",
            store.spans[index].depth,
            span.is_complete(),
            span.parent().map(|p| p.index().get()),
        )
        .unwrap();
        writeln!(
            out,
            "    nice=({nice_cat}|{nice_title}) group=({group_cat}|{group_title})"
        )
        .unwrap();
        writeln!(
            out,
            "    start={} end={} self_time={} total_time={}",
            *span.start(),
            *span.end(),
            *span.self_time(),
            *span.total_time(),
        )
        .unwrap();
        writeln!(
            out,
            "    corrected_self={} corrected_total={}",
            *span.corrected_self_time(),
            *span.corrected_total_time(),
        )
        .unwrap();
        writeln!(
            out,
            "    max_depth={} span_count={} alloc={} dealloc={} persistent={} alloc_count={}",
            span.max_depth(),
            span.total_span_count(),
            span.total_allocations(),
            span.total_deallocations(),
            span.total_persistent_allocations(),
            span.total_allocation_count(),
        )
        .unwrap();

        let mut arg_list = String::new();
        for (k, v) in span.args() {
            write!(arg_list, " {k}={v}").unwrap();
        }
        writeln!(out, "    args:{arg_list}").unwrap();

        // The event sequence is the thing the arena rewrite is most likely to
        // perturb, so record order, kind and payload for every event.
        let mut event_list = String::new();
        for event in span.events() {
            match event {
                SpanEventRef::SelfTime { self_time } => write!(
                    event_list,
                    " S({}..{})",
                    *self_time.start(),
                    *self_time.end()
                )
                .unwrap(),
                SpanEventRef::Child { span } => {
                    write!(event_list, " C({})", span.index().get()).unwrap()
                }
            }
        }
        writeln!(out, "    events:{event_list}").unwrap();
    }

    out
}

/// Force every lazily-computed value on every span, in a fixed order.
fn force_all_caches(store: &Store) {
    for index in 0..store.spans.len() {
        let span = span_at(store, index);
        let _ = span.names();
        let _ = span.end();
        let _ = span.total_time();
        let _ = span.corrected_self_time();
        let _ = span.corrected_total_time();
        let _ = span.max_depth();
        let _ = span.total_span_count();
        let _ = span.total_allocations();
        let _ = span.total_deallocations();
        let _ = span.total_persistent_allocations();
        let _ = span.total_allocation_count();
    }
}

#[test]
#[ignore = "snapshot test: pins exact output, so an intentional behaviour change fails it. \
            Excluded from CI so it cannot block an unrelated PR. Run with `cargo test -p \
            turbopack-trace-server --lib -- --ignored`."]
fn golden_derived_values_are_stable() {
    let store = build_reference_store();
    compare_golden("derived", &dump(&store), EXPECTED, "golden_expected.txt");
}

#[test]
fn invalidate_then_recompute_matches_a_never_queried_store() {
    // A store whose caches were filled, wiped and refilled must be
    // indistinguishable from one that was queried exactly once. This is the
    // test that catches a mis-encoded "unset" sentinel or a cold side-array
    // that invalidation forgot to clear.
    let store = build_reference_store();
    force_all_caches(&store);

    let mut store = store;
    let all: FxHashSet<SpanIndex> = (1..store.spans.len())
        .map(|i| SpanIndex::new(i).unwrap())
        .collect();
    store.invalidate_outdated_spans(&all);

    let reference = build_reference_store();
    assert_eq!(
        dump(&store),
        dump(&reference),
        "recomputed values diverged from a fresh store"
    );
}

#[test]
fn repeated_reads_are_idempotent() {
    // Every accessor is a `get_or_init`, so reading twice must not change
    // anything. Cheap, but it is the property that lets the viewer render the
    // same rect repeatedly without drift.
    let store = build_reference_store();
    let first = dump(&store);
    let second = dump(&store);
    assert_eq!(first, second);
}

#[test]
fn cut_off_depth_flattens_the_deep_chain() {
    // Guards the fixture itself: if this stops holding, the golden file is no
    // longer covering the re-parenting branch and the coverage loss would be
    // silent.
    let store = build_reference_store();
    let max_depth = (0..store.spans.len())
        .map(|i| store.spans[i].depth)
        .max()
        .unwrap();
    assert_eq!(
        max_depth, 79,
        "expected the chain to be flattened at CUT_OFF_DEPTH - 1"
    );
}

#[test]
fn add_args_does_not_invalidate_already_computed_names() {
    // Documented behaviour (span.rs): names are never invalidated, so a span
    // whose args arrive after its first `names()` keeps the earlier name. The
    // name dedup table must preserve this, not "fix" it.
    let store = build_reference_store();
    let late = (0..store.spans.len())
        .map(|i| span_at(&store, i))
        .find(|s| s.nice_name().1.as_str() == "late_span")
        .expect("late_span not found");
    // Had the args invalidated the cache, the name would be "late_span arrived_late".
    assert_eq!(late.nice_name().0.as_str(), "late");
    assert_eq!(late.nice_name().1.as_str(), "late_span");
    assert!(late.args().any(|(k, v)| k == "name" && v == "arrived_late"));
}

/// Render a `query_spans` page. Only the fields a client actually consumes, so
/// the snapshot fails on a behaviour change rather than on a struct reshuffle.
///
/// `sort_output` exists for one case: in raw-spans mode with a search term and
/// `SortMode::ExecutionOrder`, `lib.rs` collects straight out of
/// `SpanRef::search`, which iterates an `FxHashSet`. That order is deterministic
/// for a given hashbrown version but is not a specified behaviour, so pinning it
/// in a checked-in snapshot would turn a dependency bump into a mystery
/// failure. Sort those rows instead; the set's *contents* are still asserted.
fn dump_query(label: &str, result: &crate::QueryResult, sort_output: bool) -> String {
    let mut out = String::new();
    writeln!(
        out,
        "-- {label}: page {}/{} of {} --",
        result.page, result.total_pages, result.total_count
    )
    .unwrap();
    let mut rows = Vec::new();
    for span in &result.spans {
        let mut row = String::new();
        writeln!(
            row,
            "  id={} name={:?} cpu={} corrected={} rel=({}..{}) agg={} count={:?}",
            span.id,
            span.name,
            span.cpu_duration,
            span.corrected_duration,
            span.start_relative_to_parent,
            span.end_relative_to_parent,
            span.is_aggregated,
            span.count,
        )
        .unwrap();
        if !span.args.is_empty() {
            writeln!(row, "    args={:?}", span.args).unwrap();
        }
        if !span.memory_samples.is_empty() {
            writeln!(row, "    memory_samples={:?}", span.memory_samples).unwrap();
        }
        rows.push(row);
    }
    if sort_output {
        rows.sort();
    }
    for row in rows {
        out += &row;
    }
    out
}

fn view_rect(query: &str, view_mode: &str, value_mode: &str) -> ViewRect {
    ViewRect {
        x: 0,
        y: 0,
        width: 100_000,
        height: 50,
        horizontal_pixels: 200,
        query: query.to_string(),
        view_mode: view_mode.to_string(),
        value_mode: value_mode.to_string(),
        value_filter: None,
        count_filter: None,
    }
}

/// Render a `Viewer` update. `ViewSpan` is `Serialize`, so its own wire shape is
/// the snapshot — exactly the bytes the websocket client receives.
fn dump_view(label: &str, update: &crate::viewer::Update) -> String {
    let mut out = String::new();
    writeln!(out, "-- {label}: max={} --", update.max).unwrap();
    for line in &update.lines {
        writeln!(
            out,
            "  {}",
            serde_json::to_string(line).expect("ViewLineUpdate is Serialize")
        )
        .unwrap();
    }
    out
}

#[test]
#[ignore = "snapshot test: pins exact output, so an intentional behaviour change fails it. \
            Excluded from CI so it cannot block an unrelated PR. Run with `cargo test -p \
            turbopack-trace-server --lib -- --ignored`."]
fn query_spans_pages_are_stable() {
    // The headless path: `next internal query-trace` and the MCP tool both go
    // through this, and it forces `totals()` and the corrected times just as
    // the viewer does.
    let container = build_reference_container();
    let mut out = String::new();

    for (label, sort_output, options) in [
        (
            "root/raw",
            false,
            QueryOptions {
                parent: None,
                aggregated: false,
                sort: SortMode::ExecutionOrder,
                search: None,
                page: 1,
            },
        ),
        (
            "root/aggregated",
            false,
            QueryOptions {
                parent: None,
                aggregated: true,
                sort: SortMode::Value,
                search: None,
                page: 1,
            },
        ),
        (
            "root/by-name",
            false,
            QueryOptions {
                parent: None,
                aggregated: false,
                sort: SortMode::Name,
                search: None,
                page: 1,
            },
        ),
        (
            "search=link",
            true,
            QueryOptions {
                parent: None,
                aggregated: false,
                sort: SortMode::ExecutionOrder,
                search: Some("link".to_string()),
                page: 1,
            },
        ),
        (
            "child-of-1",
            false,
            QueryOptions {
                parent: Some("1".to_string()),
                aggregated: false,
                sort: SortMode::ExecutionOrder,
                search: None,
                page: 1,
            },
        ),
    ] {
        out += &dump_query(label, &query_spans(&container, options), sort_output);
    }

    compare_golden("query", &out, QUERY_EXPECTED, "golden_query_expected.txt");
}

#[test]
#[ignore = "snapshot test: pins exact output, so an intentional behaviour change fails it. \
            Excluded from CI so it cannot block an unrelated PR. Run with `cargo test -p \
            turbopack-trace-server --lib -- --ignored`."]
fn viewer_updates_are_stable() {
    // Covers the value modes that force different cached fields: `duration`
    // pulls corrected times, `allocations` pulls `totals()`. The search rect
    // additionally builds the root `search_index`.
    let store = build_reference_store();
    let mut out = String::new();

    for (label, rect) in [
        (
            "aggregated/duration",
            view_rect("", "aggregated", "duration"),
        ),
        ("raw-spans/duration", view_rect("", "raw-spans", "duration")),
        (
            "aggregated/allocations",
            view_rect("", "aggregated", "allocations"),
        ),
        // `bottom-up-sorted-by-name`, not plain `bottom-up`: `build_bottom_up_graph`
        // emits its groups with `HashMap::into_values` (bottom_up.rs:100), so a
        // plain bottom-up view is in hashbrown iteration order. That is
        // reproducible for a given hashbrown version but would turn a dependency
        // bump into a mystery snapshot failure — and because the viewer lays
        // siblings out cumulatively, the `x` offsets shift too, so it cannot be
        // sorted after the fact the way the search rows can. Asking the code to
        // sort by name exercises the same machinery deterministically; group keys
        // are `(category, title)` pairs so there are no ties for the stable sort
        // to resolve in hash order.
        (
            "bottom-up-sorted-by-name/duration",
            view_rect("", "bottom-up-sorted-by-name", "duration"),
        ),
        (
            "raw-spans/search",
            view_rect("link", "raw-spans", "duration"),
        ),
    ] {
        let mut viewer = Viewer::new();
        out += &dump_view(label, &viewer.compute_update(&store, &rect));
    }

    compare_golden(
        "viewer",
        &out,
        VIEWER_EXPECTED,
        "golden_viewer_expected.txt",
    );
}
