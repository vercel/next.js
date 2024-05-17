use std::{
    cmp::{max, Reverse},
    collections::VecDeque,
    fmt::Debug,
    mem::take,
    sync::atomic::{AtomicU32, AtomicUsize, Ordering},
    time::Duration,
};

use concurrent_queue::ConcurrentQueue;
use parking_lot::Mutex;
use tracing::field::{debug, Empty};
use turbo_tasks::TaskId;

use crate::MemoryBackend;

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
    pub generation: u32,
}

impl GcTaskState {
    pub(crate) fn execution_completed(
        &mut self,
        duration: Duration,
        memory_usage: usize,
        generation: u32,
    ) {
        self.generation = generation;
        self.priority = GcPriority {
            memory_per_time: ((memory_usage + TASK_BASE_MEMORY_USAGE) as u64
                / (duration.as_micros() as u64 + TASK_BASE_COMPUTE_DURATION_IN_MICROS))
                .try_into()
                .unwrap_or(u16::MAX),
        };
    }

    pub(crate) fn on_read(&mut self, generation: u32) -> bool {
        if self.generation < generation {
            self.generation = generation;
            true
        } else {
            false
        }
    }
}

const TASKS_PER_NEW_GENERATION: usize = 100_000;
const MAX_TASKS_PER_OLD_GENERATION: usize = 200_000;
const PERCENTAGE_TO_COLLECT: usize = 30;
const TASK_BASE_MEMORY_USAGE: usize = 1_000;
const TASK_BASE_COMPUTE_DURATION_IN_MICROS: u64 = 1_000;
pub const PERCENTAGE_TARGET_MEMORY: usize = 88;
pub const PERCENTAGE_IDLE_TARGET_MEMORY: usize = 75;

struct OldGeneration {
    tasks: Vec<TaskId>,
    generation: u32,
}

struct ProcessGenerationResult {
    priority: Option<GcPriority>,
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
}

impl GcQueue {
    pub fn new() -> Self {
        Self {
            generation: AtomicU32::new(0),
            incoming_tasks: ConcurrentQueue::unbounded(),
            incoming_tasks_count: AtomicUsize::new(0),
            generations: Mutex::new(VecDeque::with_capacity(128)),
        }
    }

    /// Get the current generation number.
    pub fn generation(&self) -> u32 {
        self.generation.load(Ordering::Relaxed)
    }

    /// Notify the GC queue that a task has been executed.
    pub fn task_executed(&self, task: TaskId) -> u32 {
        self.add_task(task)
    }

    /// Notify the GC queue that a task has been accessed.
    pub fn task_accessed(&self, task: TaskId) -> u32 {
        self.add_task(task)
    }

    fn add_task(&self, task: TaskId) -> u32 {
        let _ = self.incoming_tasks.push(task);
        if self.incoming_tasks_count.fetch_add(1, Ordering::Acquire) % TASKS_PER_NEW_GENERATION
            == TASKS_PER_NEW_GENERATION - 1
        {
            self.incoming_tasks_count
                .fetch_sub(TASKS_PER_NEW_GENERATION, Ordering::Release);
            // We are selected to move TASKS_PER_NEW_GENERATION tasks into a generation
            let gen = self.generation.fetch_add(1, Ordering::Relaxed);
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
            self.generation.load(Ordering::Relaxed)
        }
    }

    fn process_old_generation(&self, backend: &MemoryBackend) -> ProcessGenerationResult {
        let old_generation = {
            let guard = &mut self.generations.lock();
            guard.pop_back()
        };
        let Some(OldGeneration {
            mut tasks,
            generation,
        }) = old_generation
        else {
            // No old generation to process
            return ProcessGenerationResult {
                priority: None,
                count: 0,
            };
        };
        // Check all tasks for the correct generation
        let mut indices = Vec::with_capacity(tasks.len());
        assert!(tasks.len() <= MAX_TASKS_PER_OLD_GENERATION);
        for (i, task) in tasks.iter().enumerate() {
            backend.with_task(*task, |task| {
                if let Some(state) = task.gc_state() {
                    if state.generation <= generation {
                        indices.push((Reverse(state.priority), i as u32));
                    }
                }
            });
        }

        if indices.is_empty() {
            // No valid tasks in old generation to process
            return ProcessGenerationResult {
                priority: None,
                count: 0,
            };
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
        let mut count = 0;
        for task in tasks[..tasks_to_collect].iter() {
            backend.with_task(*task, |task| {
                if task.run_gc(generation) {
                    count += 1;
                }
            });
        }

        ProcessGenerationResult {
            priority: Some(max_priority),
            count,
        }
    }

    /// Run garbage collection on the queue.
    pub fn run_gc(&self, backend: &MemoryBackend) -> Option<(GcPriority, usize)> {
        let span =
            tracing::trace_span!("garbage collection", priority = Empty, count = Empty).entered();

        let ProcessGenerationResult { priority, count } = self.process_old_generation(backend);

        span.record("count", count);
        if let Some(priority) = &priority {
            span.record("priority", debug(priority));
        } else {
            span.record("priority", "");
        }

        priority.map(|p| (p, count))
    }
}
