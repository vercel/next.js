//! Tracker for the local tasks of a single global task execution.

use std::fmt::Display;

use crate::{
    OutputContent,
    event::{Event, EventListener},
    id::LocalTaskId,
    task::local_task::LocalTask,
};

pub(crate) struct LocalTaskTracker {
    /// Slot vector for `LocalTask` entries. One-indexed via `LocalTaskId`.
    tasks: Vec<LocalTask>,
    /// Count of `tasks` entries still in `Scheduled` state, plus any in-flight detached test
    /// futures. Decrementing to zero notifies `done`.
    in_flight: u32,
    /// Notified each time `in_flight` transitions to zero.
    done: Event,
}

impl LocalTaskTracker {
    pub(crate) fn new() -> Self {
        Self {
            tasks: Vec::new(),
            in_flight: 0,
            done: Event::new(|| || "LocalTaskTracker::done".to_string()),
        }
    }

    pub(crate) fn get(&self, id: LocalTaskId) -> &LocalTask {
        // local task ids are one-indexed (they use NonZeroU32)
        &self.tasks[(*id as usize) - 1]
    }

    /// Create a new `Scheduled` local task and returns the new task id.
    ///
    /// Tasks should call [`complete`] when the task transitions to `Done`.
    ///
    /// [`complete`]: LocalTaskTracker::complete
    pub(crate) fn create(
        &mut self,
        task_type: impl Display + Send + Sync + 'static,
    ) -> LocalTaskId {
        let task = LocalTask::Scheduled {
            done_event: Event::new(move || move || format!("LocalTask({task_type})::done_event")),
        };

        self.tasks.push(task);
        self.in_flight += 1;
        // generate a one-indexed id from len() -- we just pushed so len() is >= 1

        // SAFETY: len() is >= 1 because we just pushed.
        unsafe { LocalTaskId::new_unchecked(self.tasks.len() as u32) }
    }

    /// Transition the slot for `id` from `Scheduled` to `Done`, notify any
    /// `try_read_local_output` waiters on this specific task, decrement the in-flight
    /// counter, and notify the collective `done` event if it reached zero.
    pub(crate) fn complete(&mut self, id: LocalTaskId, output: OutputContent) {
        let slot = &mut self.tasks[(*id as usize) - 1];
        let prev = std::mem::replace(slot, LocalTask::Done { output });
        let LocalTask::Scheduled { done_event } = prev else {
            panic!("local task finished, but was not in the scheduled state?");
        };
        // notify waiter on this task that it is complete.
        // Do this before decrementing in-flight so we can ensure that tasks are always completed
        // before the task completes.
        done_event.notify(usize::MAX);
        self.decrement_in_flight();
    }

    /// Test-only: register an in-flight detached future (`spawn_detached_for_testing`). No
    /// `LocalTask` slot is allocated; this just bumps the counter. Balanced by a matching
    /// [`dec_in_flight`] when the wrapped future completes.
    ///
    /// [`dec_in_flight`]: LocalTaskTracker::dec_in_flight
    pub(crate) fn register_detached(&mut self) {
        self.in_flight += 1;
    }

    /// Decrement the in-flight counter and notify the collective `done` event if it reached
    /// zero. Used by the test-only detached path; the production path goes through
    /// [`complete`] which decrements as part of the slot transition.
    ///
    /// [`complete`]: LocalTaskTracker::complete
    pub(crate) fn decrement_in_flight(&mut self) {
        debug_assert!(
            self.in_flight > 0,
            "LocalTaskTracker::dec_in_flight without matching increment"
        );
        self.in_flight -= 1;
        if self.in_flight == 0 {
            self.done.notify(usize::MAX);
        }
    }

    /// Current in-flight count. Cheap snapshot for the early-return path in
    /// `wait_for_local_tasks`.
    #[cfg(test)]
    pub(crate) fn in_flight(&self) -> u32 {
        self.in_flight
    }

    /// Listen for the next "in-flight reached zero" notification. Used by
    /// `wait_for_local_tasks` together with `in_flight()` for the standard double-check
    /// pattern that avoids lost wakeups.
    pub(crate) fn listen_for_in_flight(&self) -> Option<EventListener> {
        if self.in_flight > 0 {
            Some(self.done.listen())
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_output() -> OutputContent {
        OutputContent::Link(crate::RawVc::TaskOutput(
            crate::TaskId::try_from(1).unwrap(),
        ))
    }

    /// `create` increments `in_flight`; `complete` performs the slot transition AND
    /// decrements in one step.
    #[test]
    fn create_then_complete_balances_in_flight() {
        let mut tracker = LocalTaskTracker::new();
        assert_eq!(tracker.in_flight(), 0);

        let id = tracker.create("test");
        assert_eq!(tracker.in_flight(), 1);

        tracker.complete(id, dummy_output());
        assert_eq!(tracker.in_flight(), 0);
    }

    #[test]
    fn detached_inc_dec_balances_in_flight() {
        let mut tracker = LocalTaskTracker::new();
        tracker.register_detached();
        tracker.register_detached();
        assert_eq!(tracker.in_flight(), 2);
        tracker.decrement_in_flight();
        assert_eq!(tracker.in_flight(), 1);
        tracker.decrement_in_flight();
        assert_eq!(tracker.in_flight(), 0);
    }

    /// `complete` notifies per-task waiters (the equivalent of `try_read_local_output`'s
    /// `EventListener` users) as part of the transition.
    #[test]
    fn complete_notifies_per_task_listener() {
        let mut tracker = LocalTaskTracker::new();
        let id = tracker.create("test");
        let LocalTask::Scheduled { done_event: event } = tracker.get(id) else {
            unreachable!()
        };
        let listener = event.listen();
        tracker.complete(id, dummy_output());
        // The listener is now ready (notify already fired) — `wait()` should return without
        // blocking. We can't `.await` in a sync test, so just check `is_notified` indirectly
        // by relying on the synchronous `wait()` API exposed by `EventListener`.
        listener.wait();
    }
}
