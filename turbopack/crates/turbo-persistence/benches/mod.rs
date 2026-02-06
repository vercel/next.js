use std::{cell::UnsafeCell, path::Path, sync::LazyLock, time::Duration};

use anyhow::Result;
use criterion::{
    BatchSize, Bencher, Criterion, SamplingMode, black_box, criterion_group, criterion_main,
    measurement::{Measurement, WallTime},
};
use parking_lot::Mutex;
use quick_cache::sync::GuardResult;
use rand::{Rng, SeedableRng, rngs::SmallRng, seq::SliceRandom};
use tempfile::TempDir;
use turbo_persistence::{
    ArcSlice, BlockCache, CompactConfig, Entry, EntryValue, MetaEntryFlags, SerialScheduler,
    StaticSortedFile, StaticSortedFileMetaData, TurboPersistence, hash_key,
    write_static_stored_file,
};
use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

// =============================================================================
// Constants
// =============================================================================

const MB: u64 = 1024 * 1024;
/// Data amount for batch read benchmarks (1 GiB)
const BATCH_READ_DATA_AMOUNT: usize = 1024 * MB as usize;
/// Maximum memory to use for storing keys during prefill (4 GiB)
const MAX_KEY_MEMORY: usize = 4 * 1024 * MB as usize;

// =============================================================================
// Helper Types and Functions
// =============================================================================

/// Format a number with ki, Mi, Gi suffixes for thousands, millions, billions
fn format_number(n: usize) -> String {
    if n >= 1_024 * 1_024 * 1_024 {
        format!("{:.2}Gi", n as f32 / (1_024 * 1_024 * 1_024) as f32)
    } else if n >= 1_024 * 1_024 {
        format!("{:.2}Mi", n as f32 / (1_024 * 1_024) as f32)
    } else if n >= 1_024 {
        format!("{:.2}Ki", n as f32 / 1_024_f32)
    } else {
        n.to_string()
    }
}

/// Configuration for prefilling a database
#[derive(Clone, Copy, Debug)]
struct DbConfig {
    key_size: usize,
    value_size: usize,
    entry_count: usize,
    commit_count: usize,
    compacted: bool,
}

/// Generate a random key of the specified size
fn random_key(rng: &mut SmallRng, size: usize) -> Box<[u8]> {
    let mut key = vec![0u8; size].into_boxed_slice();
    rng.fill(&mut key[..]);
    key
}

/// Generate a random value of the specified size
fn random_value(rng: &mut SmallRng, size: usize) -> Box<[u8]> {
    let mut value = vec![0u8; size].into_boxed_slice();
    rng.fill(&mut value[..]);
    value
}

/// Prefill a database with the given configuration and return the generated keys
fn prefill_database(path: &Path, config: &DbConfig) -> Result<Vec<Box<[u8]>>> {
    let db = TurboPersistence::<SerialScheduler, 1>::open(path.to_path_buf())?;
    let mut rng = SmallRng::seed_from_u64(42);
    let mut keys = Vec::with_capacity(
        config
            .entry_count
            .min(MAX_KEY_MEMORY / (config.key_size + size_of::<Box<[u8]>>())),
    );

    let entries_per_commit = config.entry_count / config.commit_count;

    for commit_idx in 0..config.commit_count {
        let batch = db.write_batch()?;
        let start = commit_idx * entries_per_commit;
        let end = if commit_idx == config.commit_count - 1 {
            config.entry_count
        } else {
            start + entries_per_commit
        };

        for _ in start..end {
            let key = random_key(&mut rng, config.key_size);
            let value = random_value(&mut rng, config.value_size);
            batch.put(0, key.clone(), value.into())?;
            if keys.len() < keys.capacity() {
                keys.push(key);
            } else {
                let replace = rng.random_range(0..keys.len());
                keys[replace] = key;
            }
        }
        db.commit_write_batch(batch)?;
    }

    if config.compacted {
        // Run compaction multiple times to ensure all levels are fully compacted
        for _ in 0..3 {
            db.full_compact()?;
        }
    }

    db.shutdown()?;
    keys.shuffle(&mut rng);
    Ok(keys)
}

/// Create a temporary directory with a prefilled database and return the generated keys
fn setup_prefilled_db(config: &DbConfig) -> Result<(TempDir, Vec<Box<[u8]>>)> {
    let tempdir = tempfile::tempdir()?;
    let keys = prefill_database(tempdir.path(), config)?;
    Ok((tempdir, keys))
}

fn prepare_db_for_benchmarking(db: &TurboPersistence<SerialScheduler, 1>) {
    db.clear_block_caches();
    db.prepare_all_sst_caches();
}

fn iter_batched_with_init<'a, T, O>(
    b: &mut Bencher<'a, WallTime>,
    mut init: impl FnMut(u64),
    mut setup: impl FnMut(u64) -> T,
    mut iter: impl FnMut(T) -> O,
    batch_size: BatchSize,
) {
    b.iter_custom(|iters| {
        let batch_size = match batch_size {
            BatchSize::SmallInput => iters.div_ceil(10),
            BatchSize::LargeInput => iters.div_ceil(1000),
            BatchSize::PerIteration => 1,
            BatchSize::NumBatches(size) => iters.div_ceil(size),
            BatchSize::NumIterations(size) => size,
            BatchSize::__NonExhaustive => panic!("__NonExhaustive is not a valid BatchSize."),
        };
        assert!(batch_size > 0);
        let measurement = WallTime;
        let mut value = measurement.zero();
        if batch_size == 1 {
            for _ in 0..iters {
                init(1);
                let input = black_box(setup(0));

                let start = measurement.start();
                let output = iter(input);
                let end = measurement.end(start);

                value = measurement.add(&value, &end);

                drop(black_box(output));
            }
        } else {
            let mut iteration_counter = 0;

            while iteration_counter < iters {
                let batch_size = ::std::cmp::min(batch_size, iters - iteration_counter);
                init(batch_size);
                let inputs = black_box((0..batch_size).map(&mut setup).collect::<Vec<_>>());
                let mut outputs = Vec::with_capacity(batch_size as usize);

                let start = measurement.start();
                outputs.extend(inputs.into_iter().map(&mut iter));
                let end = measurement.end(start);

                value = measurement.add(&value, &end);

                drop(black_box(outputs));
                iteration_counter += batch_size;
            }
        }
        value
    });
}

// =============================================================================
// Write Benchmarks
// =============================================================================

fn bench_write(c: &mut Criterion) {
    let mut group = c.benchmark_group("write");
    // Reduce sample size for slow benchmarks
    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    // Key-value sizes to test
    let entry_sizes = [(8, 4), (4, 32 * 1024), (32 * 1024, 4)];
    // Entry counts to test
    let database_sizes = [1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024];

    for &(key_size, value_size) in &entry_sizes {
        for &database_size in &database_sizes {
            let entry_count = database_size / (key_size + value_size);

            let id = format!(
                "key_{}/value_{}/entries_{}",
                format_number(key_size),
                format_number(value_size),
                format_number(entry_count)
            );
            group.bench_function(&id, |b| {
                b.iter_batched(
                    || {
                        // Setup: create temp directory and RNG
                        let tempdir = tempfile::tempdir().unwrap();
                        let mut rng = SmallRng::seed_from_u64(42);
                        let mut random_data = vec![0u8; entry_count * (key_size + value_size)];
                        rng.fill(&mut random_data[..]);

                        (tempdir, random_data)
                    },
                    |(tempdir, random_data)| {
                        // Timed: write entries and commit
                        let db = TurboPersistence::<SerialScheduler, 1>::open(
                            tempdir.path().to_path_buf(),
                        )
                        .unwrap();
                        {
                            let batch = db.write_batch().unwrap();
                            let entry_size = key_size + value_size;

                            for i in 0..entry_count {
                                let key = &random_data[i * entry_size..i * entry_size + key_size];
                                let value =
                                    &random_data[i * entry_size + key_size..(i + 1) * entry_size];
                                batch.put(0, key, value.into()).unwrap();
                            }

                            db.commit_write_batch(batch).unwrap();
                        }
                        db.shutdown().unwrap();
                        tempdir
                    },
                    BatchSize::PerIteration,
                );
            });
        }
    }

    group.finish();
}

// =============================================================================
// Read Benchmarks - Single Get
// =============================================================================

fn bench_read_get(c: &mut Criterion) {
    let mut group = c.benchmark_group("read/get");
    group.measurement_time(Duration::from_secs(10));

    // Test empty database first
    {
        let tempdir = tempfile::tempdir().unwrap();
        let db =
            TurboPersistence::<SerialScheduler, 1>::open(tempdir.path().to_path_buf()).unwrap();

        group.bench_function("empty", |b| {
            b.iter(|| {
                let result = db.get(0, &[0u8; 4]).unwrap();
                black_box(result)
            });
        });
    }

    // Configuration parameters: (key_size, value_size)
    let entry_sizes = [(8, 4), (4, 32 * 1024), (32 * 1024, 4)];
    // Configuration parameters: (entry_count, commit_count, compacted)
    let size_commits_compacted = [
        (128 * 1024 * 1024, 1, true),
        (128 * 1024 * 1024, 1, false),
        (128 * 1024 * 1024, 20, false),
        (1024 * 1024 * 1024, 1, true),
        (1024 * 1024 * 1024, 1, false),
        (1024 * 1024 * 1024, 20, false),
    ];

    for &(key_size, value_size) in &entry_sizes {
        for &(database_size, commit_count, compacted) in &size_commits_compacted {
            let entry_count = database_size / (key_size + value_size);
            let config = DbConfig {
                key_size,
                value_size,
                entry_count,
                commit_count,
                compacted,
            };

            let compacted_str = if compacted {
                "compacted"
            } else {
                "uncompacted"
            };
            let id = format!(
                "key_{}/value_{}/entries_{}/commits_{}/{}",
                format_number(key_size),
                format_number(value_size),
                format_number(entry_count),
                commit_count,
                compacted_str,
            );

            let db = LazyLock::new(|| {
                let (tempdir, keys) = setup_prefilled_db(&config).unwrap();
                let db = TurboPersistence::<SerialScheduler, 1>::open(tempdir.path().to_path_buf())
                    .unwrap();
                let rng = Mutex::new(SmallRng::seed_from_u64(123));
                (tempdir, db, keys, rng)
            });

            group.bench_function(format!("{id}/hit/uncached"), |b| {
                let (_, db, keys, rng) = &*db;
                let mut rng = rng.lock();
                iter_batched_with_init(
                    b,
                    |_| prepare_db_for_benchmarking(db),
                    |_| {
                        let idx = rng.random_range(0..keys.len());
                        &keys[idx]
                    },
                    |key| {
                        let result = db.get(0, key).unwrap();
                        black_box(result)
                    },
                    BatchSize::PerIteration,
                );
            });

            group.bench_function(format!("{id}/hit/cached"), |b| {
                let (_, db, keys, _) = &*db;
                iter_batched_with_init(
                    b,
                    |_| prepare_db_for_benchmarking(db),
                    |i| &keys[i as usize % keys.len()],
                    |key| {
                        let result = db.get(0, key).unwrap();
                        black_box(result)
                    },
                    BatchSize::NumBatches(1),
                );
            });

            group.bench_function(format!("{id}/miss/uncached"), |b| {
                let (_, db, _, rng) = &*db;
                let mut rng = rng.lock();
                iter_batched_with_init(
                    b,
                    |_| prepare_db_for_benchmarking(db),
                    |_| random_key(&mut rng, key_size),
                    |key| {
                        let result = db.get(0, &key).unwrap();
                        black_box(result)
                    },
                    BatchSize::PerIteration,
                );
            });

            group.bench_function(format!("{id}/miss/cached"), |b| {
                let (_, db, _, rng) = &*db;
                let mut rng = rng.lock();
                let miss_keys = UnsafeCell::new(Vec::new());
                iter_batched_with_init(
                    b,
                    |batch_size| {
                        prepare_db_for_benchmarking(db);
                        // SAFETY: We are the only ones mutating miss_keys during this
                        // initialization phase
                        let miss_keys = unsafe { &mut *miss_keys.get() };
                        while miss_keys.len() < batch_size as usize {
                            miss_keys.push(random_key(&mut rng, key_size));
                        }
                    },
                    |i| {
                        let miss_keys = unsafe { &*miss_keys.get() };
                        &miss_keys[i as usize]
                    },
                    |key| {
                        let result = db.get(0, key).unwrap();
                        black_box(result)
                    },
                    BatchSize::NumBatches(1),
                );
            });
        }
    }

    group.finish();
}

// =============================================================================
// Read Benchmarks - Batch Get
// =============================================================================

fn bench_read_batch_get(c: &mut Criterion) {
    let mut group = c.benchmark_group("read/batch_get");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(20);
    group.sampling_mode(SamplingMode::Flat);

    // Configuration parameters: (key_size, value_size)
    let entry_sizes = [(8, 4), (4, 512), (512, 4)];
    // Configuration parameters: (commit_count, compacted)
    let commit_configs = [(1, true), (1, false), (20, false)];
    let batch_sizes = [100, 1024, 10 * 1024, 100 * 1024];

    for &(key_size, value_size) in &entry_sizes {
        for &(commit_count, compacted) in &commit_configs {
            let entry_count = BATCH_READ_DATA_AMOUNT / (key_size + value_size);

            let config = DbConfig {
                key_size,
                value_size,
                entry_count,
                commit_count,
                compacted,
            };

            let compacted_str = if compacted {
                "compacted"
            } else {
                "uncompacted"
            };

            let db = LazyLock::new(|| {
                let (tempdir, stored_keys) = setup_prefilled_db(&config).unwrap();
                let db = TurboPersistence::<SerialScheduler, 1>::open(tempdir.path().to_path_buf())
                    .unwrap();
                let rng = Mutex::new(SmallRng::seed_from_u64(456));
                (tempdir, db, stored_keys, rng)
            });

            for &batch_size in &batch_sizes {
                let id = format!(
                    "key_{}/value_{}/entries_{}/commits_{}/batch_{}/{}",
                    format_number(key_size),
                    format_number(value_size),
                    format_number(entry_count),
                    commit_count,
                    format_number(batch_size),
                    compacted_str,
                );

                group.bench_function(format!("{id}/hit/uncached"), |b| {
                    let (_, db, stored_keys, rng) = &*db;
                    let mut rng = rng.lock();
                    iter_batched_with_init(
                        b,
                        |_| prepare_db_for_benchmarking(db),
                        |_| {
                            (0..batch_size)
                                .map(|_| {
                                    let idx = rng.random_range(0..stored_keys.len());
                                    &*stored_keys[idx]
                                })
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::PerIteration,
                    );
                });

                group.bench_function(format!("{id}/hit/cached"), |b| {
                    let (_, db, stored_keys, _) = &*db;
                    iter_batched_with_init(
                        b,
                        |_| prepare_db_for_benchmarking(db),
                        |i| {
                            (0..batch_size)
                                .map(|j| {
                                    &*stored_keys[(i as usize * batch_size + j) % stored_keys.len()]
                                })
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::NumBatches(1),
                    );
                });

                group.bench_function(format!("{id}/miss/uncached"), |b| {
                    let (_, db, _, rng) = &*db;
                    let mut rng = rng.lock();
                    iter_batched_with_init(
                        b,
                        |_| prepare_db_for_benchmarking(db),
                        |_| {
                            (0..batch_size)
                                .map(|_| random_key(&mut rng, key_size))
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::PerIteration,
                    );
                });

                group.bench_function(format!("{id}/miss/cached"), |b| {
                    let (_, db, _, rng) = &*db;
                    let mut rng = rng.lock();
                    let miss_keys = UnsafeCell::new(Vec::new());
                    iter_batched_with_init(
                        b,
                        |iter_batch_size| {
                            prepare_db_for_benchmarking(db);
                            // SAFETY: We are the only ones mutating miss_keys during this
                            // initialization phase
                            let miss_keys = unsafe { &mut *miss_keys.get() };
                            let needed_keys = iter_batch_size as usize * batch_size;
                            while miss_keys.len() < needed_keys {
                                miss_keys.push(random_key(&mut rng, key_size));
                            }
                        },
                        |i| {
                            let miss_keys = unsafe { &*miss_keys.get() };
                            (0..batch_size)
                                .map(|j| &*miss_keys[i as usize * batch_size + j])
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::NumBatches(1),
                    );
                });
            }
        }
    }

    group.finish();
}

// =============================================================================
// Compaction Benchmarks
// =============================================================================

fn bench_compaction(c: &mut Criterion) {
    let mut group = c.benchmark_group("compaction");
    // Compaction is expensive, reduce sample size
    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    // Configuration parameters: (key_size, value_size)
    let entry_sizes = [(8, 4)];
    // Configuration parameters: (entry_count, commit_count)
    let db_configs = [
        (1024 * 1024 * 4, 8),
        (1024 * 1024 * 16, 8),
        (1024 * 1024 * 4, 32),
        (1024 * 1024 * 16, 32),
        (1024 * 1024 * 4, 128),
        (1024 * 1024 * 16, 128),
    ];

    for &(key_size, value_size) in &entry_sizes {
        for &(entry_count, commit_count) in &db_configs {
            let id = format!(
                "key_{}/value_{}/entries_{}/commits_{}",
                format_number(key_size),
                format_number(value_size),
                format_number(entry_count),
                commit_count
            );

            let setup = || {
                // Setup: create and prefill database (not compacted)
                let config = DbConfig {
                    key_size,
                    value_size,
                    entry_count,
                    commit_count,
                    compacted: false,
                };
                let (tempdir, _keys) = setup_prefilled_db(&config).unwrap();
                let db = TurboPersistence::<SerialScheduler, 1>::open(tempdir.path().to_path_buf())
                    .unwrap();
                (tempdir, db)
            };

            group.bench_function(&id, |b| {
                b.iter_batched(
                    setup,
                    |(_tempdir, db)| {
                        // Timed: run normal compaction
                        db.compact(&CompactConfig {
                            min_merge_count: 3,
                            optimal_merge_count: 8,
                            max_merge_count: 64,
                            max_merge_bytes: 512 * MB,
                            min_merge_duplication_bytes: 50 * MB,
                            optimal_merge_duplication_bytes: 100 * MB,
                            max_merge_segment_count: 16,
                        })
                        .unwrap();
                        black_box(db)
                    },
                    BatchSize::PerIteration,
                );
            });
            group.bench_function(format!("{id}/full"), |b| {
                b.iter_batched(
                    setup,
                    |(_tempdir, db)| {
                        // Timed: run full compaction
                        db.full_compact().unwrap();
                        black_box(db)
                    },
                    BatchSize::PerIteration,
                );
            });
        }
    }

    group.finish();
}

// =============================================================================
// QFilter Benchmarks
// =============================================================================

fn bench_qfilter(c: &mut Criterion) {
    let mut group = c.benchmark_group("qfilter");
    group.warm_up_time(Duration::from_secs(5));
    group.measurement_time(Duration::from_secs(10));

    // Filter sizes to test: 1ki, 10ki, 100ki, 1000ki fingerprints
    let filter_sizes = [1024, 10 * 1024, 100 * 1024, 1000 * 1024];
    // False positive rate matching AMQF_FALSE_POSITIVE_RATE in static_sorted_file_builder.rs
    const FALSE_POSITIVE_RATE: f64 = 0.01;

    for &size in &filter_sizes {
        // Pre-build filter with random fingerprints
        let filter = LazyLock::new(|| {
            let mut rng = SmallRng::seed_from_u64(42);
            let mut filter = qfilter::Filter::new(size as u64, FALSE_POSITIVE_RATE)
                .expect("Filter construction failed");

            // Store fingerprints for hit testing
            let mut fingerprints = Vec::with_capacity(size);
            for _ in 0..size {
                let fp: u64 = rng.random();
                filter.insert_fingerprint(false, fp).expect("Insert failed");
                fingerprints.push(fp);
            }

            let rng = Mutex::new(SmallRng::seed_from_u64(123));
            (filter, fingerprints, rng)
        });

        let id = format!("entries_{}", format_number(size));

        // Benchmark hit case (query fingerprints that exist)
        group.bench_function(format!("{id}/hit"), |b| {
            let (filter, fingerprints, rng) = &*filter;
            let mut rng = rng.lock();
            b.iter_batched(
                || {
                    let idx = rng.random_range(0..fingerprints.len());
                    fingerprints[idx]
                },
                |fp| {
                    let result = filter.contains_fingerprint(fp);
                    black_box(result)
                },
                BatchSize::SmallInput,
            );
        });

        // Benchmark miss case (query random fingerprints not in filter)
        group.bench_function(format!("{id}/miss"), |b| {
            let (filter, _, rng) = &*filter;
            let mut rng = rng.lock();
            b.iter_batched(
                || {
                    // Generate random fingerprint (very unlikely to be in filter)
                    rng.random::<u64>()
                },
                |fp| {
                    let result = filter.contains_fingerprint(fp);
                    black_box(result)
                },
                BatchSize::SmallInput,
            );
        });

        // Benchmark insert performance (build filter from scratch)
        group.bench_function(format!("{id}/insert"), |b| {
            let (_, fingerprints, _) = &*filter;
            b.iter_batched(
                || {
                    // Setup: create empty filter
                    qfilter::Filter::new(size as u64, FALSE_POSITIVE_RATE)
                        .expect("Filter construction failed")
                },
                |mut filter| {
                    // Timed: insert all fingerprints
                    for &fp in fingerprints {
                        filter.insert_fingerprint(false, fp).expect("Insert failed");
                    }
                    black_box(filter)
                },
                BatchSize::LargeInput,
            );
        });
    }

    group.finish();
}

// =============================================================================
// StaticSortedFile Lookup Benchmarks
// =============================================================================

/// Entry implementation for benchmarking StaticSortedFile
struct BenchEntry {
    key: [u8; 8],
    value: [u8; 4],
    hash: u64,
}

impl Entry for BenchEntry {
    fn key_hash(&self) -> u64 {
        self.hash
    }

    fn key_len(&self) -> usize {
        8
    }

    fn write_key_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(&self.key);
    }

    fn value(&self) -> EntryValue<'_> {
        EntryValue::Small { value: &self.value }
    }
}

fn bench_static_sorted_file_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("static_sorted_file_lookup");
    group.warm_up_time(Duration::from_secs(5));
    group.measurement_time(Duration::from_secs(10));

    // Entry counts to test: 1ki, 10ki, 100ki, 1000ki
    let entry_counts = [1024, 10 * 1024, 100 * 1024, 1000 * 1024];

    for &entry_count in &entry_counts {
        // Pre-build the SST file and related data structures
        let data = LazyLock::new(|| {
            let mut rng = SmallRng::seed_from_u64(42);

            // Generate random entries
            let mut entries: Vec<BenchEntry> = (0..entry_count)
                .map(|_| {
                    let mut key = [0u8; 8];
                    let mut value = [0u8; 4];
                    rng.fill(&mut key[..]);
                    rng.fill(&mut value[..]);
                    let hash = hash_key(&key);
                    BenchEntry { key, value, hash }
                })
                .collect();

            // Sort by hash (required by write_static_stored_file)
            entries.sort_by_key(|e| e.hash);

            // Create temp directory and write SST file
            let tempdir = tempfile::tempdir().unwrap();
            let sst_path = tempdir.path().join("00000001.sst");
            let total_key_size = entry_count * 8;

            let (meta, _file) = write_static_stored_file(
                &entries,
                total_key_size,
                &sst_path,
                MetaEntryFlags::FRESH,
            )
            .unwrap();

            // Open the SST file
            let sst_meta = StaticSortedFileMetaData {
                sequence_number: 1,
                key_compression_dictionary_length: meta.key_compression_dictionary_length,
                block_count: meta.block_count,
            };
            let sst = StaticSortedFile::open(tempdir.path(), sst_meta).unwrap();

            // Create block caches
            let key_block_cache: BlockCache = BlockCache::with(
                1000,
                64 * 1024 * 1024,
                Default::default(),
                Default::default(),
                Default::default(),
            );
            let value_block_cache: BlockCache = BlockCache::with(
                1000,
                64 * 1024 * 1024,
                Default::default(),
                Default::default(),
                Default::default(),
            );

            // Store keys and hashes for lookup testing
            let keys: Vec<([u8; 8], u64)> = entries.iter().map(|e| (e.key, e.hash)).collect();

            let rng = Mutex::new(SmallRng::seed_from_u64(123));
            (tempdir, sst, key_block_cache, value_block_cache, keys, rng)
        });

        let id = format!("entries_{}", format_number(entry_count));

        // Benchmark hit case (lookup keys that exist)
        group.bench_function(format!("{id}/hit/uncached"), |b| {
            let (_, sst, key_block_cache, value_block_cache, keys, rng) = &*data;
            let mut rng = rng.lock();
            iter_batched_with_init(
                b,
                |_| {
                    key_block_cache.clear();
                    value_block_cache.clear();
                },
                |_| {
                    let idx = rng.random_range(0..keys.len());
                    keys[idx]
                },
                |(key, hash)| {
                    let result = sst
                        .lookup(hash, &key, key_block_cache, value_block_cache)
                        .unwrap();
                    black_box(result)
                },
                BatchSize::PerIteration,
            );
        });

        group.bench_function(format!("{id}/hit/cached"), |b| {
            let (_, sst, key_block_cache, value_block_cache, keys, _) = &*data;
            iter_batched_with_init(
                b,
                |_| {
                    key_block_cache.clear();
                    value_block_cache.clear();
                },
                |i| keys[i as usize % keys.len()],
                |(key, hash)| {
                    let result = sst
                        .lookup(hash, &key, key_block_cache, value_block_cache)
                        .unwrap();
                    black_box(result)
                },
                BatchSize::NumBatches(1),
            );
        });

        // Benchmark miss case (lookup random keys not in file)
        group.bench_function(format!("{id}/miss/uncached"), |b| {
            let (_, sst, key_block_cache, value_block_cache, _, rng) = &*data;
            let mut rng = rng.lock();
            iter_batched_with_init(
                b,
                |_| {
                    key_block_cache.clear();
                    value_block_cache.clear();
                },
                |_| {
                    // Generate random key (very unlikely to be in file)
                    let key = random_key(&mut rng, 8);
                    let hash = hash_key(&key);
                    (key, hash)
                },
                |(key, hash)| {
                    let result = sst
                        .lookup(hash, &key, key_block_cache, value_block_cache)
                        .unwrap();
                    black_box(result)
                },
                BatchSize::PerIteration,
            );
        });

        group.bench_function(format!("{id}/miss/cached"), |b| {
            let (_, sst, key_block_cache, value_block_cache, _, rng) = &*data;
            let mut rng = rng.lock();
            let miss_keys = UnsafeCell::new(Vec::new());
            iter_batched_with_init(
                b,
                |batch_size| {
                    key_block_cache.clear();
                    value_block_cache.clear();

                    // SAFETY: We are the only ones mutating miss_keys during this initialization
                    // phase
                    let miss_keys = unsafe { &mut *miss_keys.get() };
                    while miss_keys.len() < batch_size as usize {
                        let key = random_key(&mut rng, 8);
                        let hash = hash_key(&key);
                        miss_keys.push((key, hash));
                    }
                },
                |i| {
                    let miss_keys = unsafe { &*miss_keys.get() };
                    &miss_keys[i as usize]
                },
                |(key, hash)| {
                    let result = sst
                        .lookup(*hash, &key, key_block_cache, value_block_cache)
                        .unwrap();
                    black_box(result)
                },
                BatchSize::NumBatches(1),
            );
        });
    }

    group.finish();
}

// =============================================================================
// BlockCache Benchmarks
// =============================================================================

fn bench_block_cache(c: &mut Criterion) {
    let mut group = c.benchmark_group("block_cache");
    group.warm_up_time(Duration::from_secs(5));
    group.measurement_time(Duration::from_secs(10));

    // Cache sizes to test: 10, 100, 1000 entries
    let cache_sizes = [10, 100, 1000];
    // Block size (typical decompressed block)
    const BLOCK_SIZE: usize = 4096;

    for &size in &cache_sizes {
        let data = LazyLock::new(|| {
            let mut rng = SmallRng::seed_from_u64(42);

            let mut block_data = vec![0u8; BLOCK_SIZE];
            rng.fill(&mut block_data[..]);
            let block = ArcSlice::from(block_data.into_boxed_slice());

            // Create cache with enough capacity for all entries
            let cache: BlockCache = BlockCache::with(
                size * 16,
                (size * 16 * (BLOCK_SIZE + 8)) as u64,
                Default::default(),
                Default::default(),
                Default::default(),
            );

            // Pre-populate cache with random blocks
            let mut keys = Vec::with_capacity(size);
            for i in 0..size {
                let key = (1u32, i as u16);

                match cache.get_value_or_guard(&key, None) {
                    GuardResult::Guard(guard) => {
                        let _ = guard.insert(block.clone());
                    }
                    _ => unreachable!(),
                }
                keys.push(key);
            }

            let iteration = Mutex::new(1);
            let rng = Mutex::new(SmallRng::seed_from_u64(123));
            (cache, keys, block, iteration, rng)
        });

        let id = format!("entries_{}", format_number(size));

        // Benchmark cache hit
        group.bench_function(format!("{id}/hit"), |b| {
            let (cache, keys, _, _, rng) = &*data;
            let mut rng = rng.lock();
            b.iter_batched(
                || {
                    let idx = rng.random_range(0..keys.len());
                    keys[idx]
                },
                |key| match cache.get_value_or_guard(&key, None) {
                    GuardResult::Guard(guard) => {
                        drop(guard);
                        None
                    }
                    GuardResult::Value(v) => Some(black_box(v)),
                    GuardResult::Timeout => {
                        unreachable!()
                    }
                },
                BatchSize::SmallInput,
            );
        });

        // Benchmark cache miss (without insert)
        group.bench_function(format!("{id}/miss"), |b| {
            let (cache, _, _, iteration, rng) = &*data;
            let mut rng = rng.lock();
            let mut iteration = iteration.lock();
            b.iter_batched(
                || {
                    // Generate a key that won't be in the cache (different sequence number)
                    *iteration += 1;
                    (*iteration, rng.random::<u16>())
                },
                |key| match cache.get_value_or_guard(&key, None) {
                    GuardResult::Guard(guard) => {
                        drop(guard);
                        None
                    }
                    GuardResult::Value(v) => Some(black_box(v)),
                    GuardResult::Timeout => {
                        unreachable!()
                    }
                },
                BatchSize::SmallInput,
            );
        });

        // Benchmark cache miss + insert (uses existing cache, keys will miss)
        group.bench_function(format!("{id}/miss_insert"), |b| {
            let (cache, _, block, iteration, rng) = &*data;
            let mut rng = rng.lock();
            let mut iteration = iteration.lock();
            *iteration += 1;
            iter_batched_with_init(
                b,
                |_| {
                    cache.retain(|(key_prefix, _), _| *key_prefix == 1u32);
                },
                |_| {
                    // Generate a key that won't be in the cache (different sequence number)
                    let key = (*iteration, rng.random::<u16>());
                    (key, block.clone())
                },
                |(key, block)| match cache.get_value_or_guard(&key, None) {
                    GuardResult::Guard(guard) => {
                        let _ = guard.insert(block);
                    }
                    GuardResult::Value(v) => {
                        black_box(v);
                    }
                    GuardResult::Timeout => unreachable!(),
                },
                BatchSize::PerIteration,
            );
        });
    }

    group.finish();
}

// =============================================================================
// Criterion Setup
// =============================================================================

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_write, bench_read_get, bench_read_batch_get, bench_compaction, bench_qfilter, bench_static_sorted_file_lookup, bench_block_cache
);
criterion_main!(benches);
