//! Exhaustive interleaving check of the cell dependency registration protocol.
//!
//! This is a model of the protocol, not of the backend code: it enumerates every interleaving of a
//! reader task's dependency registration with a concurrent `update_cell` of the read cell, and
//! checks that no invalidation is lost.
//!
//! The protocol under test ("reader first") registers a dependency in two separate task-lock
//! sections that never overlap:
//!
//! 1. Reader section: mark the reader's dependency edge as current (insert it, or move it from
//!    outdated to current).
//! 2. Owner section: insert the owner's dependent edge if it's missing, and read the cell content
//!    in the same section.
//!
//! A writer updates the content in an owner section, captures the dependents there, and delivers
//! the invalidation to each dependent later (in the dependent's own section): an outdated edge
//! makes the dependent dirty, a current edge marks the running execution stale (or makes a
//! completed task dirty), an absent edge is skipped. Completing an execution clears the dirty flag
//! unless the execution is stale.
//!
//! The two negative controls must lose invalidations, which shows that the checker can detect
//! them:
//! - "owner first": the owner section runs before the reader section;
//! - "skip insert": the owner section skips the insert when the reader section reported that the
//!   edge was already current (another read of the same cell in the same execution may have marked
//!   it but not reached its owner section yet).

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Edge {
    Absent,
    Outdated,
    Current,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Protocol {
    ReaderFirst,
    OwnerFirst,
    ReaderFirstSkipInsert,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Step {
    /// Reader section of read `n`.
    ReaderSection(usize),
    /// Owner section of read `n`.
    OwnerSection(usize),
    /// The reader execution completes.
    Complete,
    /// Writer: update the content and capture the dependents (owner section).
    WriterUpdate,
    /// Writer: deliver the invalidation to the captured dependent (dependent section).
    WriterDeliver,
}

#[derive(Clone, Debug)]
struct State {
    /// Reader-side dependency edge.
    edge: Edge,
    /// Owner-side dependent edge.
    dependent: bool,
    /// Content version of the cell.
    version: u32,
    /// Versions observed by the reads of the current execution.
    observed: Vec<Option<u32>>,
    /// The result of the reader section of each read: `true` if the edge was already current.
    already_current: Vec<bool>,
    /// The reader execution is running.
    running: bool,
    /// The running execution is stale.
    stale: bool,
    /// The reader task is dirty (scheduled to re-execute).
    dirty: bool,
    /// The writer captured the dependent in its owner section.
    captured: bool,
    /// The last completed execution, if it completed clean: the versions it observed.
    completed_clean: Option<Vec<u32>>,
}

struct Scenario {
    /// Number of reads of the cell in the reader execution.
    reads: usize,
    /// The reader edge at the start of the execution (`Outdated` for a re-execution).
    initial_edge: Edge,
    /// The owner dependent at the start (present for a re-execution).
    initial_dependent: bool,
}

/// The per-actor step sequences. The reads of one execution run concurrently with each other (as
/// separate futures awaited together), so each read is its own actor; the completion happens after
/// all of them.
fn actors(protocol: Protocol, scenario: &Scenario) -> Vec<Vec<Step>> {
    let mut actors = Vec::new();
    for n in 0..scenario.reads {
        actors.push(match protocol {
            Protocol::ReaderFirst | Protocol::ReaderFirstSkipInsert => {
                vec![Step::ReaderSection(n), Step::OwnerSection(n)]
            }
            Protocol::OwnerFirst => vec![Step::OwnerSection(n), Step::ReaderSection(n)],
        });
    }
    actors.push(vec![Step::WriterUpdate, Step::WriterDeliver]);
    actors
}

fn apply(protocol: Protocol, state: &mut State, step: Step) {
    match step {
        Step::ReaderSection(n) => {
            state.already_current[n] = state.edge == Edge::Current;
            state.edge = Edge::Current;
        }
        Step::OwnerSection(n) => {
            let skip = protocol == Protocol::ReaderFirstSkipInsert && state.already_current[n];
            if !skip {
                state.dependent = true;
            }
            state.observed[n] = Some(state.version);
        }
        Step::Complete => {
            state.running = false;
            if state.stale {
                // A stale execution is re-executed: its result isn't published.
                state.dirty = true;
                state.completed_clean = None;
            } else {
                state.dirty = false;
                state.completed_clean = Some(state.observed.iter().map(|v| v.unwrap()).collect());
            }
        }
        Step::WriterUpdate => {
            state.version += 1;
            state.captured = state.dependent;
        }
        Step::WriterDeliver => {
            if state.captured {
                match state.edge {
                    Edge::Absent => {}
                    Edge::Outdated => state.dirty = true,
                    Edge::Current => {
                        if state.running {
                            state.stale = true;
                        } else {
                            state.dirty = true;
                        }
                    }
                }
            }
        }
    }
}

/// Explores every interleaving. Returns (explored schedules, violating schedules).
fn explore(protocol: Protocol, scenario: &Scenario) -> (usize, Vec<Vec<Step>>) {
    let actors = actors(protocol, scenario);
    let initial = State {
        edge: scenario.initial_edge,
        dependent: scenario.initial_dependent,
        version: 0,
        observed: vec![None; scenario.reads],
        already_current: vec![false; scenario.reads],
        running: true,
        stale: false,
        dirty: false,
        captured: false,
        completed_clean: None,
    };
    let mut explored = 0;
    let mut violations = Vec::new();
    let mut positions = vec![0; actors.len()];
    let mut completed = false;
    let mut trace = Vec::new();
    dfs(
        protocol,
        scenario,
        &actors,
        &mut positions,
        &mut completed,
        initial,
        &mut trace,
        &mut explored,
        &mut violations,
    );
    (explored, violations)
}

#[allow(clippy::too_many_arguments)]
fn dfs(
    protocol: Protocol,
    scenario: &Scenario,
    actors: &[Vec<Step>],
    positions: &mut [usize],
    completed: &mut bool,
    state: State,
    trace: &mut Vec<Step>,
    explored: &mut usize,
    violations: &mut Vec<Vec<Step>>,
) {
    let mut any = false;
    // The completion can happen once all reads are done.
    let reads_done = (0..scenario.reads).all(|n| positions[n] == actors[n].len());
    if reads_done && !*completed {
        any = true;
        let mut next = state.clone();
        apply(protocol, &mut next, Step::Complete);
        *completed = true;
        trace.push(Step::Complete);
        dfs(
            protocol, scenario, actors, positions, completed, next, trace, explored, violations,
        );
        trace.pop();
        *completed = false;
    }
    for a in 0..actors.len() {
        if positions[a] < actors[a].len() {
            any = true;
            let step = actors[a][positions[a]];
            let mut next = state.clone();
            apply(protocol, &mut next, step);
            positions[a] += 1;
            trace.push(step);
            dfs(
                protocol, scenario, actors, positions, completed, next, trace, explored, violations,
            );
            trace.pop();
            positions[a] -= 1;
        }
    }
    if !any {
        *explored += 1;
        if lost_invalidation(&state) {
            violations.push(trace.clone());
        }
    }
}

/// After everything drained: the reader's last execution completed clean, observed an old version,
/// and the reader isn't scheduled to re-execute.
fn lost_invalidation(state: &State) -> bool {
    match &state.completed_clean {
        Some(observed) => !state.dirty && observed.iter().any(|&v| v < state.version),
        None => !state.dirty,
    }
}

const SCENARIOS: [(&str, Scenario); 4] = [
    (
        "one read",
        Scenario {
            reads: 1,
            initial_edge: Edge::Absent,
            initial_dependent: false,
        },
    ),
    (
        "two reads of the same cell",
        Scenario {
            reads: 2,
            initial_edge: Edge::Absent,
            initial_dependent: false,
        },
    ),
    (
        "re-execution with an outdated edge",
        Scenario {
            reads: 1,
            initial_edge: Edge::Outdated,
            initial_dependent: true,
        },
    ),
    (
        "re-execution with an outdated edge, two reads",
        Scenario {
            reads: 2,
            initial_edge: Edge::Outdated,
            initial_dependent: true,
        },
    ),
];

#[test]
fn reader_first_never_loses_an_invalidation() {
    for (name, scenario) in &SCENARIOS {
        let (explored, violations) = explore(Protocol::ReaderFirst, scenario);
        assert!(explored > 0, "{name}: nothing explored");
        assert!(
            violations.is_empty(),
            "{name}: lost invalidation in {} of {explored} schedules, e.g. {:?}",
            violations.len(),
            violations[0]
        );
    }
}

#[test]
fn owner_first_loses_an_invalidation() {
    let (explored, violations) = explore(Protocol::OwnerFirst, &SCENARIOS[0].1);
    assert!(explored > 0);
    assert!(
        !violations.is_empty(),
        "the owner-first control must lose an invalidation ({explored} schedules)"
    );
}

#[test]
fn skipping_the_owner_insert_on_already_current_loses_an_invalidation() {
    let (explored, violations) = explore(Protocol::ReaderFirstSkipInsert, &SCENARIOS[1].1);
    assert!(explored > 0);
    assert!(
        !violations.is_empty(),
        "the skip-insert control must lose an invalidation ({explored} schedules)"
    );
}

#[test]
fn writer_after_completion_is_delivered() {
    // A writer that runs entirely after the completion must make the reader dirty.
    let scenario = &SCENARIOS[0].1;
    let mut state = State {
        edge: scenario.initial_edge,
        dependent: scenario.initial_dependent,
        version: 0,
        observed: vec![None],
        already_current: vec![false],
        running: true,
        stale: false,
        dirty: false,
        captured: false,
        completed_clean: None,
    };
    for step in [
        Step::ReaderSection(0),
        Step::OwnerSection(0),
        Step::Complete,
        Step::WriterUpdate,
        Step::WriterDeliver,
    ] {
        apply(Protocol::ReaderFirst, &mut state, step);
    }
    assert!(state.dirty);
    assert!(!lost_invalidation(&state));
}
