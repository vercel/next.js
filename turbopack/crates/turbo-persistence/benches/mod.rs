use std::{path::Path, sync::LazyLock, time::Duration};

use anyhow::Result;
use criterion::{BatchSize, Criterion, SamplingMode, black_box, criterion_group, criterion_main};
use parking_lot::Mutex;
use rand::{Rng, SeedableRng, rngs::SmallRng};
use tempfile::TempDir;
use turbo_persistence::{SerialScheduler, TurboPersistence};

// =============================================================================
// Constants
// =============================================================================

/// Data amount for batch read benchmarks (1 GiB)
const BATCH_READ_DATA_AMOUNT: usize = 1024 * 1024 * 1024;
/// Maximum memory to use for storing keys during prefill (8 GiB)
const MAX_KEY_MEMORY: usize = 8 * 1024 * 1024 * 1024;

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
fn random_key(rng: &mut SmallRng, size: usize) -> Vec<u8> {
    let mut key = vec![0u8; size];
    rng.fill(&mut key[..]);
    key
}

/// Generate a random value of the specified size
fn random_value(rng: &mut SmallRng, size: usize) -> Vec<u8> {
    let mut value = vec![0u8; size];
    rng.fill(&mut value[..]);
    value
}

/// Prefill a database with the given configuration and return the generated keys
fn prefill_database(path: &Path, config: &DbConfig) -> Result<Vec<Vec<u8>>> {
    let db = TurboPersistence::<SerialScheduler, 1>::open(path.to_path_buf())?;
    let mut rng = SmallRng::seed_from_u64(42);
    let mut keys = Vec::with_capacity(config.entry_count);
    let mut key_memory = 0;

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
            key_memory += key.len();
            if key_memory < MAX_KEY_MEMORY {
                keys.push(key);
            } else {
                let replace = rng.random_range(0..keys.len());
                key_memory -= keys[replace].len();
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
    Ok(keys)
}

/// Create a temporary directory with a prefilled database and return the generated keys
fn setup_prefilled_db(config: &DbConfig) -> Result<(TempDir, Vec<Vec<u8>>)> {
    let tempdir = tempfile::tempdir()?;
    let keys = prefill_database(tempdir.path(), config)?;
    Ok((tempdir, keys))
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
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(2));

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
        (100 * 1024 * 1024, 1, true),
        (100 * 1024 * 1024, 1, false),
        (4 * 1024 * 1024 * 1024, 1, true),
        (4 * 1024 * 1024 * 1024, 1, false),
        (4 * 1024 * 1024 * 1024, 10, false),
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

            group.bench_function(&id, |b| {
                let (_, db, keys, rng) = &*db;
                let mut rng = rng.lock();
                b.iter_batched(
                    || rng.random_range(0..keys.len()),
                    |idx| {
                        let result = db.get(0, &keys[idx]).unwrap();
                        black_box(result)
                    },
                    BatchSize::SmallInput,
                );
            });

            group.bench_function(format!("{id}/miss"), |b| {
                let (_, db, _, rng) = &*db;
                let mut rng = rng.lock();
                b.iter_batched(
                    || random_key(&mut rng, key_size),
                    |key| {
                        let result = db.get(0, &key).unwrap();
                        black_box(result)
                    },
                    if key_size > 1024 {
                        BatchSize::LargeInput
                    } else {
                        BatchSize::SmallInput
                    },
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
    group.warm_up_time(Duration::from_secs(1));
    group.measurement_time(Duration::from_secs(2));
    group.sample_size(10);
    group.sampling_mode(SamplingMode::Flat);

    // Configuration parameters: (key_size, value_size)
    let entry_sizes = [(8, 4), (4, 512), (512, 4)];
    // Configuration parameters: (commit_count, compacted)
    let commit_configs = [(1, true), (1, false), (10, false)];
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

                group.bench_function(&id, |b| {
                    let (_, db, stored_keys, rng) = &*db;
                    let mut rng = rng.lock();
                    b.iter_batched(
                        || {
                            (0..batch_size)
                                .map(|_| {
                                    let idx = rng.random_range(0..stored_keys.len());
                                    stored_keys[idx].as_slice()
                                })
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::LargeInput,
                    );
                });

                group.bench_function(format!("{id}/miss"), |b| {
                    let (_, db, _, rng) = &*db;
                    let mut rng = rng.lock();
                    b.iter_batched(
                        || {
                            (0..batch_size)
                                .map(|_| random_key(&mut rng, key_size))
                                .collect::<Vec<_>>()
                        },
                        |keys| {
                            let result = db.batch_get(0, &keys).unwrap();
                            black_box(result)
                        },
                        BatchSize::LargeInput,
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
        (1024 * 1024 * 8, 8),
        (1024 * 1024 * 16, 8),
        (1024 * 1024 * 4, 32),
        (1024 * 1024 * 8, 32),
        (1024 * 1024 * 16, 32),
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

            group.bench_function(&id, |b| {
                b.iter_batched(
                    || {
                        // Setup: create and prefill database (not compacted)
                        let config = DbConfig {
                            key_size,
                            value_size,
                            entry_count,
                            commit_count,
                            compacted: false,
                        };
                        let (tempdir, _keys) = setup_prefilled_db(&config).unwrap();
                        let db = TurboPersistence::<SerialScheduler, 1>::open(
                            tempdir.path().to_path_buf(),
                        )
                        .unwrap();
                        (tempdir, db)
                    },
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
// Criterion Setup
// =============================================================================

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_write, bench_read_get, bench_read_batch_get, bench_compaction
);
criterion_main!(benches);
