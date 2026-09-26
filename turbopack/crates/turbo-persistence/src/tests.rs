#[cfg(not(miri))]
use std::time::Instant;
use std::{fs, path::Path};

use anyhow::Result;
#[cfg(not(miri))]
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use rstest::rstest;

// Miri rejects a process that exits while rayon's global worker threads are still parked, so
// run the same tests on the serial scheduler there. The alias keeps the test bodies identical.
#[cfg(miri)]
use crate::parallel_scheduler::SerialScheduler as RayonParallelScheduler;
use crate::{
    AccessMode, Compression, DbConfig,
    db::{CompactConfig, TurboPersistence, read_current_version},
};
#[cfg(not(miri))]
use crate::{
    constants::{MAX_MEDIUM_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    meta_file::MetaFile,
    parallel_scheduler::ParallelScheduler,
    write_batch::WriteBatch,
};

#[cfg(not(miri))]
#[derive(Clone, Copy)]
struct RayonParallelScheduler;

#[cfg(not(miri))]
impl ParallelScheduler for RayonParallelScheduler {
    fn block_in_place<R>(&self, f: impl FnOnce() -> R + Send) -> R
    where
        R: Send,
    {
        f()
    }

    fn parallel_for_each<T>(&self, items: &[T], f: impl Fn(&T) + Send + Sync)
    where
        T: Sync,
    {
        items.into_par_iter().for_each(f);
    }

    fn try_parallel_for_each<'l, T, E>(
        &self,
        items: &'l [T],
        f: impl (Fn(&'l T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Sync,
        E: Send,
    {
        items.into_par_iter().try_for_each(f)
    }

    fn try_parallel_for_each_mut<'l, T, E>(
        &self,
        items: &'l mut [T],
        f: impl (Fn(&'l mut T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send,
    {
        items.into_par_iter().try_for_each(f)
    }

    fn try_parallel_for_each_owned<T, E>(
        &self,
        items: Vec<T>,
        f: impl (Fn(T) -> Result<(), E>) + Send + Sync,
    ) -> Result<(), E>
    where
        T: Send + Sync,
        E: Send,
    {
        items.into_par_iter().try_for_each(f)
    }

    fn parallel_map_collect<'l, Item, PerItemResult, Result>(
        &self,
        items: &'l [Item],
        f: impl Fn(&'l Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Sync,
        PerItemResult: Send + Sync,
        Result: FromIterator<PerItemResult>,
    {
        items
            .into_par_iter()
            .map(f)
            .collect_vec_list()
            .into_iter()
            .flatten()
            .collect()
    }

    fn parallel_map_collect_owned<Item, PerItemResult, Result>(
        &self,
        items: Vec<Item>,
        f: impl Fn(Item) -> PerItemResult + Send + Sync,
    ) -> Result
    where
        Item: Send + Sync,
        PerItemResult: Send + Sync,
        Result: FromIterator<PerItemResult>,
    {
        items
            .into_par_iter()
            .map(f)
            .collect_vec_list()
            .into_iter()
            .flatten()
            .collect()
    }
}

#[cfg(not(miri))]
fn tuple_key(prefix: u8, suffix: [u8; 4]) -> Box<[u8]> {
    let mut key = Vec::with_capacity(1 + suffix.len());
    key.push(prefix);
    key.extend_from_slice(&suffix);
    key.into_boxed_slice()
}

fn config_with_mmap<const F: usize>(mmap: bool) -> DbConfig<F> {
    DbConfig {
        access_mode: if mmap {
            crate::mmap_access_mode()
        } else {
            AccessMode::File
        },
        ..DbConfig::new()
    }
}

fn open_db<const F: usize>(
    path: &std::path::Path,
    mmap: bool,
) -> Result<TurboPersistence<RayonParallelScheduler, F>> {
    open_db_with_config(path, config_with_mmap(mmap))
}

fn open_db_with_config<const F: usize>(
    path: &std::path::Path,
    config: DbConfig<F>,
) -> Result<TurboPersistence<RayonParallelScheduler, F>> {
    TurboPersistence::open_with_config_and_parallel_scheduler(
        path.to_path_buf(),
        config,
        RayonParallelScheduler,
    )
}

// This stress test writes more than ten million entries and uses Rayon directly, so it is too slow
// to run under Miri and depends on concurrency that Miri cannot provide efficiently.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn full_cycle(#[case] mmap: bool) -> Result<()> {
    let mut test_cases = Vec::new();
    type TestCases = Vec<(
        &'static str,
        Box<dyn Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()>>,
        Box<dyn Fn(&TurboPersistence<RayonParallelScheduler, 16>) -> Result<()>>,
    )>;

    fn test_case(
        test_cases: &mut TestCases,
        name: &'static str,
        write: impl Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()> + 'static,
        read: impl Fn(&TurboPersistence<RayonParallelScheduler, 16>) -> Result<()> + 'static,
    ) {
        test_cases.push((
            name,
            Box::new(write)
                as Box<dyn Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()>>,
            Box::new(read)
                as Box<dyn Fn(&TurboPersistence<RayonParallelScheduler, 16>) -> Result<()>>,
        ));
    }

    test_case(
        &mut test_cases,
        "Simple",
        |batch| {
            for i in 10..100u8 {
                batch.put(0, vec![1, i], vec![i].into())?;
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(0, &[1, 42u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[42]);
            assert_eq!(db.get(0, &[1, 42u8, 42])?, None);
            assert_eq!(db.get(0, &[1, 1u8])?, None);
            assert_eq!(db.get(0, &[1, 255u8])?, None);
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many SST files",
        |batch| {
            for i in 10..100u8 {
                batch.put(0, vec![2, i], vec![i].into())?;
                unsafe { batch.flush(0)? };
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(0, &[2, 42u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[42]);
            assert_eq!(db.get(0, &[2, 42u8, 42])?, None);
            assert_eq!(db.get(0, &[2, 1u8])?, None);
            assert_eq!(db.get(0, &[2, 255u8])?, None);
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Families",
        |batch| {
            for i in 0..16u8 {
                batch.put(u32::from(i), vec![i], vec![i].into())?;
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(8, &[8u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[8]);
            assert!(db.get(8, &[8u8, 8])?.is_none());
            assert!(db.get(8, &[0u8])?.is_none());
            assert!(db.get(8, &[255u8])?.is_none());
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Medium keys and values",
        |batch| {
            for i in 0..200u8 {
                let mut key = vec![3u8];
                key.extend(vec![i; 10 * 1024]);
                batch.put(0, key, vec![i; 100 * 1024].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..200u8 {
                let mut key = vec![3u8];
                key.extend(vec![i; 10 * 1024]);
                let Some(value) = db.get(0, &key)? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &vec![i; 100 * 1024]);
            }
            Ok(())
        },
    );

    const BLOB_SIZE: usize = 65 * 1024 * 1024;
    #[expect(clippy::assertions_on_constants)]
    {
        assert!(BLOB_SIZE > MAX_MEDIUM_VALUE_SIZE);
    }
    test_case(
        &mut test_cases,
        "Large keys and values (blob files)",
        |batch| {
            for i in 0..2u8 {
                let mut key = vec![4u8];
                key.extend(vec![i; BLOB_SIZE]);
                batch.put(0, key, vec![i; BLOB_SIZE].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..2u8 {
                let mut key = vec![4u8];
                key.extend(vec![i; BLOB_SIZE]);
                let value_expected = vec![i; BLOB_SIZE];
                let Some(value) = db.get(0, &key)? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &value_expected);
            }
            Ok(())
        },
    );

    fn different_sizes_range() -> impl Iterator<Item = u8> {
        (10..20).map(|value| value * 10)
    }
    test_case(
        &mut test_cases,
        "Different sizes keys and values",
        |batch| {
            for i in different_sizes_range() {
                let mut key = vec![5u8];
                key.extend(vec![i; i as usize]);
                batch.put(0, key, vec![i; i as usize].into())?;
            }
            Ok(())
        },
        |db| {
            for i in different_sizes_range() {
                let mut key = vec![5u8];
                key.extend(vec![i; i as usize]);
                let Some(value) = db.get(0, &key)? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &vec![i; i as usize]);
            }
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many items (1% read)",
        |batch| {
            for i in 0..1000 * 1024u32 {
                let key = [&[6u8], &i.to_be_bytes()[..]].concat();
                batch.put(0, key, i.to_be_bytes().to_vec().into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..10 * 1024u32 {
                let i = i * 100;
                let key = [&[6u8], &i.to_be_bytes()[..]].concat();
                let Some(value) = db.get(0, &key)? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &i.to_be_bytes());
            }
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many items (1% read, multi-threaded)",
        |batch| {
            (0..10 * 1024 * 1024u32).into_par_iter().for_each(|i| {
                let key = [&[7u8], &i.to_be_bytes()[..]].concat();
                batch.put(0, key, i.to_be_bytes().to_vec().into()).unwrap();
            });
            Ok(())
        },
        |db| {
            (0..100 * 1024u32).into_par_iter().for_each(|i| {
                let i = i * 100;
                let key = [&[7u8], &i.to_be_bytes()[..]].concat();
                let Some(value) = db.get(0, &key).unwrap() else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &i.to_be_bytes());
            });
            Ok(())
        },
    );

    // Run each test case standalone
    for (name, write, read) in test_cases.iter() {
        let tempdir = tempfile::tempdir()?;
        let path = tempdir.path();

        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            let mut batch = db.write_batch()?;
            write(&mut batch)?;
            db.commit_write_batch(batch)?;
            println!("{name} write time: {:?}", start.elapsed());

            let start = Instant::now();
            read(&db)?;
            println!("{name} read time: {:?}", start.elapsed());

            let start = Instant::now();
            drop(db);
            println!("{name} drop time: {:?}", start.elapsed());
        }
        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            println!("{name} restore time: {:?}", start.elapsed());
            let start = Instant::now();
            read(&db)?;
            println!("{name} read time after restore: {:?}", start.elapsed());
            let start = Instant::now();
            read(&db)?;
            println!("{name} read time after read: {:?}", start.elapsed());

            #[cfg(feature = "stats")]
            println!("{name} stats: {:#?}", db.statistics());

            let start = Instant::now();
            db.full_compact()?;
            println!("{name} compact time: {:?}", start.elapsed());

            let start = Instant::now();
            read(&db)?;
            println!("{name} read time after compact: {:?}", start.elapsed());

            let start = Instant::now();
            drop(db);
            println!("{name} drop time after compact: {:?}", start.elapsed());
        }
        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            println!("{name} restore time after compact: {:?}", start.elapsed());
            let start = Instant::now();
            read(&db)?;
            println!(
                "{name} read time after compact + restore: {:?}",
                start.elapsed()
            );
            let start = Instant::now();
            read(&db)?;
            println!(
                "{name} read time after compact + restore + read: {:?}",
                start.elapsed()
            );

            #[cfg(feature = "stats")]
            println!("{name} stats (compacted): {:#?}", db.statistics());

            let start = Instant::now();
            drop(db);
            println!(
                "{name} drop time after compact + restore: {:?}",
                start.elapsed()
            );
        }
    }

    // Run all test cases in a single db
    {
        let tempdir = tempfile::tempdir()?;
        let path = tempdir.path();

        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            let mut batch = db.write_batch()?;
            for (_, write, _) in test_cases.iter() {
                write(&mut batch)?;
            }
            db.commit_write_batch(batch)?;
            println!("All write time: {:?}", start.elapsed());

            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!("{name} read time: {:?}", start.elapsed());
            }

            let start = Instant::now();
            drop(db);
            println!("All drop time: {:?}", start.elapsed());
        }
        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            println!("All restore time: {:?}", start.elapsed());
            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!("{name} read time after restore: {:?}", start.elapsed());
            }
            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!("{name} read time after read: {:?}", start.elapsed());
            }
            #[cfg(feature = "stats")]
            println!("All stats: {:#?}", db.statistics());

            let start = Instant::now();
            db.full_compact()?;
            println!("All compact time: {:?}", start.elapsed());

            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!("{name} read time after compact: {:?}", start.elapsed());
            }

            let start = Instant::now();
            drop(db);
            println!("All drop time after compact: {:?}", start.elapsed());
        }

        {
            let start = Instant::now();
            let db = open_db::<16>(path, mmap)?;
            println!("All restore time after compact: {:?}", start.elapsed());

            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!(
                    "{name} read time after compact + restore: {:?}",
                    start.elapsed()
                );
            }
            for (name, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!(
                    "{name} read time after compact + restore + read: {:?}",
                    start.elapsed()
                );
            }

            #[cfg(feature = "stats")]
            println!("All stats (compacted): {:#?}", db.statistics());

            let start = Instant::now();
            drop(db);
            println!(
                "All drop time after compact + restore: {:?}",
                start.elapsed()
            );
        }
    }
    Ok(())
}

// This test exceeded 20 minutes under Miri because it writes and repeatedly reads tens of
// thousands of entries across multiple reopen/compaction cycles.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn persist_changes(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(b: &WriteBatch<Box<[u8]>, RayonParallelScheduler, 1>, key: u8, value: u8) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(0, tuple_key(key, i.to_be_bytes()), vec![value].into())?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler, 1>, key: u8, value: u8) -> Result<()> {
        for i in 0..READ_COUNT {
            // read every 10th item
            let i = i * 10;
            assert_eq!(
                db.get(0, &(key, i.to_be_bytes()))?.as_deref(),
                Some(&[value][..]),
            );
        }
        Ok(())
    }

    {
        let db = open_db::<1>(path, mmap)?;
        let b = db.write_batch()?;
        put(&b, 1, 11)?;
        put(&b, 2, 21)?;
        put(&b, 3, 31)?;
        db.commit_write_batch(b)?;

        check(&db, 1, 11)?;
        check(&db, 2, 21)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = open_db::<1>(path, mmap)?;
        let b = db.write_batch()?;
        put(&b, 1, 12)?;
        put(&b, 2, 22)?;
        db.commit_write_batch(b)?;

        check(&db, 1, 12)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    {
        let db = open_db::<1>(path, mmap)?;
        let b = db.write_batch()?;
        put(&b, 1, 13)?;
        db.commit_write_batch(b)?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = open_db::<1>(path, mmap)?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = open_db::<1>(path, mmap)?;

        db.compact(&CompactConfig {
            optimal_merge_count: 4,
            min_merge_duplication_bytes: 1,
            optimal_merge_duplication_bytes: 1,
            ..Default::default()
        })?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = open_db::<1>(path, mmap)?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    Ok(())
}

// This 50-iteration compaction/restore stress test exceeded 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn partial_compaction(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(b: &WriteBatch<Box<[u8]>, RayonParallelScheduler, 1>, key: u8, value: u8) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(0, tuple_key(key, i.to_be_bytes()), vec![value].into())?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler, 1>, key: u8, value: u8) -> Result<()> {
        for i in 0..READ_COUNT {
            // read every 10th item
            let i = i * 10;
            assert_eq!(
                db.get(0, &(key, i.to_be_bytes()))?.as_deref(),
                Some(&[value][..]),
                "Key {key} {i} expected {value}"
            );
        }
        Ok(())
    }

    for i in 0..50 {
        println!("--- Iteration {i} ---");
        println!("Add more entries");
        {
            let db = open_db::<1>(path, mmap)?;
            let b = db.write_batch()?;
            put(&b, i, i)?;
            put(&b, i + 1, i)?;
            put(&b, i + 2, i)?;
            db.commit_write_batch(b)?;

            for j in 0..i {
                check(&db, j, j)?;
            }
            check(&db, i, i)?;
            check(&db, i + 1, i)?;
            check(&db, i + 2, i)?;

            db.shutdown()?;
        }

        println!("Compaction");
        {
            let db = open_db::<1>(path, mmap)?;

            db.compact(&CompactConfig {
                optimal_merge_count: 4,
                min_merge_duplication_bytes: 1,
                optimal_merge_duplication_bytes: 1,
                ..Default::default()
            })?;

            for j in 0..i {
                check(&db, j, j)?;
            }
            check(&db, i, i)?;
            check(&db, i + 1, i)?;
            check(&db, i + 2, i)?;

            db.shutdown()?;
        }

        println!("Restore check");
        {
            let db = open_db::<1>(path, mmap)?;

            for j in 0..i {
                check(&db, j, j)?;
            }
            check(&db, i, i)?;
            check(&db, i + 1, i)?;
            check(&db, i + 2, i)?;

            db.shutdown()?;
        }
    }

    Ok(())
}

// This repeated large-file merge/removal stress test exceeded 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn merge_file_removal(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let _ = fs::remove_dir_all(path);

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(
        b: &WriteBatch<Box<[u8]>, RayonParallelScheduler, 1>,
        key: u8,
        value: u32,
    ) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(
                0,
                tuple_key(key, i.to_be_bytes()),
                value.to_be_bytes().to_vec().into(),
            )?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler, 1>, key: u8, value: u32) -> Result<()> {
        for i in 0..READ_COUNT {
            // read every 10th item
            let i = i * 10;
            assert_eq!(
                db.get(0, &(key, i.to_be_bytes()))?.as_deref(),
                Some(&value.to_be_bytes()[..]),
                "Key {key} {i} expected {value}"
            );
        }
        Ok(())
    }
    fn iter_bits(v: u32) -> impl Iterator<Item = u8> {
        (0..32u8).filter(move |i| v & (1 << i) != 0)
    }

    {
        println!("--- Init ---");
        let db = open_db::<1>(path, mmap)?;
        let b = db.write_batch()?;
        for j in 0..=255 {
            put(&b, j, 0)?;
        }
        db.commit_write_batch(b)?;
        db.shutdown()?;
    }

    let mut expected_values = [0; 256];

    for i in 1..50 {
        println!("--- Iteration {i} ---");
        let i = i * 37;
        println!("Add more entries");
        {
            let db = open_db::<1>(path, mmap)?;
            let b = db.write_batch()?;
            for j in iter_bits(i) {
                println!("Put {j} = {i}");
                expected_values[j as usize] = i;
                put(&b, j, i)?;
            }
            db.commit_write_batch(b)?;

            for j in 0..32 {
                check(&db, j, expected_values[j as usize])?;
            }

            db.shutdown()?;
        }

        println!("Compaction");
        {
            let db = open_db::<1>(path, mmap)?;

            db.compact(&CompactConfig {
                optimal_merge_count: 4,
                min_merge_duplication_bytes: 1,
                optimal_merge_duplication_bytes: 1,
                ..Default::default()
            })?;

            for j in 0..32 {
                check(&db, j, expected_values[j as usize])?;
            }

            db.shutdown()?;
        }

        println!("Restore check");
        {
            let db = open_db::<1>(path, mmap)?;

            for j in 0..32 {
                check(&db, j, expected_values[j as usize])?;
            }

            db.shutdown()?;
        }
    }

    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_basic(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write some test data
    let batch = db.write_batch()?;
    for i in 0..100u8 {
        batch.put(0, vec![i], vec![i].into())?;
    }
    db.commit_write_batch(batch)?;

    // Test batch_get with mixed existing and non-existing keys
    let keys_to_fetch = vec![vec![10u8], vec![20u8], vec![200u8], vec![50u8], vec![255u8]];
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 5);
    assert_eq!(results[0].as_deref(), Some(&[10u8][..]));
    assert_eq!(results[1].as_deref(), Some(&[20u8][..]));
    assert_eq!(results[2], None); // 200 doesn't exist
    assert_eq!(results[3].as_deref(), Some(&[50u8][..]));
    assert_eq!(results[4], None); // 255 doesn't exist

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_all_existing(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write test data
    let batch = db.write_batch()?;
    for i in 0..50u8 {
        batch.put(0, vec![i], vec![i * 2].into())?;
    }
    db.commit_write_batch(batch)?;

    // Fetch all existing keys
    let keys_to_fetch: Vec<Vec<u8>> = (0..50u8).map(|i| vec![i]).collect();
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 50);
    for (i, result) in results.iter().enumerate() {
        assert_eq!(result.as_deref(), Some(&[(i * 2) as u8][..]));
    }

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_none_existing(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write some data but query different keys
    let batch = db.write_batch()?;
    for i in 0..10u8 {
        batch.put(0, vec![i], vec![i].into())?;
    }
    db.commit_write_batch(batch)?;

    // Fetch non-existing keys
    let keys_to_fetch: Vec<Vec<u8>> = (100..110u8).map(|i| vec![i]).collect();
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 10);
    for result in results.iter() {
        assert_eq!(result, &None);
    }

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_empty(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write some data
    let batch = db.write_batch()?;
    batch.put(0, vec![1u8], vec![1u8].into())?;
    db.commit_write_batch(batch)?;

    // Fetch with empty key list
    let keys_to_fetch: Vec<Vec<u8>> = vec![];
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 0);

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_duplicate_keys(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write test data
    let batch = db.write_batch()?;
    batch.put(0, vec![42u8], vec![100u8].into())?;
    batch.put(0, vec![43u8], vec![101u8].into())?;
    db.commit_write_batch(batch)?;

    // Fetch with duplicate keys - results should maintain order
    let keys_to_fetch = vec![
        vec![42u8],
        vec![43u8],
        vec![42u8],
        vec![99u8], // non-existing
        vec![42u8],
    ];
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 5);
    assert_eq!(results[0].as_deref(), Some(&[100u8][..]));
    assert_eq!(results[1].as_deref(), Some(&[101u8][..]));
    assert_eq!(results[2].as_deref(), Some(&[100u8][..]));
    assert_eq!(results[3], None);
    assert_eq!(results[4].as_deref(), Some(&[100u8][..]));

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_large_batch(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write many entries
    let batch = db.write_batch()?;
    for i in 0..1000u32 {
        batch.put(
            0,
            i.to_be_bytes().to_vec(),
            (i * 2).to_be_bytes().to_vec().into(),
        )?;
    }
    db.commit_write_batch(batch)?;

    // Fetch a large batch (every 10th entry)
    let keys_to_fetch: Vec<Vec<u8>> = (0..1000u32)
        .filter(|i| i % 10 == 0)
        .map(|i| i.to_be_bytes().to_vec())
        .collect();
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 100);
    for (idx, i) in (0..1000u32).filter(|i| i % 10 == 0).enumerate() {
        assert_eq!(
            results[idx].as_deref(),
            Some(&(i * 2).to_be_bytes()[..]),
            "Failed at index {idx} for key {i}"
        );
    }

    db.shutdown()?;
    Ok(())
}

// Crossing the real blob-size boundary makes this test exceed 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_different_sizes(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let mut config = config_with_mmap(mmap);
    config.family_configs[0].compression = Compression::Zstd3;
    let db = open_db_with_config::<16>(path, config)?;

    // Write values of different sizes
    let batch = db.write_batch()?;
    batch.put(0, vec![0u8], vec![].into())?; // empty
    batch.put(0, vec![1u8], vec![1u8; 4].into())?; // inline
    batch.put(0, vec![2u8], vec![2u8; 10].into())?; // small
    batch.put(0, vec![3u8], vec![3u8; MAX_SMALL_VALUE_SIZE + 1].into())?; // medium
    batch.put(0, vec![4u8], vec![4u8; 10 * MAX_SMALL_VALUE_SIZE].into())?; // larger
    batch.put(0, vec![5u8], vec![5u8; MAX_MEDIUM_VALUE_SIZE + 1].into())?; // blob
    db.commit_write_batch(batch)?;

    // Fetch all with different sizes
    let keys_to_fetch = vec![
        vec![0u8],
        vec![1u8],
        vec![2u8],
        vec![3u8],
        vec![4u8],
        vec![5u8],
        vec![6u8], // non-existing
    ];
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 7);
    assert_eq!(results[0].as_deref(), Some(&[][..]));
    assert_eq!(results[1].as_deref(), Some(&vec![1u8; 4][..]));
    assert_eq!(results[2].as_deref(), Some(&vec![2u8; 10][..]));
    assert_eq!(
        results[3].as_deref(),
        Some(&vec![3u8; MAX_SMALL_VALUE_SIZE + 1][..])
    );
    assert_eq!(
        results[4].as_deref(),
        Some(&vec![4u8; 10 * MAX_SMALL_VALUE_SIZE][..])
    );
    assert_eq!(
        results[5].as_deref(),
        Some(&vec![5u8; MAX_MEDIUM_VALUE_SIZE + 1][..])
    );
    assert_eq!(results[6], None);

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_across_families(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let mut config = config_with_mmap(mmap);
    // Set zstd on an arbitrary family; lz4 is used by default.
    config.family_configs[2].compression = Compression::Zstd3;
    let db = open_db_with_config::<16>(path, config.clone())?;

    // Write compressible values to multiple families so every configured codec is exercised.
    let batch = db.write_batch()?;
    for family in 0..4u32 {
        for i in 0..20u8 {
            let mut value = vec![family as u8; 1024];
            value[0] = i;
            batch.put(family, vec![i], value.into())?;
        }
    }
    db.commit_write_batch(batch)?;

    // Fetch from each family separately
    for family in 0..4usize {
        let keys_to_fetch: Vec<Vec<u8>> = (0..20u8).map(|i| vec![i]).collect();
        let results = db.batch_get(family, &keys_to_fetch)?;

        assert_eq!(results.len(), 20);
        for (i, result) in results.iter().enumerate() {
            assert_eq!(
                result.as_deref(),
                Some(
                    &{
                        let mut value = vec![family as u8; 1024];
                        value[0] = i as u8;
                        value
                    }[..]
                ),
                "Failed at family {family}, index {i}"
            );
        }
    }

    // Verify family isolation - keys from family 0 shouldn't be in family 1
    let keys_to_fetch: Vec<Vec<u8>> = (0..20u8).map(|i| vec![i]).collect();
    let results_f0 = db.batch_get(0, &keys_to_fetch)?;
    let results_f1 = db.batch_get(1, &keys_to_fetch)?;

    // Same keys, but different values per family
    assert_ne!(results_f0[0].as_deref(), results_f1[0].as_deref());

    db.shutdown()?;
    drop(db);

    // Reopen with the same family configuration recorded in the meta files.
    let db = TurboPersistence::<_, 16>::open_with_config_and_parallel_scheduler(
        path.to_path_buf(),
        config,
        RayonParallelScheduler,
    )?;
    let value = db.get(2, &vec![7u8])?.expect("zstd family value exists");
    assert_eq!(value[0], 7);
    assert!(value[1..].iter().all(|byte| *byte == 2));
    db.shutdown()?;
    drop(db);

    // Reopening with the wrong codec must fail while validating the meta files.
    assert!(
        TurboPersistence::<RayonParallelScheduler, 16>::open_with_config_and_parallel_scheduler(
            path.to_path_buf(),
            DbConfig::default(),
            RayonParallelScheduler,
        )
        .is_err()
    );
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_after_compaction(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let mut config = config_with_mmap(mmap);
    config.family_configs[0].compression = Compression::Zstd3;
    let db = open_db_with_config::<16>(path, config)?;

    // Write data across multiple batches to create multiple SST files
    for batch_num in 0..5u8 {
        let batch = db.write_batch()?;
        for i in 0..20u8 {
            let key = batch_num * 20 + i;
            batch.put(0, vec![key], vec![key].into())?;
        }
        db.commit_write_batch(batch)?;
    }

    // Fetch before compaction
    let keys_to_fetch: Vec<Vec<u8>> = (0..100u8).map(|i| vec![i]).collect();
    let results_before = db.batch_get(0, &keys_to_fetch)?;

    // Compact database using zstd to cover recompression with a non-default codec.
    db.full_compact()?;

    // Fetch after compaction
    let results_after = db.batch_get(0, &keys_to_fetch)?;

    // Results should be identical
    assert_eq!(results_before.len(), results_after.len());
    for i in 0..100 {
        assert_eq!(
            results_before[i].as_deref(),
            results_after[i].as_deref(),
            "Mismatch at index {i}"
        );
        assert_eq!(results_after[i].as_deref(), Some(&[i as u8][..]));
    }

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_with_overwrites(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write initial data
    let batch = db.write_batch()?;
    for i in 0..50u8 {
        batch.put(0, vec![i], vec![i].into())?;
    }
    db.commit_write_batch(batch)?;

    // Overwrite some keys
    let batch = db.write_batch()?;
    for i in 0..25u8 {
        batch.put(0, vec![i], vec![i + 100].into())?;
    }
    db.commit_write_batch(batch)?;

    // Fetch all keys
    let keys_to_fetch: Vec<Vec<u8>> = (0..50u8).map(|i| vec![i]).collect();
    let results = db.batch_get(0, &keys_to_fetch)?;

    assert_eq!(results.len(), 50);
    // First 25 should have new values
    for (i, result) in results.iter().enumerate().take(25) {
        assert_eq!(
            result.as_deref(),
            Some(&[i as u8 + 100][..]),
            "Failed at index {i}"
        );
    }
    // Last 25 should have original values
    for (i, result) in results.iter().enumerate().skip(25) {
        assert_eq!(
            result.as_deref(),
            Some(&[i as u8][..]),
            "Failed at index {i}"
        );
    }

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_comparison_with_get(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<16>(path, mmap)?;

    // Write test data
    let batch = db.write_batch()?;
    for i in 0..100u32 {
        batch.put(
            0,
            i.to_be_bytes().to_vec(),
            (i * 3).to_be_bytes().to_vec().into(),
        )?;
    }
    db.commit_write_batch(batch)?;

    // Prepare keys
    let keys_to_fetch: Vec<Vec<u8>> = (0..150u32)
        .filter(|i| i % 3 == 0)
        .map(|i| i.to_be_bytes().to_vec())
        .collect();

    // Get results using batch_get
    let batch_results = db.batch_get(0, &keys_to_fetch)?;

    // Get results using individual get calls
    let mut individual_results = Vec::new();
    for key in &keys_to_fetch {
        individual_results.push(db.get(0, key)?);
    }

    // Compare results
    assert_eq!(batch_results.len(), individual_results.len());
    for (i, (batch_result, individual_result)) in batch_results
        .iter()
        .zip(individual_results.iter())
        .enumerate()
    {
        assert_eq!(
            batch_result.as_deref(),
            individual_result.as_deref(),
            "Mismatch at index {i}"
        );
    }

    db.shutdown()?;
    Ok(())
}

#[rstest]
#[case(true)]
#[case(false)]
fn batch_get_after_restore(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    // Write data and close
    {
        let db = open_db::<16>(path, mmap)?;

        let batch = db.write_batch()?;
        for i in 0..100u8 {
            batch.put(0, vec![i], vec![i, i + 1].into())?;
        }
        db.commit_write_batch(batch)?;
        db.shutdown()?;
    }

    // Reopen and test batch_get
    {
        let db = open_db::<16>(path, mmap)?;

        let keys_to_fetch: Vec<Vec<u8>> = (0..100u8).step_by(5).map(|i| vec![i]).collect();
        let results = db.batch_get(0, &keys_to_fetch)?;

        assert_eq!(results.len(), 20);
        for (idx, i) in (0..100u8).step_by(5).enumerate() {
            assert_eq!(
                results[idx].as_deref(),
                Some(&vec![i, i + 1][..]),
                "Failed at index {idx} for key {i}"
            );
        }

        db.shutdown()?;
    }

    Ok(())
}

/// Test that compaction works with many small values without overflowing block indices.
/// Reproduces a CI benchmark failure with key_4/value_512/entries_1.98Mi/compacted.
// Miri was killed while processing this production-scale, two-million-entry workload.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn many_small_values_compaction(#[case] mmap: bool) -> Result<()> {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use crate::parallel_scheduler::SerialScheduler;

    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = TurboPersistence::<SerialScheduler, 1>::open_with_config(
        path.to_path_buf(),
        config_with_mmap(mmap),
    )?;

    let mut rng = SmallRng::seed_from_u64(42);

    // Mimic the benchmark: key_size=4, value_size=512, single commit, then compact.
    // entry_count = 1GB / (4+512) ≈ 2M entries
    let entry_count = 1024 * 1024 * 1024 / (4 + 512);
    let batch = db.write_batch()?;
    for i in 0..entry_count as u32 {
        let key = i.to_be_bytes().to_vec();
        let mut value = vec![0u8; 512];
        rng.fill(&mut value[..]);
        batch.put(0, key, value.into())?;
    }
    db.commit_write_batch(batch)?;

    // This is what panics in CI with "Block index overflow"
    for _ in 0..3 {
        db.full_compact()?;
    }

    // Quick sanity check
    let result = db.get(0, &0u32.to_be_bytes())?;
    assert!(result.is_some(), "Entry 0 not found after compaction");
    assert_eq!(result.unwrap().len(), 512);

    db.shutdown()?;
    Ok(())
}

/// Test compaction with MAX_SMALL_VALUE_SIZE (4096-byte) values.
/// Worst case for small value blocks: fewest entries per block.
// This production-scale 512K-entry workload exceeded 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn many_max_small_values_compaction(#[case] mmap: bool) -> Result<()> {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use crate::{constants::MAX_SMALL_VALUE_SIZE, parallel_scheduler::SerialScheduler};

    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = TurboPersistence::<SerialScheduler, 1>::open_with_config(
        path.to_path_buf(),
        config_with_mmap(mmap),
    )?;

    let mut rng = SmallRng::seed_from_u64(43);

    // Write enough entries across two commits so compaction merges them into large SSTs.
    let entry_count = 512 * 1024;
    for batch_start in [0, entry_count] {
        let batch = db.write_batch()?;
        for i in batch_start..batch_start + entry_count {
            let key = (i as u32).to_be_bytes().to_vec();
            let mut value = vec![0u8; MAX_SMALL_VALUE_SIZE];
            rng.fill(&mut value[..]);
            batch.put(0, key, value.into())?;
        }
        db.commit_write_batch(batch)?;
    }

    for _ in 0..3 {
        db.full_compact()?;
    }

    let result = db.get(0, &0u32.to_be_bytes())?;
    assert!(result.is_some(), "Entry 0 not found after compaction");
    assert_eq!(result.unwrap().len(), MAX_SMALL_VALUE_SIZE);

    db.shutdown()?;
    Ok(())
}

/// Test compaction with 4097-byte values (minimum medium size).
/// Each medium value gets its own dedicated block, so this is the worst case for block count.
// This production-scale 128K-entry workload exceeded 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn many_medium_values_compaction(#[case] mmap: bool) -> Result<()> {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use crate::{constants::MAX_SMALL_VALUE_SIZE, parallel_scheduler::SerialScheduler};

    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = TurboPersistence::<SerialScheduler, 1>::open_with_config(
        path.to_path_buf(),
        config_with_mmap(mmap),
    )?;

    let mut rng = SmallRng::seed_from_u64(44);

    let value_size = MAX_SMALL_VALUE_SIZE + 1; // 4097 bytes = minimum medium size
    // Write enough entries across two commits so compaction merges them.
    let entry_count = 128 * 1024;
    for batch_start in [0, entry_count] {
        let batch = db.write_batch()?;
        for i in batch_start..batch_start + entry_count {
            let key = (i as u32).to_be_bytes().to_vec();
            let mut value = vec![0u8; value_size];
            rng.fill(&mut value[..]);
            batch.put(0, key, value.into())?;
        }
        db.commit_write_batch(batch)?;
    }

    for _ in 0..3 {
        db.full_compact()?;
    }

    let result = db.get(0, &0u32.to_be_bytes())?;
    assert!(result.is_some(), "Entry 0 not found after compaction");
    assert_eq!(result.unwrap().len(), value_size);

    db.shutdown()?;
    Ok(())
}

// Duplicate keys in one SingleValue batch are a user error.
#[test]
#[cfg(debug_assertions)]
#[should_panic(expected = "WriteBatch invariant violation: SingleValue family has duplicate key")]
fn single_value_duplicate_key_panics() {
    let tempdir = tempfile::tempdir().unwrap();
    let path = tempdir.path();

    // For SingleValue, writing the same key twice in one batch should panic in debug builds.
    let key = vec![1u8];

    let db = TurboPersistence::<_, 1>::open_with_parallel_scheduler(
        path.to_path_buf(),
        RayonParallelScheduler,
    )
    .unwrap();

    let batch = db.write_batch().unwrap();
    batch.put(0, key.clone(), vec![10u8].into()).unwrap();
    batch.put(0, key.clone(), vec![20u8].into()).unwrap(); // should panic
    db.commit_write_batch(batch).unwrap(); // panics during commit
}

/// Returns the number of `.blob` files in the given directory.
#[cfg(not(miri))]
fn count_blob_files(dir: &Path) -> usize {
    fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "blob"))
        .count()
}

/// Test that compaction deletes blob files when their entries are superseded
/// by newer values (SingleValue family).
// The first access-mode variant exceeded 20 minutes under Miri while processing the production-size
// blob boundary.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn compaction_deletes_superseded_blob(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<1>(path, mmap)?;

    let blob_value = vec![42u8; MAX_MEDIUM_VALUE_SIZE + 1];

    // Write a blob-sized value
    let batch = db.write_batch()?;
    batch.put(0, vec![1u8], blob_value.clone().into())?;
    db.commit_write_batch(batch)?;

    assert_eq!(
        count_blob_files(path),
        1,
        "Should have 1 blob file after first write"
    );

    // Verify we can read it
    let result = db.get(0, &vec![1u8])?;
    assert_eq!(result.as_deref(), Some(&blob_value[..]));

    // Overwrite the key with a small (non-blob) value in a new batch
    let batch = db.write_batch()?;
    batch.put(0, vec![1u8], vec![99u8].into())?;
    db.commit_write_batch(batch)?;

    // Blob file still exists before compaction (old SST still references it)
    assert_eq!(
        count_blob_files(path),
        1,
        "Blob file should still exist before compaction"
    );

    // Compact — the old blob entry is superseded by the newer small value
    db.full_compact()?;

    // The new value should still be readable
    let result = db.get(0, &vec![1u8])?;
    assert_eq!(result.as_deref(), Some(&[99u8][..]));

    // After compaction, the old blob file should be deleted immediately.
    assert_eq!(
        count_blob_files(path),
        0,
        "Old blob file should be deleted after compaction"
    );

    db.shutdown()?;

    Ok(())
}

/// Test that compaction deletes blob files when a key is deleted via tombstone
/// (SingleValue family).
// The first access-mode variant exceeded 20 minutes under Miri while processing the production-size
// blob boundary.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn compaction_deletes_blob_on_tombstone(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<1>(path, mmap)?;

    let blob_value = vec![42u8; MAX_MEDIUM_VALUE_SIZE + 1];

    // Write a blob-sized value
    let batch = db.write_batch()?;
    batch.put(0, vec![1u8], blob_value.clone().into())?;
    db.commit_write_batch(batch)?;

    assert_eq!(count_blob_files(path), 1);

    // Delete the key
    let batch = db.write_batch()?;
    batch.delete(0, vec![1u8])?;
    db.commit_write_batch(batch)?;

    // Blob file still exists before compaction
    assert_eq!(
        count_blob_files(path),
        1,
        "Blob file should still exist before compaction"
    );

    // Compact — tombstone supersedes the blob entry
    db.full_compact()?;

    // Key should not be found
    let result = db.get(0, &vec![1u8])?;
    assert!(result.is_none());

    // After compaction, the blob file should be deleted immediately.
    assert_eq!(
        count_blob_files(path),
        0,
        "Blob file should be deleted after compaction"
    );

    db.shutdown()?;

    Ok(())
}

/// Test that compaction deletes blob files for removed set-valued mode families when a
/// tombstone prunes older blob entries.
// The first access-mode variant exceeded 20 minutes under Miri while processing the production-size
// blob boundary.
/// Test that compaction preserves blob files that are still referenced
/// (not superseded).
// The first access-mode variant exceeded 20 minutes under Miri while processing the production-size
// blob boundary.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn compaction_preserves_active_blob(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let db = open_db::<1>(path, mmap)?;

    let blob_value = vec![42u8; MAX_MEDIUM_VALUE_SIZE + 1];

    // Write a blob-sized value
    let batch = db.write_batch()?;
    batch.put(0, vec![1u8], blob_value.clone().into())?;
    db.commit_write_batch(batch)?;

    // Write a different key to create a second SST (so compaction has work to do)
    let batch = db.write_batch()?;
    batch.put(0, vec![2u8], vec![1u8].into())?;
    db.commit_write_batch(batch)?;

    assert_eq!(count_blob_files(path), 1);

    // Compact — the blob entry is still the latest, should be preserved
    db.full_compact()?;

    // Blob file should still exist
    assert_eq!(
        count_blob_files(path),
        1,
        "Active blob file should be preserved after compaction"
    );

    // Value should still be readable
    let result = db.get(0, &vec![1u8])?;
    assert_eq!(result.as_deref(), Some(&blob_value[..]));

    db.shutdown()?;
    Ok(())
}

/// A `CURRENT.next` file left behind by a crash mid-`commit_current` (before the rename onto
/// `CURRENT` completed) must not break opening the database: it should be ignored/cleaned up and
/// the last committed `CURRENT` should remain authoritative.
#[test]
fn stale_current_next_is_recovered() -> Result<()> {
    use crate::parallel_scheduler::SerialScheduler;

    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    // Commit a value so CURRENT points at a real sequence number.
    {
        let db = TurboPersistence::<SerialScheduler, 1>::open(path.to_path_buf())?;
        let batch = db.write_batch()?;
        batch.put(0, vec![1u8], vec![42u8].into())?;
        db.commit_write_batch(batch)?;
        db.shutdown()?;
    }

    // Simulate a crash partway through a later CURRENT update: a stray, even garbage-length,
    // CURRENT.next is present on disk while CURRENT itself is untouched.
    fs::write(path.join("CURRENT.next"), b"\xAA")?;

    // Opening must succeed, remove the stale temp file, and still read the committed value.
    {
        let db = TurboPersistence::<SerialScheduler, 1>::open(path.to_path_buf())?;
        assert_eq!(db.get(0, &vec![1u8])?.as_deref(), Some(&[42u8][..]));
        db.shutdown()?;
    }
    assert!(
        !path.join("CURRENT.next").exists(),
        "stale CURRENT.next should be cleaned up on open"
    );

    Ok(())
}

/// `CURRENT` round-trips through JSON, recording both the sequence number and the commit time.
#[test]
fn current_file_is_json_with_commit_time() -> Result<()> {
    use crate::parallel_scheduler::SerialScheduler;

    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let before = jiff::Timestamp::now();
    {
        let db = TurboPersistence::<SerialScheduler, 1>::open(path.to_path_buf())?;
        let batch = db.write_batch()?;
        batch.put(0, vec![1u8], vec![42u8].into())?;
        db.commit_write_batch(batch)?;
        db.shutdown()?;
    }
    let after = jiff::Timestamp::now();

    // next.js parses `CURRENT` without going through this crate, so these field names are a
    // public contract.
    let raw = fs::read_to_string(path.join("CURRENT"))?;
    assert!(raw.contains("max_sequence_number"), "got: {raw}");
    assert!(raw.contains("commit_time"), "got: {raw}");

    let version = read_current_version(path)?.expect("CURRENT should exist");
    assert!(version.max_sequence_number > 0);
    assert!(
        version.commit_time >= before && version.commit_time <= after,
        "commit_time {} outside [{before}, {after}]",
        version.commit_time
    );
    Ok(())
}

// This 8,000-key meta-sharding compaction test exceeded 20 minutes under Miri.
#[cfg(not(miri))]
#[rstest]
#[case(true)]
#[case(false)]
fn partial_compaction_retires_fully_consumed_meta_files(#[case] mmap: bool) -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();
    let access_mode = if mmap {
        crate::mmap_access_mode()
    } else {
        AccessMode::File
    };
    let db = open_db::<1>(path, mmap)?;

    const KEYS: u32 = 2_000;
    for generation in 0..4u32 {
        let batch = db.write_batch()?;
        for key in 0..KEYS {
            batch.put(
                0,
                key.to_be_bytes().to_vec(),
                generation.to_be_bytes().to_vec().into(),
            )?;
        }
        db.commit_write_batch(batch)?;
        if generation == 0 {
            // Flush this access into the following commit's used-key-hash AMQF.
            assert!(db.get(0, &0u32.to_be_bytes())?.is_some());
        }
    }
    let before_meta_sequences = db
        .meta_info()?
        .into_iter()
        .map(|meta| meta.sequence_number)
        .collect::<Vec<_>>();
    assert_eq!(before_meta_sequences.len(), 4);
    assert!(before_meta_sequences.iter().any(|&seq| {
        MetaFile::open(path, seq, None, access_mode)
            .unwrap()
            .deserialize_used_key_hashes_amqf()
            .unwrap()
            .is_some()
    }));

    let partial = CompactConfig {
        min_merge_count: 2,
        optimal_merge_count: 2,
        max_merge_count: 2,
        max_merge_bytes: u64::MAX,
        min_merge_duplication_bytes: 0,
        optimal_merge_duplication_bytes: 0,
        max_merge_segment_count: 1,
    };
    assert!(db.compact(&partial)?.is_some());
    let after_partial = db.meta_info()?;
    assert_eq!(
        after_partial.len(),
        3,
        "two fully consumed meta files should retire while two untouched metas remain"
    );
    assert_eq!(
        after_partial
            .iter()
            .filter(|meta| before_meta_sequences.contains(&meta.sequence_number))
            .count(),
        2,
        "untouched SST metadata should stay in its two existing meta files"
    );
    for key in 0..KEYS {
        assert_eq!(
            &*db.get(0, &key.to_be_bytes())?.unwrap(),
            &3u32.to_be_bytes()
        );
    }

    db.full_compact()?;
    let fully_compacted = db.meta_info()?;
    assert_eq!(fully_compacted.len(), 1);
    let compacted_meta =
        MetaFile::open(path, fully_compacted[0].sequence_number, None, access_mode)?;
    assert!(
        compacted_meta.deserialize_used_key_hashes_amqf()?.is_none(),
        "used-key marks should expire instead of being copied into compaction output"
    );
    drop(db);

    let reopened = open_db::<1>(path, mmap)?;
    assert_eq!(reopened.meta_info()?.len(), 1);
    for key in 0..KEYS {
        assert_eq!(
            &*reopened.get(0, &key.to_be_bytes())?.unwrap(),
            &3u32.to_be_bytes()
        );
    }
    Ok(())
}
