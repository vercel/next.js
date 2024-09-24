use std::{
    cmp::{max, Reverse},
    collections::VecDeque,
    fmt::Debug,
    mem::take,
    num::NonZeroU32,
    sync::atomic::{AtomicU32, AtomicUsize, Ordering},
    time::Duration,
};

use concurrent_queue::ConcurrentQueue;
use dashmap::DashSet;
use parking_lot::Mutex;
use tracing::field::{debug, Empty};
use turbo_tasks::{TaskId, TurboTasksBackendApi};

use crate::{task::GcResult, MemoryBackend};

/// The priority of a task for garbage collection.
/// Any action will shrink the internal memory structures of the task in a
/// transparent way.
#[derive(Debug, Default, PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
pub struct GcPriority {
    // Memory usage divided by compute duration. Specifies how efficient garbage collection would
    // be with this task. Higher memory usage and lower compute duration makes it more likely to be
    // garbage collected.
    memory_per_time: u16,
}

/// State about garbage collection for a task.
#[derive(Clone, Copy, Debug, Default)]
pub struct GcTaskState {
    pub priority: GcPriority,
    /// The generation where the task was last accessed.
    pub generation: Option<NonZeroU32>,
}

impl GcTaskState {
    pub(crate) fn execution_completed(
        &mut self,
        duration: Duration,
        memory_usage: usize,
        generation: NonZeroU32,
    ) {
        self.generation = Some(generation);
        self.priority = GcPriority {
            memory_per_time: ((memory_usage + TASK_BASE_MEMORY_USAGE) as u64
                / (duration.as_micros() as u64 + TASK_BASE_COMPUTE_DURATION_IN_MICROS))
                .try_into()
                .unwrap_or(u16::MAX),
        };
    }

    pub(crate) fn on_read(&mut self, generation: NonZeroU32) -> bool {
        if let Some(old_generation) = self.generation {
            if old_generation < generation {
                self.generation = Some(generation);
                true
            } else {
                false
            }
        } else {
            self.generation = Some(generation);
            true
        }
    }
}

const MAX_DEACTIVATIONS: usize = 100_000;
const TASKS_PER_NEW_GENERATION: usize = 100_000;
const MAX_TASKS_PER_OLD_GENERATION: usize = 200_000;
const PERCENTAGE_TO_COLLECT: usize = 30;
const TASK_BASE_MEMORY_USAGE: usize = 1_000;
const TASK_BASE_COMPUTE_DURATION_IN_MICROS: u64 = 1_000;
pub const PERCENTAGE_MIN_TARGET_MEMORY: usize = 70;
pub const PERCENTAGE_MAX_TARGET_MEMORY: usize = 75;
pub const PERCENTAGE_MIN_IDLE_TARGET_MEMORY: usize = 55;
pub const PERCENTAGE_MAX_IDLE_TARGET_MEMORY: usize = 60;
pub const MAX_GC_STEPS: usize = 100;

struct OldGeneration {
    tasks: Vec<TaskId>,
    generation: NonZeroU32,
}

#[derive(Default)]
struct ProcessGenerationResult {
    old_generations: usize,
    priority: Option<GcPriority>,
    content_dropped_count: usize,
    unloaded_count: usize,
    already_unloaded_count: usize,
}

struct ProcessDeactivationsResult {
    count: usize,
}

/// The queue of actions that garbage collection should perform.
pub struct GcQueue {
    /// The current generation number.
    generation: AtomicU32,
    /// Fresh or read tasks that should added to the queue.
    incoming_tasks: ConcurrentQueue<TaskId>,
    /// Number of tasks in `incoming_tasks`.
    incoming_tasks_count: AtomicUsize,
    /// Tasks from old generations. The oldest generation will be garbage
    /// collected next.
    generations: Mutex<VecDeque<OldGeneration>>,
    /// Tasks that have become inactive. Processing them should ensure them for
    /// GC, if they are not already ensured and put all child tasks into the
    /// activation_queue
    deactivation_queue: ConcurrentQueue<TaskId>,
    /// Tasks that are active and not enqueued in the deactivation queue.
    // TODO Could be a bit field with locks, an array of atomics or an AMQF.
    active_tasks: DashSet<TaskId>,
}

impl GcQueue {
    pub fn new() -> Self {
        Self {
            // SAFETY: Starting at 1 to produce NonZeroU32s
            generation: AtomicU32::new(1),
            incoming_tasks: ConcurrentQueue::unbounded(),
            incoming_tasks_count: AtomicUsize::new(0),
            generations: Mutex::new(VecDeque::with_capacity(128)),
            deactivation_queue: ConcurrentQueue::unbounded(),
            active_tasks: DashSet::new(),
        }
    }

    /// Get the current generation number.
    pub fn generation(&self) -> NonZeroU32 {
        // SAFETY: We are sure that the generation is not 0, since we start at 1.
        unsafe { NonZeroU32::new_unchecked(self.generation.load(Ordering::Relaxed)) }
    }

    /// Notify the GC queue that a task has been executed.
    #[must_use]
    pub fn task_executed(&self, task: TaskId) -> NonZeroU32 {
        self.add_task(task)
    }

    /// Notify the GC queue that a task has been accessed.
    #[must_use]
    pub fn task_accessed(&self, task: TaskId) -> NonZeroU32 {
        self.add_task(task)
    }

    /// Notify the GC queue that a task should be enqueue for GC because it is
    /// inactive.
    #[must_use]
    pub fn task_inactive(&self, task: TaskId) -> NonZeroU32 {
        self.add_task(task)
    }

    /// Notify the GC queue that a task was active during GC
    pub fn task_gc_active(&self, task: TaskId) {
        self.active_tasks.insert(task);
    }

    /// Notify the GC queue that a task might be inactive now.
    pub fn task_potentially_no_longer_active(&self, task: TaskId) {
        if self.active_tasks.remove(&task).is_some() {
            let _ = self.deactivation_queue.push(task);
        }
    }

    fn add_task(&self, task: TaskId) -> NonZeroU32 {
        let _ = self.incoming_tasks.push(task);
        if self.incoming_tasks_count.fetch_add(1, Ordering::Acquire) % TASKS_PER_NEW_GENERATION
            == TASKS_PER_NEW_GENERATION - 1
        {
            self.incoming_tasks_count
                .fetch_sub(TASKS_PER_NEW_GENERATION, Ordering::Release);
            // We are selected to move TASKS_PER_NEW_GENERATION tasks into a generation
            let gen = unsafe {
                // SAFETY: We are sure that the generation is not 0, since we start at 1.
                NonZeroU32::new_unchecked(self.generation.fetch_add(1, Ordering::Relaxed))
            };
            let mut tasks = Vec::with_capacity(TASKS_PER_NEW_GENERATION);
            for _ in 0..TASKS_PER_NEW_GENERATION {
                match self.incoming_tasks.pop() {
                    Ok(task) => {
                        tasks.push(task);
                    }
                    Err(_) => {
                        // That will not happen, since we only pop the same amount as we have
                        // pushed.
                        unreachable!();
                    }
                }
            }
            self.generations.lock().push_front(OldGeneration {
                tasks,
                generation: gen,
            });
            gen
        } else {
            self.generation()
        }
    }

    fn process_deactivations(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> ProcessDeactivationsResult {
        let mut i = 0;
        loop {
            let Ok(id) = self.deactivation_queue.pop() else {
                break;
            };
            backend.with_task(id, |task| {
                if !task.potentially_become_inactive(self, backend, turbo_tasks) {
                    self.active_tasks.insert(id);
                }
            });
            i += 1;
            if i > MAX_DEACTIVATIONS {
                break;
            }
        }
        ProcessDeactivationsResult { count: i }
    }

    fn process_old_generation(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<ProcessGenerationResult> {
        let old_generation_info = {
            let guard = &mut self.generations.lock();
            let len = guard.len();
            guard.pop_back().map(|g| (g, len))
        };
        let Some((
            OldGeneration {
                mut tasks,
                generation,
            },
            old_generations,
        )) = old_generation_info
        else {
            // No old generation to process
            return None;
        };
        // Check all tasks for the correct generation
        let mut indices = Vec::with_capacity(tasks.len());
        assert!(tasks.len() <= MAX_TASKS_PER_OLD_GENERATION);
        for (i, task) in tasks.iter().enumerate() {
            backend.with_task(*task, |task| {
                if let Some(state) = task.gc_state() {
                    if let Some(gen) = state.generation {
                        if gen <= generation {
                            indices.push((Reverse(state.priority), i as u32));
                        }
                    }
                }
            });
        }

        if indices.is_empty() {
            // No valid tasks in old generation to process
            return Some(ProcessGenerationResult {
                old_generations,
                ..ProcessGenerationResult::default()
            });
        }

        // Sorting based on sort_by_cached_key from std lib
        indices.sort_unstable();
        for i in 0..indices.len() {
            let mut index = indices[i].1;
            while (index as usize) < i {
                index = indices[index as usize].1;
            }
            indices[i].1 = index;
            tasks.swap(i, index as usize);
        }
        tasks.truncate(indices.len());

        let tasks_to_collect = max(1, tasks.len() * PERCENTAGE_TO_COLLECT / 100);
        let (Reverse(max_priority), _) = indices[0];
        drop(indices);

        // Put back remaining tasks into the queue
        let remaining_tasks = &tasks[tasks_to_collect..];
        {
            let mut guard = self.generations.lock();
            if !remaining_tasks.is_empty() {
                if let Some(first) = guard.front_mut() {
                    first.tasks.extend(remaining_tasks);
                    if first.tasks.len() > MAX_TASKS_PER_OLD_GENERATION {
                        // Need to split the tasks into two generations
                        let mut gen_b = Vec::with_capacity(first.tasks.len() / 2);
                        let mut gen_a = Vec::with_capacity(first.tasks.len() - gen_b.capacity());
                        for (i, task) in take(&mut first.tasks).into_iter().enumerate() {
                            if i % 2 == 0 {
                                gen_a.push(task);
                            } else {
                                gen_b.push(task);
                            }
                        }
                        let generation = first.generation;
                        first.tasks = gen_a;
                        guard.push_front(OldGeneration {
                            tasks: gen_b,
                            generation,
                        });
                    }
                } else {
                    guard.push_front(OldGeneration {
                        tasks: remaining_tasks.to_vec(),
                        generation,
                    });
                }
            }
        }

        // GC the tasks
        let mut content_dropped_count = 0;
        let mut unloaded_count = 0;
        let mut already_unloaded_count = 0;
        for task in tasks[..tasks_to_collect].iter() {
            backend.with_task(*task, |task| {
                match task.run_gc(generation, self, backend, turbo_tasks) {
                    GcResult::NotPossible => {}
                    GcResult::Stale => {}
                    GcResult::ContentDropped => {
                        content_dropped_count += 1;
                    }
                    GcResult::Unloaded => {
                        unloaded_count += 1;
                    }
                    GcResult::AlreadyUnloaded => {
                        already_unloaded_count += 1;
                    }
                }
            });
        }

        Some(ProcessGenerationResult {
            old_generations,
            priority: Some(max_priority),
            content_dropped_count,
            unloaded_count,
            already_unloaded_count,
        })
    }

    /// Run garbage collection on the queue. Returns true, if some progress has
    /// been made. Returns the number of old generations.
    pub fn run_gc(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<usize> {
        let span = tracing::trace_span!(
            "garbage collection step",
            priority = Empty,
            deactivations_count = Empty,
            content_dropped_count = Empty,
            unloaded_count = Empty,
            already_unloaded_count = Empty
        )
        .entered();

        let ProcessDeactivationsResult {
            count: deactivations_count,
        } = self.process_deactivations(backend, turbo_tasks);

        if let Some(ProcessGenerationResult {
            old_generations,
            priority,
            content_dropped_count,
            unloaded_count,
            already_unloaded_count,
        }) = self.process_old_generation(backend, turbo_tasks)
        {
            span.record("deactivations_count", deactivations_count);
            span.record("content_dropped_count", content_dropped_count);
            span.record("unloaded_count", unloaded_count);
            span.record("already_unloaded_count", already_unloaded_count);
            if let Some(priority) = &priority {
                span.record("priority", debug(priority));
            } else {
                span.record("priority", "");
            }

            Some(old_generations)
        } else {
            (deactivations_count > 0).then_some(0)
        }
    }
}
