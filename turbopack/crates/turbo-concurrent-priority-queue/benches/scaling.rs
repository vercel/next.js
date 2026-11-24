//! Scaling benchmarks: how throughput changes with the number of cores, for
//! [`ConcurrentPriorityQueue`] compared with a `Mutex<BinaryHeap>` of all items and a
//! `Mutex<VecHeap>` (a heap of the distinct priorities plus a `Vec` of items per priority, like one
//! shard of [`ConcurrentPriorityQueue`]), both with strict priority order, and an unbounded
//! `ConcurrentQueue` (lock-free, but no priority order at all, so it is a throughput reference
//! rather than a drop-in alternative).
//!
//! [`ConcurrentPriorityQueue`] runs as `sharded`, with one shard per worker thread (the number of
//! shards it is meant to be used with), and as `sharded_fixed31`, with [`MAX_SHARD_COUNT`] shards
//! whatever the thread count, to show what sizing the shard count to the threads changes.
//!
//! The benchmark uses one worker thread per available core ([`thread::available_parallelism`],
//! which respects the process's CPU affinity). To measure scaling, run it several times with
//! different core counts, e.g. `taskset -c 0,2,4,6 cargo bench ...` for 4 cores (on machines with
//! SMT, pick one CPU per physical core first). Running fewer threads than cores, or more, would
//! measure something else: idle cores, or threads being preempted while they hold a lock.
//!
//! Every benchmark iteration does a fixed amount of work, split across the threads, so the time per
//! iteration directly shows how well an implementation scales: perfect scaling halves it when the
//! core count doubles. Benchmark ids are
//! `turbo_concurrent_priority_queue_scaling/<workload>/<mix>/<impl>/<threads>`, where `<threads>`
//! is the number of available cores.
//!
//! Workloads:
//! - `mixed1`, `mixed2`, `mixed128`, `mixed1024`: like a task scheduler, every thread pops an item
//!   and then pushes the item's children, until all work is done. `mixedN` items have `N` children,
//!   but only one in `N` items has any (`mixed1`: every item has one child; `mixed1024`: one in
//!   1024 items has 1024 children). Every item carries a remaining work counter (see [`Fan`]), so
//!   every run and every implementation pops exactly [`TOTAL_OPS`] items. The queue is prefilled
//!   with items of the same shape (not timed; they all land in the prefilling thread's home shard
//!   of the sharded queue, like in `drain`). A thread that finds the queue empty waits for other
//!   threads' children until all threads are idle;
//! - `drain`: the queue is prefilled with [`TOTAL_OPS`] items (not timed); all threads pop until it
//!   is empty;
//! - `fill`: all threads only push, [`TOTAL_OPS`] items together; the queue is drained afterwards
//!   (not timed).
//!
//! Priority mixes:
//! - `single`: every item has priority 0;
//! - `skewed`: like a build: most items have the lowest priority, a few have one of three higher
//!   ones. The priority is computed from the low bits of the item value (cheap, see
//!   [`Mix::priority`]);
//! - `uniform128`: the items are spread over 128 priorities (the low 7 bits of the item value).
//!
//! `drain` and `fill` items have sequential values, so their priorities cycle through the mix.
//! `mixed*` items get pseudo-random low bits: every thread precomputes [`RANDOM_LEN`] values from a
//! fixed seed (outside the timed region) and takes them round robin.
//!
//! The worker threads are spawned once per Criterion sample; each iteration releases them with a
//! start barrier and waits for them with an end barrier. Only the time between the two (including
//! the barrier hand-off) is measured; prefilling, draining and checking happen outside of it. Every
//! iteration checks its item counts, so a broken queue makes the benchmark panic instead of
//! reporting a meaningless number. A panic in any benchmark thread exits the process (see
//! [`ExitOnPanic`]), so it fails instead of leaving the other threads waiting forever.

use std::{
    collections::{BinaryHeap, HashMap},
    hint::black_box,
    sync::{
        Barrier,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use concurrent_queue::ConcurrentQueue;
use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use parking_lot::Mutex;
use turbo_concurrent_priority_queue::{ConcurrentPriorityQueue, MAX_SHARD_COUNT};

/// Items per iteration of every workload (all threads together): `fill` pushes exactly this many,
/// `drain` and `mixed*` pop exactly this many.
const TOTAL_OPS: usize = 1 << 19;
/// How many items the queue is prefilled with for `mixed*` (see [`Fan`]).
const FAN_PREFILL: usize = 4096;
/// The work counter of the prefilled `mixed*` items that have children: every prefilled item is
/// popped, and the ones with children add `FAN_WORK` times their share, so
/// `FAN_PREFILL * (1 + FAN_WORK) = TOTAL_OPS` items are popped in total.
const FAN_WORK: u64 = (TOTAL_OPS / FAN_PREFILL - 1) as u64;
const _: () = assert!(FAN_PREFILL * (1 + FAN_WORK as usize) == TOTAL_OPS);
/// The low bits of a `mixed*` item value that are pseudo-random and determine its priority; the
/// bits above hold its work counter.
const RANDOM_BITS: u32 = 7;
/// How many pseudo-random values every thread precomputes for `mixed*` items.
const RANDOM_LEN: usize = 1 << 14;

/// The operations the benchmarks need, implemented by every compared queue.
trait BenchQueue: Sync {
    const NAME: &'static str;
    /// Creates an empty queue that `threads` threads will use.
    fn new(threads: usize) -> Self;
    fn push(&self, priority: u32, item: u64);
    fn pop(&self) -> Option<u64>;
}

impl BenchQueue for ConcurrentPriorityQueue<u32, u64> {
    const NAME: &'static str = "sharded";

    fn new(threads: usize) -> Self {
        ConcurrentPriorityQueue::with_shards(threads.clamp(1, MAX_SHARD_COUNT))
    }

    fn push(&self, priority: u32, item: u64) {
        ConcurrentPriorityQueue::push(self, priority, item);
    }

    fn pop(&self) -> Option<u64> {
        ConcurrentPriorityQueue::pop(self).map(|(_, item)| item)
    }
}

/// [`ConcurrentPriorityQueue`] with [`MAX_SHARD_COUNT`] shards, independent of the thread count.
struct ShardedFixed(ConcurrentPriorityQueue<u32, u64>);

impl BenchQueue for ShardedFixed {
    const NAME: &'static str = "sharded_fixed31";

    fn new(_threads: usize) -> Self {
        ShardedFixed(ConcurrentPriorityQueue::with_shards(MAX_SHARD_COUNT))
    }

    fn push(&self, priority: u32, item: u64) {
        self.0.push(priority, item);
    }

    fn pop(&self) -> Option<u64> {
        self.0.pop().map(|(_, item)| item)
    }
}

/// A [`MutexHeap`] entry, ordered by priority only: the item value doesn't break ties (for
/// `mixed*` its high bits are the work counter, which would pop items with children first).
struct HeapEntry {
    priority: u32,
    item: u64,
}

impl PartialEq for HeapEntry {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}

impl Eq for HeapEntry {}

impl PartialOrd for HeapEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for HeapEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority.cmp(&other.priority)
    }
}

struct MutexHeap(Mutex<BinaryHeap<HeapEntry>>);

impl BenchQueue for MutexHeap {
    const NAME: &'static str = "mutex_heap";

    fn new(_threads: usize) -> Self {
        MutexHeap(Mutex::new(BinaryHeap::new()))
    }

    fn push(&self, priority: u32, item: u64) {
        self.0.lock().push(HeapEntry { priority, item });
    }

    fn pop(&self) -> Option<u64> {
        self.0.lock().pop().map(|entry| entry.item)
    }
}

/// A heap of the distinct priorities plus a `Vec` of items per priority; items with the same
/// priority are LIFO.
#[derive(Default)]
struct VecHeap {
    priorities: BinaryHeap<u32>,
    items: HashMap<u32, Vec<u64>>,
}

struct MutexVecHeap(Mutex<VecHeap>);

impl BenchQueue for MutexVecHeap {
    const NAME: &'static str = "mutex_vec_heap";

    fn new(_threads: usize) -> Self {
        MutexVecHeap(Mutex::new(VecHeap::default()))
    }

    fn push(&self, priority: u32, item: u64) {
        let mut queue = self.0.lock();
        let VecHeap { priorities, items } = &mut *queue;
        let list = items.entry(priority).or_default();
        if list.is_empty() {
            priorities.push(priority);
        }
        list.push(item);
    }

    fn pop(&self) -> Option<u64> {
        let mut queue = self.0.lock();
        let VecHeap { priorities, items } = &mut *queue;
        let priority = *priorities.peek()?;
        let list = items
            .get_mut(&priority)
            .expect("every priority in the heap has items");
        let item = list.pop().expect("every priority in the heap has items");
        if list.is_empty() {
            items.remove(&priority);
            priorities.pop();
        }
        Some(item)
    }
}

struct Unordered(ConcurrentQueue<(u32, u64)>);

impl BenchQueue for Unordered {
    const NAME: &'static str = "concurrent_queue";

    fn new(_threads: usize) -> Self {
        Unordered(ConcurrentQueue::unbounded())
    }

    fn push(&self, priority: u32, item: u64) {
        self.0
            .push((priority, item))
            .expect("an unbounded queue that is never closed accepts every push");
    }

    fn pop(&self) -> Option<u64> {
        self.0.pop().ok().map(|(_, item)| item)
    }
}

/// How `mixed*` items fan out. An item value is `work << RANDOM_BITS | random`: `random` is
/// pseudo-random and determines the priority, `work` is the remaining work counter. An item with
/// `work > 0` has [`Fan::children`] children: `children - 1` of them with `work = 0` (they have no
/// children) and one with `work - 1`, all with new random bits. The prefill has the same shape:
/// one in `children` of the [`FAN_PREFILL`] items has `work = FAN_WORK`, the others 0. So the
/// total work doesn't depend on which thread pops which item: every item with children starts a
/// chain of [`FAN_WORK`] fan-outs, and `FAN_PREFILL * (1 + FAN_WORK) = TOTAL_OPS` items are
/// popped.
#[derive(Clone, Copy)]
enum Fan {
    /// Every item has 1 child.
    One,
    /// One in 2 items has 2 children.
    Two,
    /// One in 128 items has 128 children.
    OneTwentyEight,
    /// One in 1024 items has 1024 children.
    TenTwentyFour,
}

impl Fan {
    const ALL: [Fan; 4] = [Fan::One, Fan::Two, Fan::OneTwentyEight, Fan::TenTwentyFour];

    fn name(self) -> &'static str {
        match self {
            Fan::One => "mixed1",
            Fan::Two => "mixed2",
            Fan::OneTwentyEight => "mixed128",
            Fan::TenTwentyFour => "mixed1024",
        }
    }

    /// How many children an item with `work > 0` has.
    fn children(self) -> usize {
        match self {
            Fan::One => 1,
            Fan::Two => 2,
            Fan::OneTwentyEight => 128,
            Fan::TenTwentyFour => 1024,
        }
    }

    /// The work counter of the `index`-th prefilled item.
    fn prefill_work(self, index: usize) -> u64 {
        if index.is_multiple_of(self.children()) {
            FAN_WORK
        } else {
            0
        }
    }

    /// Pushes the children of `item`, if it has any.
    fn push_children<Q: BenchQueue>(self, queue: &Q, mix: Mix, random: &mut Random, item: u64) {
        let work = item >> RANDOM_BITS;
        if work > 0 {
            for _ in 1..self.children() {
                push_item(queue, mix, random.item(0));
            }
            push_item(queue, mix, random.item(work - 1));
        }
    }
}

const _: () = assert!(FAN_PREFILL.is_multiple_of(1024));

/// Pseudo-random low bits for `mixed*` items: [`RANDOM_LEN`] values precomputed from a fixed
/// seed, taken round robin.
struct Random {
    values: Box<[u8; RANDOM_LEN]>,
    next: usize,
}

impl Random {
    /// The values for `thread` (a worker thread index, or [`SETUP_THREAD`]).
    fn new(thread: usize) -> Self {
        // SplitMix64, seeded per thread.
        let mut state = 0x5eed_0000_0000_0000 ^ (thread as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let mut values = Box::new([0; RANDOM_LEN]);
        for value in values.iter_mut() {
            state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut z = state;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            z ^= z >> 31;
            *value = (z & ((1 << RANDOM_BITS) - 1)) as u8;
        }
        Random { values, next: 0 }
    }

    /// Starts over at the first value, so every iteration sees the same sequence.
    fn reset(&mut self) {
        self.next = 0;
    }

    /// A new `mixed*` item value with work counter `work` and the next random bits.
    fn item(&mut self, work: u64) -> u64 {
        let random = self.values[self.next];
        self.next = (self.next + 1) % RANDOM_LEN;
        work << RANDOM_BITS | u64::from(random)
    }
}

#[derive(Clone, Copy)]
enum Workload {
    Fan(Fan),
    Drain,
    Fill,
}

impl Workload {
    fn all() -> impl Iterator<Item = Workload> {
        Fan::ALL
            .into_iter()
            .map(Workload::Fan)
            .chain([Workload::Drain, Workload::Fill])
    }

    fn name(self) -> &'static str {
        match self {
            Workload::Fan(fan) => fan.name(),
            Workload::Drain => "drain",
            Workload::Fill => "fill",
        }
    }

    /// Pops (`mixed*`, `drain`) or pushes (`fill`) of one iteration, all threads together.
    fn ops(self) -> usize {
        TOTAL_OPS
    }
}

#[derive(Clone, Copy)]
enum Mix {
    Single,
    Skewed,
    Uniform128,
}

impl Mix {
    const ALL: [Mix; 3] = [Mix::Single, Mix::Skewed, Mix::Uniform128];

    fn name(self) -> &'static str {
        match self {
            Mix::Single => "single",
            Mix::Skewed => "skewed",
            Mix::Uniform128 => "uniform128",
        }
    }

    /// The priority of an item, from the low bits of its value: for `skewed`, from the low 4 bits,
    /// 12 in 16 values get priority 0, 2 get 1, 1 gets 2 and 1 gets 3; for `uniform128`, the low 7
    /// bits, so the items are spread over 128 priorities.
    fn priority(self, item: u64) -> u32 {
        match self {
            Mix::Single => 0,
            Mix::Skewed => match item & 15 {
                0..=11 => 0,
                12 | 13 => 1,
                14 => 2,
                _ => 3,
            },
            Mix::Uniform128 => (item & 127) as u32,
        }
    }
}

/// A unique item value for the `index`-th item pushed by thread `thread` (`drain`, `fill`).
fn item(thread: usize, index: usize) -> u64 {
    (thread as u64) << 32 | index as u64
}

/// Thread index used for items pushed outside of the timed region (prefill).
const SETUP_THREAD: usize = u32::MAX as usize;

fn push_item<Q: BenchQueue>(queue: &Q, mix: Mix, item: u64) {
    queue.push(mix.priority(item), item);
}

/// Pops an item, or, when the queue is empty, waits until another thread pushes one. Returns
/// `None` once all `threads` threads are waiting (all work is done). `idle` counts the waiting
/// threads; it is only touched when a pop finds the queue empty.
fn pop_or_wait<Q: BenchQueue>(queue: &Q, idle: &AtomicUsize, threads: usize) -> Option<u64> {
    if let Some(item) = queue.pop() {
        return Some(item);
    }
    idle.fetch_add(1, Ordering::SeqCst);
    loop {
        if let Some(item) = queue.pop() {
            idle.fetch_sub(1, Ordering::SeqCst);
            return Some(item);
        }
        // A thread that holds a popped item hasn't counted itself as idle, so this can't be
        // reached while one still has children to push... except in the window between another
        // waiting thread's successful pop and its `fetch_sub`. Then this thread stops early, and
        // the remaining work is done by the threads that hold items, which never stop before
        // they find the queue empty themselves.
        if idle.load(Ordering::SeqCst) == threads {
            return None;
        }
        std::hint::spin_loop();
    }
}

/// The work one thread does in one iteration. Returns how many items it popped.
fn work<Q: BenchQueue>(
    queue: &Q,
    workload: Workload,
    mix: Mix,
    thread: usize,
    threads: usize,
    idle: &AtomicUsize,
    random: &mut Random,
) -> usize {
    match workload {
        Workload::Fan(fan) => {
            let mut popped = 0;
            while let Some(item) = pop_or_wait(queue, idle, threads) {
                popped += 1;
                fan.push_children(queue, mix, random, item);
            }
            popped
        }
        Workload::Drain => {
            let mut popped = 0;
            while let Some(item) = queue.pop() {
                black_box(item);
                popped += 1;
            }
            popped
        }
        Workload::Fill => {
            // The first `ops % threads` threads push one item more, so the shares add up to `ops`
            // for any core count.
            let ops = workload.ops();
            let share = ops / threads + usize::from(thread < ops % threads);
            for index in 0..share {
                push_item(queue, mix, item(thread, index));
            }
            0
        }
    }
}

fn prefill<Q: BenchQueue>(queue: &Q, workload: Workload, mix: Mix, random: &mut Random) {
    match workload {
        Workload::Fan(fan) => {
            for index in 0..FAN_PREFILL {
                push_item(queue, mix, random.item(fan.prefill_work(index)));
            }
        }
        Workload::Drain => {
            for index in 0..TOTAL_OPS {
                push_item(queue, mix, item(SETUP_THREAD, index));
            }
        }
        Workload::Fill => {}
    }
}

fn drain_count<Q: BenchQueue>(queue: &Q) -> usize {
    std::iter::from_fn(|| queue.pop()).count()
}

/// Exits the process when dropped while its thread panics. [`Barrier`]s aren't poisoned, so
/// without it a panicking worker would leave the coordinator (and a panicking coordinator the
/// workers) waiting at a barrier forever, and the benchmark would hang instead of failing. The
/// panic hook has already printed the panic message when this runs.
struct ExitOnPanic;

impl Drop for ExitOnPanic {
    fn drop(&mut self) {
        if thread::panicking() {
            eprintln!("a benchmark thread panicked, exiting");
            std::process::exit(101);
        }
    }
}

/// Runs `iters` iterations with `threads` worker threads and returns the measured time.
fn run<Q: BenchQueue>(workload: Workload, mix: Mix, threads: usize, iters: u64) -> Duration {
    let queue = Q::new(threads);
    let start = Barrier::new(threads + 1);
    let end = Barrier::new(threads + 1);
    let idle = AtomicUsize::new(0);
    let popped = AtomicUsize::new(0);
    thread::scope(|scope| {
        // Before any worker is spawned, so a failure while spawning or preparing them can't leave
        // the spawned ones waiting at the start barrier.
        let _exit_on_panic = ExitOnPanic;
        for thread in 0..threads {
            let (queue, start, end, idle, popped) = (&queue, &start, &end, &idle, &popped);
            // Precomputed here, before any timing starts.
            let mut random = Random::new(thread);
            scope.spawn(move || {
                let _exit_on_panic = ExitOnPanic;
                for _ in 0..iters {
                    random.reset();
                    start.wait();
                    let count = work(queue, workload, mix, thread, threads, idle, &mut random);
                    popped.fetch_add(count, Ordering::Relaxed);
                    end.wait();
                }
            });
        }
        let mut setup_random = Random::new(SETUP_THREAD);
        let mut elapsed = Duration::ZERO;
        for _ in 0..iters {
            // Workers are waiting at the start barrier, so the queue is ours.
            setup_random.reset();
            prefill(&queue, workload, mix, &mut setup_random);
            idle.store(0, Ordering::Relaxed);
            popped.store(0, Ordering::Relaxed);
            let begin = Instant::now();
            start.wait();
            end.wait();
            elapsed += begin.elapsed();
            let left = drain_count(&queue);
            let (expected_left, expected_popped) = match workload {
                Workload::Fan(_) | Workload::Drain => (0, TOTAL_OPS),
                Workload::Fill => (TOTAL_OPS, 0),
            };
            let id = format!("{}/{}/{}/{threads}", workload.name(), mix.name(), Q::NAME);
            assert_eq!(left, expected_left, "{id}: items left in the queue");
            assert_eq!(
                popped.load(Ordering::Relaxed),
                expected_popped,
                "{id}: items popped"
            );
        }
        elapsed
    })
}

/// Checks with a sequential run that every `mixed*` workload pops exactly [`TOTAL_OPS`] items, and
/// that its random bits spread the items over all 128 `uniform128` priorities.
fn check_fan_totals() {
    for fan in Fan::ALL {
        let queue = MutexStack::new(1);
        let mut random = Random::new(SETUP_THREAD);
        prefill(&queue, Workload::Fan(fan), Mix::Single, &mut random);
        let prefilled = queue.0.lock().clone();
        assert_eq!(prefilled.len(), FAN_PREFILL, "{}: prefill size", fan.name());
        assert_eq!(
            prefilled
                .iter()
                .filter(|&&item| item >> RANDOM_BITS == FAN_WORK)
                .count(),
            FAN_PREFILL / fan.children(),
            "{}: prefilled items with children",
            fan.name()
        );
        let mut random = Random::new(0);
        let mut pops = 0;
        let mut counts = [0usize; 128];
        while let Some(item) = queue.pop() {
            pops += 1;
            counts[Mix::Uniform128.priority(item) as usize] += 1;
            fan.push_children(&queue, Mix::Single, &mut random, item);
        }
        assert_eq!(pops, TOTAL_OPS, "{}: total pops", fan.name());
        assert!(
            counts.iter().all(|&count| count > 0),
            "{}: not every uniform128 priority is used",
            fan.name()
        );
    }
}

/// A plain stack for [`check_fan_totals`] (not benchmarked).
struct MutexStack(Mutex<Vec<u64>>);

impl BenchQueue for MutexStack {
    const NAME: &'static str = "mutex_stack";

    fn new(_threads: usize) -> Self {
        MutexStack(Mutex::new(Vec::new()))
    }

    fn push(&self, _priority: u32, item: u64) {
        self.0.lock().push(item);
    }

    fn pop(&self) -> Option<u64> {
        self.0.lock().pop()
    }
}

/// Checks that `uniform128` spreads the `drain`/`fill` items evenly over 128 priorities.
fn check_uniform_priorities() {
    let mut counts = [0usize; 128];
    for index in 0..TOTAL_OPS {
        counts[Mix::Uniform128.priority(item(SETUP_THREAD, index)) as usize] += 1;
    }
    assert!(
        counts.iter().all(|&count| count == TOTAL_OPS / 128),
        "uniform128: uneven priorities"
    );
}

/// Checks on one thread that a strictly ordered queue pops every item, highest priority first.
fn check_strict_order<Q: BenchQueue>(threads: usize) {
    let queue = Q::new(threads);
    for index in 0..4096 {
        let item = item(SETUP_THREAD, index);
        queue.push(Mix::Uniform128.priority(item), item);
    }
    let mut last = u32::MAX;
    let mut count = 0;
    while let Some(item) = queue.pop() {
        let priority = Mix::Uniform128.priority(item);
        assert!(
            priority <= last,
            "{}: popped out of priority order",
            Q::NAME
        );
        last = priority;
        count += 1;
    }
    assert_eq!(count, 4096, "{}: items popped", Q::NAME);
}

fn bench_impl<Q: BenchQueue>(c: &mut Criterion, threads: usize) {
    let mut group = c.benchmark_group("turbo_concurrent_priority_queue_scaling");
    group.sample_size(10);
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(3));
    for workload in Workload::all() {
        group.throughput(Throughput::Elements(workload.ops() as u64));
        for mix in Mix::ALL {
            let id = BenchmarkId::new(
                format!("{}/{}/{}", workload.name(), mix.name(), Q::NAME),
                threads,
            );
            group.bench_function(id, |b| {
                b.iter_custom(|iters| run::<Q>(workload, mix, threads, iters))
            });
        }
    }
    group.finish();
}

fn scaling(c: &mut Criterion) {
    check_fan_totals();
    check_uniform_priorities();
    // `MutexHeap` doesn't break ties by the item value (which holds the `mixed*` work counter).
    assert!(
        HeapEntry {
            priority: 0,
            item: FAN_WORK << RANDOM_BITS,
        } == HeapEntry {
            priority: 0,
            item: 0,
        },
        "mutex_heap: the item value must not affect the order"
    );
    // One worker thread per available core; vary the core count from the outside (see the module
    // docs).
    let threads = thread::available_parallelism().map_or(1, |n| n.get());
    check_strict_order::<ConcurrentPriorityQueue<u32, u64>>(threads);
    check_strict_order::<ShardedFixed>(threads);
    check_strict_order::<MutexHeap>(threads);
    check_strict_order::<MutexVecHeap>(threads);
    bench_impl::<ConcurrentPriorityQueue<u32, u64>>(c, threads);
    bench_impl::<ShardedFixed>(c, threads);
    bench_impl::<MutexHeap>(c, threads);
    bench_impl::<MutexVecHeap>(c, threads);
    bench_impl::<Unordered>(c, threads);
}

criterion_group!(benches, scaling);
criterion_main!(benches);
