//! Pure helpers for the edge counts of the aggregation graph.
//!
//! An aggregation edge between an upper task `U` and a task `F` is stored either as an inner edge
//! (`F.upper[U]`, an unsigned count) or as a follower edge (`U.followers[F]`, a signed count). A
//! negative follower count is *debt*: removals of the edge that overtook the corresponding
//! additions. Only counts `> 0` are real edges. See the module docs of
//! [`super::aggregation_update`] for how debt is created and paid.
//!
//! These helpers contain no locking and no side effects, so the arithmetic and placement rules can
//! be reviewed and tested in isolation.

use turbo_tasks::TaskId;

use crate::backend::operation::aggregation_update::is_root_node;

/// Which side of the edge between `U` and `F` stores the edge count.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EdgeSide {
    /// Stored as `F.upper[U]`: `U` aggregates the data of `F`.
    Inner,
    /// Stored as `U.followers[F]`: `F` is a follower of `U`.
    Follower,
}

/// Where a writer (an edge addition) places the edge.
///
/// A root upper always aggregates its inner tasks (also when the follower is a root too). Equal
/// aggregation numbers of a non-root upper are placed on the follower side; [`edge_balance_side`]
/// treats that case as a conflict that is resolved later.
///
/// The writers only lock one task at a time, so they call this with the exact number of the locked
/// task and a lower bound for the other one. The decision loops in `aggregation_update` explain why
/// that is enough.
pub fn edge_write_side(
    upper_aggregation_number: u32,
    follower_aggregation_number: u32,
) -> EdgeSide {
    if is_root_node(upper_aggregation_number)
        || follower_aggregation_number < upper_aggregation_number
    {
        EdgeSide::Inner
    } else {
        EdgeSide::Follower
    }
}

/// Where `balance_edge` (which holds both locks) wants the edge.
///
/// Returns `None` for equal aggregation numbers of a non-root upper. That is a conflict which is
/// resolved by increasing the aggregation number of the follower.
pub fn edge_balance_side(
    upper_aggregation_number: u32,
    follower_aggregation_number: u32,
) -> Option<EdgeSide> {
    if is_root_node(upper_aggregation_number)
        || follower_aggregation_number < upper_aggregation_number
    {
        Some(EdgeSide::Inner)
    } else if follower_aggregation_number > upper_aggregation_number {
        Some(EdgeSide::Follower)
    } else {
        None
    }
}

/// Whether a write changed the existence of a real edge.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EdgeTransition {
    /// The count went from `<= 0` to `> 0`.
    Appeared,
    /// The count went from `> 0` to `<= 0`.
    Disappeared,
    /// The count stayed `> 0` or stayed `<= 0`.
    Unchanged,
}

/// The result of applying a delta to a follower count.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FollowerCountChange {
    pub old: i32,
    pub new: i32,
}

impl FollowerCountChange {
    pub fn transition(&self) -> EdgeTransition {
        match (self.old > 0, self.new > 0) {
            (false, true) => EdgeTransition::Appeared,
            (true, false) => EdgeTransition::Disappeared,
            _ => EdgeTransition::Unchanged,
        }
    }

    /// The follower count is negative after the write, i.e. there are removals that wait for
    /// their additions.
    pub fn is_debt(&self) -> bool {
        self.new < 0
    }
}

/// Applies `delta` to a follower count. `None` means the counter overflowed, which is a logic
/// error the caller reports with the involved task ids.
pub fn apply_follower_delta(old: i32, delta: i32) -> Option<FollowerCountChange> {
    let new = old.checked_add(delta)?;
    Some(FollowerCountChange { old, new })
}

/// Converts the unsigned count of an addition of the edge between `upper_id` and `follower_id`
/// into a signed follower delta.
///
/// # Panics
///
/// When the count doesn't fit into an `i32`. Counts this large would be a logic error.
pub fn follower_delta(upper_id: TaskId, follower_id: TaskId, count: u32) -> i32 {
    i32::try_from(count).unwrap_or_else(|_| {
        panic!("aggregation edge count {count} from {upper_id} to {follower_id} overflows i32")
    })
}

/// Nets follower debt against an inner count of the same edge. Returns the new
/// `(inner, follower)` counts.
///
/// Debt and an inner edge can coexist when an addition placed the edge on the inner side while the
/// removal recorded debt on the follower side. The net count of the edge is `inner + follower`;
/// this cancels as much as possible so that at most one of both remains non-zero.
pub fn net_debt(inner: u32, follower: i32) -> (u32, i32) {
    if follower >= 0 || inner == 0 {
        return (inner, follower);
    }
    let debt = follower.unsigned_abs();
    let cancelled = inner.min(debt);
    // `follower + cancelled` is in `follower..=0`, so it always fits into an `i32`.
    let new_follower = i32::try_from(i64::from(follower) + i64::from(cancelled))
        .expect("netted follower count is between the old count and 0");
    (inner - cancelled, new_follower)
}

/// The aggregation edges stored on one task, captured for verification.
#[cfg(any(test, feature = "verify_aggregation_graph"))]
#[derive(Clone, Debug)]
pub struct TaskAggregationEdges {
    pub task_id: TaskId,
    pub aggregation_number: u32,
    /// `self.upper`: inner edges to upper tasks.
    pub upper: Vec<(TaskId, u32)>,
    /// `self.followers`: follower edges (or debt) to follower tasks.
    pub followers: Vec<(TaskId, i32)>,
}

/// Checks the invariants of the aggregation edges that hold once all aggregation updates are
/// processed, and returns a description of every violation:
/// - There is no follower debt left (every removal found its addition).
/// - No edge is stored on both sides.
/// - Every edge is stored on a side that is valid for the aggregation numbers. Equal aggregation
///   numbers of a non-root upper are a conflict that is resolved lazily, so both sides are
///   accepted.
///
/// Must only be called when no aggregation updates run, e.g. when the backend stops.
#[cfg(any(test, feature = "verify_aggregation_graph"))]
pub fn verify_aggregation_edges(tasks: &[TaskAggregationEdges]) -> Vec<String> {
    use rustc_hash::FxHashMap;

    let aggregation_numbers: FxHashMap<TaskId, u32> = tasks
        .iter()
        .map(|t| (t.task_id, t.aggregation_number))
        .collect();
    let follower_counts: FxHashMap<(TaskId, TaskId), i32> = tasks
        .iter()
        .flat_map(|t| t.followers.iter().map(|&(f, c)| ((t.task_id, f), c)))
        .collect();

    let mut violations = Vec::new();
    for task in tasks {
        let upper_id = task.task_id;
        for &(follower_id, count) in &task.followers {
            if count < 0 {
                violations.push(format!(
                    "follower debt {count} in {upper_id} for follower {follower_id}"
                ));
                continue;
            }
            if let Some(&follower_number) = aggregation_numbers.get(&follower_id)
                && edge_balance_side(task.aggregation_number, follower_number)
                    == Some(EdgeSide::Inner)
            {
                violations.push(format!(
                    "follower edge {upper_id} -> {follower_id} should be an inner edge \
                     (aggregation numbers {} and {follower_number})",
                    task.aggregation_number
                ));
            }
        }
        let follower_id = task.task_id;
        for &(upper_id, _) in &task.upper {
            if let Some(&follower_count) = follower_counts.get(&(upper_id, follower_id)) {
                violations.push(format!(
                    "edge {upper_id} -> {follower_id} is stored on both sides (follower count \
                     {follower_count})"
                ));
            }
            if let Some(&upper_number) = aggregation_numbers.get(&upper_id)
                && edge_balance_side(upper_number, task.aggregation_number)
                    == Some(EdgeSide::Follower)
            {
                violations.push(format!(
                    "inner edge {upper_id} -> {follower_id} should be a follower edge \
                     (aggregation numbers {upper_number} and {})",
                    task.aggregation_number
                ));
            }
        }
    }
    violations
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: u32 = u32::MAX;

    #[test]
    fn write_side() {
        // A root upper always aggregates, even a root follower.
        assert_eq!(edge_write_side(ROOT, ROOT), EdgeSide::Inner);
        assert_eq!(edge_write_side(ROOT, 0), EdgeSide::Inner);
        assert_eq!(edge_write_side(20, 10), EdgeSide::Inner);
        // Equal numbers of a non-root upper are written as follower edges.
        assert_eq!(edge_write_side(20, 20), EdgeSide::Follower);
        assert_eq!(edge_write_side(20, 30), EdgeSide::Follower);
        assert_eq!(edge_write_side(20, ROOT), EdgeSide::Follower);
    }

    #[test]
    fn balance_side() {
        assert_eq!(edge_balance_side(ROOT, ROOT), Some(EdgeSide::Inner));
        assert_eq!(edge_balance_side(ROOT, 0), Some(EdgeSide::Inner));
        assert_eq!(edge_balance_side(20, 10), Some(EdgeSide::Inner));
        assert_eq!(edge_balance_side(20, 20), None);
        assert_eq!(edge_balance_side(20, 30), Some(EdgeSide::Follower));
        assert_eq!(edge_balance_side(20, ROOT), Some(EdgeSide::Follower));
    }

    #[test]
    fn write_and_balance_side_agree_outside_of_conflicts() {
        for upper in [0, 1, 15, 16, 17, 100, ROOT - 1, ROOT] {
            for follower in [0, 1, 15, 16, 17, 100, ROOT - 1, ROOT] {
                match edge_balance_side(upper, follower) {
                    Some(side) => assert_eq!(edge_write_side(upper, follower), side),
                    None => {
                        assert_eq!(upper, follower);
                        assert_eq!(edge_write_side(upper, follower), EdgeSide::Follower);
                    }
                }
            }
        }
    }

    fn transition(old: i32, delta: i32) -> (i32, EdgeTransition, bool) {
        let change = apply_follower_delta(old, delta).unwrap();
        (change.new, change.transition(), change.is_debt())
    }

    #[test]
    fn follower_delta_transitions() {
        use EdgeTransition::*;
        // Plain additions and removals.
        assert_eq!(transition(0, 1), (1, Appeared, false));
        assert_eq!(transition(1, 1), (2, Unchanged, false));
        assert_eq!(transition(2, -1), (1, Unchanged, false));
        assert_eq!(transition(1, -1), (0, Disappeared, false));
        // A removal that overtakes its addition creates debt, without an edge transition.
        assert_eq!(transition(0, -1), (-1, Unchanged, true));
        assert_eq!(transition(-1, -1), (-2, Unchanged, true));
        // Paying debt is not an edge transition either ...
        assert_eq!(transition(-1, 1), (0, Unchanged, false));
        assert_eq!(transition(-2, 1), (-1, Unchanged, true));
        // ... until the count gets positive.
        assert_eq!(transition(-1, 2), (1, Appeared, false));
        // Batched removals can skip zero.
        assert_eq!(transition(1, -2), (-1, Disappeared, true));
    }

    #[test]
    fn follower_delta_overflow() {
        assert_eq!(apply_follower_delta(i32::MAX, 1), None);
        assert_eq!(apply_follower_delta(i32::MIN, -1), None);
        assert!(apply_follower_delta(i32::MAX, -1).is_some());
        assert!(apply_follower_delta(i32::MIN, 1).is_some());
    }

    #[test]
    fn follower_delta_conversion() {
        assert_eq!(follower_delta(id(1), id(2), 0), 0);
        assert_eq!(follower_delta(id(1), id(2), 7), 7);
        assert_eq!(follower_delta(id(1), id(2), i32::MAX as u32), i32::MAX);
    }

    #[test]
    fn follower_delta_conversion_overflow_names_edge() {
        let error = std::panic::catch_unwind(|| {
            follower_delta(id(11), id(12), i32::MAX as u32 + 1);
        })
        .expect_err("conversion must overflow");
        let message = error
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| error.downcast_ref::<&str>().copied())
            .unwrap_or_default();
        assert!(message.contains("overflows i32"), "{message}");
        assert!(message.contains(&id(11).to_string()), "{message}");
        assert!(message.contains(&id(12).to_string()), "{message}");
    }

    #[test]
    fn net_debt_cases() {
        // Nothing to net.
        assert_eq!(net_debt(0, 0), (0, 0));
        assert_eq!(net_debt(0, -3), (0, -3));
        assert_eq!(net_debt(2, 0), (2, 0));
        assert_eq!(net_debt(2, 5), (2, 5));
        // Debt and inner count cancel each other.
        assert_eq!(net_debt(1, -1), (0, 0));
        assert_eq!(net_debt(1, -3), (0, -2));
        assert_eq!(net_debt(3, -1), (2, 0));
        // Extremes don't overflow.
        assert_eq!(net_debt(u32::MAX, i32::MIN), (u32::MAX - (1 << 31), 0));
        assert_eq!(net_debt(1, i32::MIN), (0, i32::MIN + 1));
    }

    fn task(id: u32, aggregation_number: u32) -> TaskAggregationEdges {
        TaskAggregationEdges {
            task_id: TaskId::new(id).unwrap(),
            aggregation_number,
            upper: Vec::new(),
            followers: Vec::new(),
        }
    }

    fn id(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    #[test]
    fn verify_accepts_valid_edges() {
        let mut upper = task(1, 100);
        let mut inner = task(2, 10);
        let follower = task(3, 200);
        let mut conflict = task(4, 100);
        inner.upper.push((id(1), 1));
        upper.followers.push((id(3), 2));
        // equal aggregation numbers are accepted on both sides
        conflict.upper.push((id(1), 1));
        assert_eq!(
            verify_aggregation_edges(&[upper, inner, follower, conflict]),
            Vec::<String>::new()
        );
    }

    #[test]
    fn verify_reports_debt_and_split_edges() {
        let mut upper = task(1, 100);
        let mut inner = task(2, 10);
        upper.followers.push((id(2), -1));
        inner.upper.push((id(1), 1));
        let violations = verify_aggregation_edges(&[upper, inner]);
        assert_eq!(violations.len(), 2, "{violations:#?}");
        assert!(violations[0].contains("debt"));
        assert!(violations[1].contains("both sides"));
    }

    #[test]
    fn verify_reports_misplaced_edges() {
        let mut upper = task(1, 100);
        let mut root = task(5, ROOT);
        let mut inner = task(2, 10);
        let mut follower = task(3, 200);
        // should be inner
        upper.followers.push((id(2), 1));
        // should be follower
        follower.upper.push((id(1), 1));
        // a root upper must not have followers, even a root follower
        root.followers.push((id(6), 1));
        let other_root = task(6, ROOT);
        inner.upper.clear();
        let violations = verify_aggregation_edges(&[upper, root, inner, follower, other_root]);
        assert_eq!(violations.len(), 3, "{violations:#?}");
    }
}
