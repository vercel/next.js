use std::time::Instant;

use anyhow::Result;
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use crate::{db::TurboPersistence, write_batch::WriteBatch};

#[test]
fn full_cycle() -> Result<()> {
    let mut test_cases = Vec::new();
    fn test_case(
        test_cases: &mut Vec<(
            &'static str,
            Box<dyn Fn(&mut WriteBatch<Vec<u8>>) -> Result<()>>,
            Box<dyn Fn(&TurboPersistence) -> Result<()>>,
        )>,
        name: &'static str,
        write: impl Fn(&mut WriteBatch<Vec<u8>>) -> Result<()> + 'static,
        read: impl Fn(&TurboPersistence) -> Result<()> + 'static,
    ) {
        test_cases.push((
            name,
            Box::new(write) as Box<dyn Fn(&mut WriteBatch<Vec<u8>>) -> Result<()>>,
            Box::new(read) as Box<dyn Fn(&TurboPersistence) -> Result<()>>,
        ));
    }

    test_case(
        &mut test_cases,
        "Simple",
        |batch| {
            for i in 10..100u8 {
                batch.put(vec![i], vec![i].into())?;
            }
            Ok(())
        },
        |db| {
            let Some(value) = db.get(&[42u8])? else {
                panic!("Value not found");
            };
            assert_eq!(&*value, &[42]);
            assert!(db.get(&[42u8, 42])?.is_none());
            assert!(db.get(&[0u8])?.is_none());
            assert!(db.get(&[255u8])?.is_none());
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many items",
        |batch| {
            for i in 0..1000 * 1024u32 {
                batch.put(i.to_be_bytes().into(), i.to_be_bytes().to_vec().into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..1000 * 1024u32 {
                let Some(value) = db.get(&i.to_be_bytes())? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &i.to_be_bytes());
            }
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Many items (multi-threaded)",
        |batch| {
            (0..1024 * 1024u32).into_par_iter().for_each(|i| {
                batch
                    .put(i.to_be_bytes().into(), i.to_be_bytes().to_vec().into())
                    .unwrap();
            });
            Ok(())
        },
        |db| {
            (0..1024 * 1024u32).into_par_iter().for_each(|i| {
                let Some(value) = db.get(&i.to_be_bytes()).unwrap() else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &i.to_be_bytes());
            });
            Ok(())
        },
    );

    test_case(
        &mut test_cases,
        "Big keys and values",
        |batch| {
            for i in 0..200u8 {
                batch.put(vec![i; 10 * 1024], vec![i; 100 * 1024].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..200u8 {
                let Some(value) = db.get(&vec![i; 10 * 1024])? else {
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
            for i in 0..200u8 {
                batch.put(vec![i; 1024], vec![i; 10 * 1024 * 1024].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 0..200u8 {
                let Some(value) = db.get(&vec![i; 1024])? else {
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
                batch.put(vec![i; i as usize], vec![i; i as usize].into())?;
            }
            Ok(())
        },
        |db| {
            for i in 100..200u8 {
                let Some(value) = db.get(&vec![i; i as usize])? else {
                    panic!("Value not found");
                };
                assert_eq!(&*value, &vec![i; i as usize]);
            }
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

            let start = Instant::now();
            for (_, _, read) in test_cases.iter() {
                read(&db)?;
            }
            println!("All read time: {:?}", start.elapsed());
        }
        {
            let start = Instant::now();
            let db = TurboPersistence::open(path.to_path_buf())?;
            println!("All restore time: {:?}", start.elapsed());
            for (_, _, read) in test_cases.iter() {
                let start = Instant::now();
                read(&db)?;
                println!("All read time after restore: {:?}", start.elapsed());
            }
        }
    }
    Ok(())
}
