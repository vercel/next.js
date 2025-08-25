use std::{fs, time::Instant};

use anyhow::Result;
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use crate::{
    constants::MAX_MEDIUM_VALUE_SIZE,
    db::{CompactConfig, TurboPersistence},
    parallel_scheduler::ParallelScheduler,
    write_batch::WriteBatch,
};

#[derive(Clone, Copy)]
struct RayonParallelScheduler;

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

#[test]
fn full_cycle() -> Result<()> {
    let mut test_cases = Vec::new();
    type TestCases = Vec<(
        &'static str,
        Box<dyn Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()>>,
        Box<dyn Fn(&TurboPersistence<RayonParallelScheduler>) -> Result<()>>,
    )>;

    fn test_case(
        test_cases: &mut TestCases,
        name: &'static str,
        write: impl Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()> + 'static,
        read: impl Fn(&TurboPersistence<RayonParallelScheduler>) -> Result<()> + 'static,
    ) {
        test_cases.push((
            name,
            Box::new(write)
                as Box<dyn Fn(&mut WriteBatch<Vec<u8>, RayonParallelScheduler, 16>) -> Result<()>>,
            Box::new(read) as Box<dyn Fn(&TurboPersistence<RayonParallelScheduler>) -> Result<()>>,
        ));
    }

    test_case(
        &mut test_cases,
        "Simple",
        |batch| {
            for i in 10..100u8 {
                batch.put(0, vec![i], vec![i].into())?;
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(0, &[42u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[42]);
            assert_eq!(db.get(0, &[42u8, 42])?, None);
            assert_eq!(db.get(0, &[1u8])?, None);
            assert_eq!(db.get(0, &[255u8])?, None);
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many SST files",
        |batch| {
            for i in 10..100u8 {
                batch.put(0, vec![i], vec![i].into())?;
                unsafe { batch.flush(0)? };
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(0, &[42u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[42]);
            assert_eq!(db.get(0, &[42u8, 42])?, None);
            assert_eq!(db.get(0, &[1u8])?, None);
            assert_eq!(db.get(0, &[255u8])?, None);
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
                batch.put(0, vec![i; 10 * 1024], vec![i; 100 * 1024].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..200u8 {
                let Some(value) = db.get(0, &vec![i; 10 * 1024])? else {
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
                batch.put(0, vec![i; BLOB_SIZE], vec![i; BLOB_SIZE].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..2u8 {
                let key_and_value = vec![i; BLOB_SIZE];
                let Some(value) = db.get(0, &key_and_value)? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &key_and_value);
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
                batch.put(0, vec![i; i as usize], vec![i; i as usize].into())?;
            }
            Ok(())
        },
        |db| {
            for i in different_sizes_range() {
                let Some(value) = db.get(0, &vec![i; i as usize])? else {
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
                batch.put(0, i.to_be_bytes().into(), i.to_be_bytes().to_vec().into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..10 * 1024u32 {
                let i = i * 100;
                let Some(value) = db.get(0, &i.to_be_bytes())? else {
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
                batch
                    .put(0, i.to_be_bytes().into(), i.to_be_bytes().to_vec().into())
                    .unwrap();
            });
            Ok(())
        },
        |db| {
            (0..100 * 1024u32).into_par_iter().for_each(|i| {
                let i = i * 100;
                let Some(value) = db.get(0, &i.to_be_bytes()).unwrap() else {
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
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

#[test]
fn persist_changes() -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(
        b: &WriteBatch<(u8, [u8; 4]), RayonParallelScheduler, 1>,
        key: u8,
        value: u8,
    ) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(0, (key, i.to_be_bytes()), vec![value].into())?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler>, key: u8, value: u8) -> Result<()> {
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
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;
        let b = db.write_batch::<_, 1>()?;
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
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;
        let b = db.write_batch::<_, 1>()?;
        put(&b, 1, 12)?;
        put(&b, 2, 22)?;
        db.commit_write_batch(b)?;

        check(&db, 1, 12)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    {
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;
        let b = db.write_batch::<_, 1>()?;
        put(&b, 1, 13)?;
        db.commit_write_batch(b)?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;

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
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    Ok(())
}

#[test]
fn partial_compaction() -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(
        b: &WriteBatch<(u8, [u8; 4]), RayonParallelScheduler, 1>,
        key: u8,
        value: u8,
    ) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(0, (key, i.to_be_bytes()), vec![value].into())?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler>, key: u8, value: u8) -> Result<()> {
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
            let b = db.write_batch::<_, 1>()?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;

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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;

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

#[test]
fn merge_file_removal() -> Result<()> {
    let tempdir = tempfile::tempdir()?;
    let path = tempdir.path();

    let _ = fs::remove_dir_all(path);

    const READ_COUNT: u32 = 2_000; // we'll read every 10th value, so writes are 10x this value
    fn put(
        b: &WriteBatch<(u8, [u8; 4]), RayonParallelScheduler, 1>,
        key: u8,
        value: u32,
    ) -> Result<()> {
        for i in 0..(READ_COUNT * 10) {
            b.put(
                0,
                (key, i.to_be_bytes()),
                value.to_be_bytes().to_vec().into(),
            )?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence<RayonParallelScheduler>, key: u8, value: u32) -> Result<()> {
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
        let db = TurboPersistence::open_with_parallel_scheduler(
            path.to_path_buf(),
            RayonParallelScheduler,
        )?;
        let b = db.write_batch::<_, 1>()?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;
            let b = db.write_batch::<_, 1>()?;
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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;

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
            let db = TurboPersistence::open_with_parallel_scheduler(
                path.to_path_buf(),
                RayonParallelScheduler,
            )?;

            for j in 0..32 {
                check(&db, j, expected_values[j as usize])?;
            }

            db.shutdown()?;
        }
    }

    Ok(())
}
