use std::time::Instant;

use anyhow::Result;
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use crate::{db::TurboPersistence, write_batch::WriteBatch};

#[test]
fn full_cycle() -> Result<()> {
    let mut test_cases = Vec::new();
    type TestCases = Vec<(
        &'static str,
        Box<dyn Fn(&mut WriteBatch<Vec<u8>, 16>) -> Result<()>>,
        Box<dyn Fn(&TurboPersistence) -> Result<()>>,
    )>;

    fn test_case(
        test_cases: &mut TestCases,
        name: &'static str,
        write: impl Fn(&mut WriteBatch<Vec<u8>, 16>) -> Result<()> + 'static,
        read: impl Fn(&TurboPersistence) -> Result<()> + 'static,
    ) {
        test_cases.push((
            name,
            Box::new(write) as Box<dyn Fn(&mut WriteBatch<Vec<u8>, 16>) -> Result<()>>,
            Box::new(read) as Box<dyn Fn(&TurboPersistence) -> Result<()>>,
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
        "Families",
        |batch| {
            for i in 0..16u8 {
                batch.put(i as usize, vec![i], vec![i].into())?;
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

    test_case(
        &mut test_cases,
        "Large keys and values (blob files)",
        |batch| {
            for i in 0..20u8 {
                batch.put(
                    0,
                    vec![i; 10 * 1024 * 1024],
                    vec![i; 10 * 1024 * 1024].into(),
                )?;
            }
            Ok(())
        },
        |db| {
            for i in 0..20u8 {
                let Some(value) = db.get(0, &vec![i; 10 * 1024 * 1024])? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &vec![i; 10 * 1024 * 1024]);
            }
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Different sizes keys and values",
        |batch| {
            for i in 100..200u8 {
                batch.put(0, vec![i; i as usize], vec![i; i as usize].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 100..200u8 {
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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
            let db = TurboPersistence::open(path.to_path_buf())?;
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

    fn put(b: &WriteBatch<(u8, [u8; 4]), 1>, key: u8, value: u8) -> Result<()> {
        for i in 0..2000000u32 {
            b.put(0, (key, i.to_be_bytes()), vec![value].into())?;
        }
        Ok(())
    }
    fn check(db: &TurboPersistence, key: u8, value: u8) -> Result<()> {
        for i in 0..200000u32 {
            let i = i * 10;
            assert_eq!(
                db.get(0, &(key, i.to_be_bytes()))?.as_deref(),
                Some(&[value][..])
            );
        }
        Ok(())
    }

    {
        let db = TurboPersistence::open(path.to_path_buf())?;
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
        let db = TurboPersistence::open(path.to_path_buf())?;
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
        let db = TurboPersistence::open(path.to_path_buf())?;
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
        let db = TurboPersistence::open(path.to_path_buf())?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = TurboPersistence::open(path.to_path_buf())?;

        db.compact(1.0, 3)?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    println!("---");
    {
        let db = TurboPersistence::open(path.to_path_buf())?;

        check(&db, 1, 13)?;
        check(&db, 2, 22)?;
        check(&db, 3, 31)?;

        db.shutdown()?;
    }

    Ok(())
}
