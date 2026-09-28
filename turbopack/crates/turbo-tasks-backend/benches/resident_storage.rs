use std::{
    hint::black_box,
    num::NonZeroU64,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
    time::Instant,
};

use criterion::{BenchmarkId, Criterion, Throughput};
use parking_lot::{MappedMutexGuard, Mutex, MutexGuard, lock_api::RawMutex as _};
use turbo_tasks::{FxDashMap, TaskId};
use turbo_tasks_malloc::TurboMalloc;

#[allow(dead_code, unused_imports)]
#[path = "../src/backend/dense_task_map.rs"]
mod dense_task_map;

use dense_task_map::{TaskMap, TaskSlotValue};

const LOOKUP_TASKS: u32 = 64 * 1024;
const BUILD_TASKS: u32 = 8 * 1024;
const SPARSE_TASKS: u32 = LOOKUP_TASKS / 10;

struct Payload {
    niche: NonZeroU64,
    data: [u64; 14],
    lock: Mutex<()>,
    occupied: bool,
}

impl Payload {
    fn new(id: u32) -> Self {
        Self {
            niche: NonZeroU64::new(id as u64).unwrap(),
            data: [0; 14],
            lock: Mutex::new(()),
            occupied: false,
        }
    }

    fn set(&mut self, id: u32) {
        self.niche = NonZeroU64::new(id as u64).unwrap();
        self.data = [0; 14];
    }

    fn value(&self) -> u64 {
        self.niche.get()
    }
}

// SAFETY: Benchmark payload follows the same stable intrusive-lock/presence contract as
// TaskStorage. All access through TaskMap is guarded.
unsafe impl TaskSlotValue for Payload {
    const EMPTY: Self = Self {
        niche: NonZeroU64::MIN,
        data: [0; 14],
        lock: Mutex::new(()),
        occupied: false,
    };

    unsafe fn lock_raw(value: *const Self) {
        // SAFETY: TaskMap provides a live, stable benchmark payload pointer.
        let lock = unsafe { &*std::ptr::addr_of!((*value).lock) };
        unsafe { lock.raw() }.lock();
    }

    unsafe fn unlock_raw(value: *const Self) {
        // SAFETY: the current thread owns the lock acquired from this value.
        let lock = unsafe { &*std::ptr::addr_of!((*value).lock) };
        let raw = unsafe { lock.raw() };
        unsafe { raw.unlock() };
    }

    fn is_occupied(&self) -> bool {
        self.occupied
    }

    fn occupy(&mut self) {
        self.occupied = true;
    }

    fn take_and_vacate(&mut self) -> Self {
        let detached = Self {
            niche: self.niche,
            data: self.data,
            lock: Mutex::new(()),
            occupied: false,
        };
        self.niche = NonZeroU64::MIN;
        self.data = [0; 14];
        self.occupied = false;
        detached
    }

    fn vacate_in_place(&mut self) {
        self.niche = NonZeroU64::MIN;
        self.data = [0; 14];
        self.occupied = false;
    }
}

const CHUNK_SIZE: usize = dense_task_map::CHUNK_SIZE;
const CHUNK_SHIFT: usize = dense_task_map::CHUNK_SHIFT;
const CHUNK_MASK: usize = CHUNK_SIZE - 1;

type ExternalSlot = Mutex<Option<Payload>>;

struct ExternalChunk {
    slots: Box<[ExternalSlot; CHUNK_SIZE]>,
}

impl ExternalChunk {
    fn new() -> Self {
        Self {
            slots: Box::new(std::array::from_fn(|_| Mutex::new(None))),
        }
    }
}

struct ExternalMap {
    chunks: boxcar::Vec<OnceLock<Box<ExternalChunk>>>,
    len: AtomicUsize,
}

impl ExternalMap {
    fn new() -> Self {
        Self {
            chunks: boxcar::Vec::new(),
            len: AtomicUsize::new(0),
        }
    }

    fn chunk(&self, index: usize) -> Option<&ExternalChunk> {
        self.chunks
            .get(index >> CHUNK_SHIFT)?
            .get()
            .map(Box::as_ref)
    }

    fn get_or_create_chunk(&self, index: usize) -> &ExternalChunk {
        let chunk_index = index >> CHUNK_SHIFT;
        loop {
            if let Some(chunk) = self.chunks.get(chunk_index) {
                return chunk.get_or_init(|| Box::new(ExternalChunk::new()));
            }
            if self.chunks.count() <= chunk_index {
                self.chunks.push(OnceLock::new());
            } else {
                std::hint::spin_loop();
            }
        }
    }

    fn get(&self, id: TaskId) -> Option<MappedMutexGuard<'_, Payload>> {
        let index = *id as usize;
        let chunk = self.chunk(index)?;
        MutexGuard::try_map(chunk.slots[index & CHUNK_MASK].lock(), Option::as_mut).ok()
    }

    fn get_or_insert(&self, id: TaskId) -> MappedMutexGuard<'_, Payload> {
        let index = *id as usize;
        let chunk = self.get_or_create_chunk(index);
        let mut slot = chunk.slots[index & CHUNK_MASK].lock();
        if slot.is_none() {
            *slot = Some(Payload::new(*id));
            self.len.fetch_add(1, Ordering::Relaxed);
        }
        MutexGuard::map(slot, |slot| slot.as_mut().unwrap())
    }

    fn remove(&self, id: TaskId) -> Option<Payload> {
        let index = *id as usize;
        let value = self.chunk(index)?.slots[index & CHUNK_MASK].lock().take();
        if value.is_some() {
            self.len.fetch_sub(1, Ordering::Relaxed);
        }
        value
    }

    fn chunks(&self) -> impl Iterator<Item = &ExternalChunk> {
        self.chunks
            .iter()
            .filter_map(|(_, chunk)| chunk.get().map(Box::as_ref))
    }
}

fn external_map(count: u32, stride: u32) -> ExternalMap {
    let map = ExternalMap::new();
    for i in 1..=count {
        let raw = i * stride;
        map.get_or_insert(task_id(raw)).set(raw);
    }
    map
}

fn task_id(raw: u32) -> TaskId {
    TaskId::try_from(raw).unwrap()
}

fn dash_map(count: u32, stride: u32) -> FxDashMap<TaskId, Box<Payload>> {
    let map = FxDashMap::with_capacity_and_hasher(count as usize, Default::default());
    for i in 1..=count {
        let raw = i * stride;
        map.insert(task_id(raw), Box::new(Payload::new(raw)));
    }
    map
}

fn dense_map(count: u32, stride: u32) -> TaskMap<Payload> {
    let map = TaskMap::<Payload>::new(true);
    for i in 1..=count {
        let raw = i * stride;
        map.get_or_insert(task_id(raw)).set(raw);
    }
    map
}

fn memory_delta<M>(build: impl FnOnce() -> M) -> (i128, usize) {
    TurboMalloc::collect(true);
    let before = TurboMalloc::allocation_counters();
    let value = build();
    black_box(&value);
    let after = TurboMalloc::allocation_counters();
    let live = (after.allocations - before.allocations) as i128
        - (after.deallocations - before.deallocations) as i128;
    let allocations = after.allocation_count - before.allocation_count;
    drop(value);
    (live, allocations)
}

fn report_memory(count: u32, stride: u32, shape: &str) {
    let (dash_bytes, dash_allocations) = memory_delta(|| dash_map(count, stride));
    let (external_bytes, external_allocations) = memory_delta(|| external_map(count, stride));
    let (dense_bytes, dense_allocations) = memory_delta(|| dense_map(count, stride));

    println!(
        "resident_storage_memory shape={shape} residents={count} high_water={} \
         dash_bytes={dash_bytes} dash_bytes_per_task={:.2} dash_allocations={dash_allocations} \
         external_bytes={external_bytes} external_bytes_per_task={:.2} \
         external_allocations={external_allocations} dense_bytes={dense_bytes} \
         dense_bytes_per_task={:.2} dense_allocations={dense_allocations}",
        count * stride,
        dash_bytes as f64 / count as f64,
        external_bytes as f64 / count as f64,
        dense_bytes as f64 / count as f64,
    );
}

fn measure_isolated_memory<M>(mode: &str, count: u32, stride: u32, build: impl FnOnce() -> M) {
    TurboMalloc::collect(true);
    let before = TurboMalloc::allocation_counters();
    let map = build();
    black_box(&map);
    let after = TurboMalloc::allocation_counters();
    let allocated = after.allocations - before.allocations;
    let deallocated = after.deallocations - before.deallocations;
    println!(
        "resident_storage_isolated_memory impl={mode} residents={count} stride={stride} \
         allocated={allocated} deallocated={deallocated} live={} allocations={}",
        allocated as i128 - deallocated as i128,
        after.allocation_count - before.allocation_count,
    );
}

fn report_isolated_memory(mode: &str, count: u32, stride: u32) {
    match mode {
        "dash" => measure_isolated_memory(mode, count, stride, || dash_map(count, stride)),
        "external" => measure_isolated_memory(mode, count, stride, || external_map(count, stride)),
        "dense" => measure_isolated_memory(mode, count, stride, || dense_map(count, stride)),
        _ => panic!("unknown RESIDENT_STORAGE_MEMORY_IMPL: {mode}"),
    }
}

fn report_reclamation(count: u32) {
    TurboMalloc::collect(true);
    let before = TurboMalloc::allocation_counters();
    let dense = dense_map(count, 1);
    let live = TurboMalloc::allocation_counters();
    let loaded_before = dense.loaded_chunk_count();
    for raw in 1..=count {
        assert!(dense.remove_discard(task_id(raw)));
    }
    let retired = dense.retire_empty_chunks();
    TurboMalloc::collect(true);
    let after = TurboMalloc::allocation_counters();
    let live_delta = (live.allocations - before.allocations) as i128
        - (live.deallocations - before.deallocations) as i128;
    let after_delta = (after.allocations - before.allocations) as i128
        - (after.deallocations - before.deallocations) as i128;
    println!(
        "resident_storage_reclamation tasks={count} chunk_size={} directory_entry_size={} \
         directory_entries={} loaded_before={loaded_before} retired={retired} loaded_after={} \
         live_counter_delta={live_delta} after_counter_delta={after_delta}",
        dense_task_map::CHUNK_SIZE,
        TaskMap::<Payload>::directory_entry_size(),
        dense.directory_entry_count(),
        dense.loaded_chunk_count(),
    );
    black_box(dense);
}

pub fn resident_storage(c: &mut Criterion) {
    if let Ok(mode) = std::env::var("RESIDENT_STORAGE_MEMORY_IMPL") {
        let count = std::env::var("RESIDENT_STORAGE_MEMORY_COUNT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(100_000);
        let stride = std::env::var("RESIDENT_STORAGE_MEMORY_STRIDE")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(1);
        report_isolated_memory(&mode, count, stride);
        return;
    }

    report_reclamation(100_000);
    report_memory(100_000, 1, "dense");
    report_memory(10_000, 10, "warm_sparse");

    let dash = dash_map(LOOKUP_TASKS, 1);
    let external = external_map(LOOKUP_TASKS, 1);
    let dense = dense_map(LOOKUP_TASKS, 1);

    let mut lookup = c.benchmark_group("resident_storage_lookup");
    lookup.throughput(Throughput::Elements(1));
    let mut next = 1_u32;
    lookup.bench_function("dash_map", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let item = dash.get(&task_id(next)).unwrap();
            black_box(item.value().as_ref().value())
        })
    });
    let mut next = 1_u32;
    lookup.bench_function("external_mutex", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            black_box(external.get(task_id(next)).unwrap().value())
        })
    });
    let mut next = 1_u32;
    lookup.bench_function("dense", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            black_box(dense.get(task_id(next)).unwrap().value())
        })
    });
    let mut next = 1_u32;
    lookup.bench_function("dash_map_mut", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let item = dash
                .entry(task_id(next))
                .or_insert_with(|| Box::new(Payload::new(next)));
            black_box(item.value().as_ref().value())
        })
    });
    let mut next = 1_u32;
    lookup.bench_function("external_mutex_mut", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            black_box(external.get_or_insert(task_id(next)).value())
        })
    });
    let mut next = 1_u32;
    lookup.bench_function("dense_mut", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            let item = dense.get(id).unwrap_or_else(|| dense.get_or_insert(id));
            black_box(item.value())
        })
    });
    lookup.finish();

    let mut build = c.benchmark_group("resident_storage_build");
    build.sample_size(20);
    build.throughput(Throughput::Elements(BUILD_TASKS as u64));
    build.bench_with_input(
        BenchmarkId::new("dash_map", BUILD_TASKS),
        &BUILD_TASKS,
        |b, &count| b.iter(|| black_box(dash_map(count, 1))),
    );
    build.bench_with_input(
        BenchmarkId::new("external_mutex", BUILD_TASKS),
        &BUILD_TASKS,
        |b, &count| b.iter(|| black_box(external_map(count, 1))),
    );
    build.bench_with_input(
        BenchmarkId::new("dense", BUILD_TASKS),
        &BUILD_TASKS,
        |b, &count| b.iter(|| black_box(dense_map(count, 1))),
    );
    build.finish();

    let dash = dash_map(LOOKUP_TASKS, 1);
    let external = external_map(LOOKUP_TASKS, 1);
    let dense = dense_map(LOOKUP_TASKS, 1);
    let mut reuse = c.benchmark_group("resident_storage_remove_reuse");
    let mut next = 1_u32;
    reuse.bench_function("dash_map", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            black_box(dash.remove(&id));
            black_box(dash.insert(id, Box::new(Payload::new(next))));
        })
    });
    let mut next = 1_u32;
    reuse.bench_function("external_mutex", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            black_box(external.remove(id));
            external.get_or_insert(id).set(next);
        })
    });
    let mut next = 1_u32;
    reuse.bench_function("dense", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            black_box(dense.remove(id));
            let mut item = dense.get_or_insert(id);
            item.set(next);
            black_box(item.value());
        })
    });
    reuse.finish();

    let external = external_map(LOOKUP_TASKS, 1);
    let dense = dense_map(LOOKUP_TASKS, 1);
    let mut discard_reuse = c.benchmark_group("resident_storage_discard_reuse");
    let mut next = 1_u32;
    discard_reuse.bench_function("external_mutex", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            black_box(external.remove(id));
            external.get_or_insert(id).set(next);
        })
    });
    let mut next = 1_u32;
    discard_reuse.bench_function("dense", |b| {
        b.iter(|| {
            next = next % LOOKUP_TASKS + 1;
            let id = task_id(next);
            black_box(dense.remove_discard(id));
            dense.get_or_insert(id).set(next);
        })
    });
    discard_reuse.finish();

    let dense = Arc::new(dense_map(256, 1));
    let nearby_ids = [1, 65, 129, 193].map(task_id);
    let mut concurrent_reuse = c.benchmark_group("resident_storage_concurrent_reuse");
    concurrent_reuse.bench_function("dense_nearby_ids", |b| {
        b.iter_custom(|iterations| {
            let per_thread = iterations.div_ceil(nearby_ids.len() as u64);
            let start = Instant::now();
            thread::scope(|scope| {
                for &id in &nearby_ids {
                    let dense = dense.clone();
                    scope.spawn(move || {
                        for _ in 0..per_thread {
                            black_box(dense.remove_discard(id));
                            dense.get_or_insert(id).set(*id);
                        }
                    });
                }
            });
            start.elapsed()
        })
    });
    concurrent_reuse.finish();

    let collision_probe = dash_map(0, 1);
    let first = task_id(1);
    let target_shard = collision_probe.determine_shard(collision_probe.hash_usize(&first));
    let colliding_ids: Vec<_> = (1..)
        .map(task_id)
        .filter(|id| {
            collision_probe.determine_shard(collision_probe.hash_usize(id)) == target_shard
        })
        .take(4)
        .collect();
    let dash = Arc::new(FxDashMap::default());
    let external = Arc::new(ExternalMap::new());
    let dense = Arc::new(TaskMap::<Payload>::new(true));
    for &id in &colliding_ids {
        dash.insert(id, Box::new(Payload::new(*id)));
        external.get_or_insert(id).set(*id);
        dense.get_or_insert(id).set(*id);
    }
    let mut contention = c.benchmark_group("resident_storage_independent_task_contention");
    contention.bench_function("dash_map_same_shard", |b| {
        b.iter_custom(|iterations| {
            let per_thread = iterations.div_ceil(colliding_ids.len() as u64);
            let start = Instant::now();
            thread::scope(|scope| {
                for &id in &colliding_ids {
                    let dash = dash.clone();
                    scope.spawn(move || {
                        for _ in 0..per_thread {
                            dash.get_mut(&id).unwrap().data[0] ^= 1;
                        }
                    });
                }
            });
            start.elapsed()
        })
    });
    contention.bench_function("external_mutex_independent_locks", |b| {
        b.iter_custom(|iterations| {
            let per_thread = iterations.div_ceil(colliding_ids.len() as u64);
            let start = Instant::now();
            thread::scope(|scope| {
                for &id in &colliding_ids {
                    let external = external.clone();
                    scope.spawn(move || {
                        for _ in 0..per_thread {
                            external.get(id).unwrap().data[0] ^= 1;
                        }
                    });
                }
            });
            start.elapsed()
        })
    });
    contention.bench_function("dense_independent_locks", |b| {
        b.iter_custom(|iterations| {
            let per_thread = iterations.div_ceil(colliding_ids.len() as u64);
            let start = Instant::now();
            thread::scope(|scope| {
                for &id in &colliding_ids {
                    let dense = dense.clone();
                    scope.spawn(move || {
                        for _ in 0..per_thread {
                            dense.get(id).unwrap().data[0] ^= 1;
                        }
                    });
                }
            });
            start.elapsed()
        })
    });
    contention.finish();

    let dash = dash_map(LOOKUP_TASKS, 1);
    let external = external_map(LOOKUP_TASKS, 1);
    let dense = dense_map(LOOKUP_TASKS, 1);
    let mut iteration = c.benchmark_group("resident_storage_iteration");
    iteration.throughput(Throughput::Elements(LOOKUP_TASKS as u64));
    iteration.bench_function("dash_map", |b| {
        b.iter(|| {
            let sum = dash
                .iter()
                .fold(0_u64, |sum, item| sum ^ item.value().value());
            black_box(sum)
        })
    });
    iteration.bench_function("external_mutex", |b| {
        b.iter(|| {
            let mut sum = 0_u64;
            for chunk in external.chunks() {
                for slot in &*chunk.slots {
                    if let Some(value) = slot.lock().as_ref() {
                        sum ^= value.value();
                    }
                }
            }
            black_box(sum)
        })
    });
    iteration.bench_function("dense", |b| {
        b.iter(|| {
            let mut sum = 0_u64;
            for chunk in dense.chunks() {
                chunk.for_each_mut(|value| sum ^= value.value());
            }
            black_box(sum)
        })
    });

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    iteration.bench_function("dash_map_parallel", |b| {
        b.iter(|| {
            runtime.block_on(async {
                let sums: Vec<u64> = turbo_tasks::parallel::map_collect(dash.shards(), |shard| {
                    shard
                        .read()
                        .iter()
                        .fold(0_u64, |sum, (_, value)| sum ^ value.value())
                });
                black_box(sums.into_iter().fold(0_u64, |sum, value| sum ^ value))
            })
        })
    });
    iteration.bench_function("dense_parallel", |b| {
        let chunks = dense.chunks();
        b.iter(|| {
            runtime.block_on(async {
                let sums: Vec<u64> = turbo_tasks::parallel::map_collect(&chunks, |chunk| {
                    let mut sum = 0;
                    chunk.for_each_mut(|value| sum ^= value.value());
                    sum
                });
                black_box(sums.into_iter().fold(0_u64, |sum, value| sum ^ value))
            })
        })
    });
    iteration.finish();

    let dash = dash_map(SPARSE_TASKS, 10);
    let dense = dense_map(SPARSE_TASKS, 10);
    // The first scan cleans the conservatively-set bitmap bits for never-occupied slots. This
    // models incremental scans after the first eviction/restoration pass established sparsity.
    for chunk in dense.chunks() {
        for offset in chunk.probably_occupied_offsets() {
            drop(chunk.get(offset));
        }
    }
    let mut sparse_iteration = c.benchmark_group("resident_storage_sparse_iteration");
    sparse_iteration.throughput(Throughput::Elements(SPARSE_TASKS as u64));
    sparse_iteration.bench_function("dash_map", |b| {
        b.iter(|| {
            let sum = dash
                .iter()
                .fold(0_u64, |sum, item| sum ^ item.value().value());
            black_box(sum)
        })
    });
    sparse_iteration.bench_function("dense_bitmap", |b| {
        b.iter(|| {
            let mut sum = 0_u64;
            for chunk in dense.chunks() {
                chunk.for_each_mut(|value| sum ^= value.value());
            }
            black_box(sum)
        })
    });
    sparse_iteration.finish();
}
