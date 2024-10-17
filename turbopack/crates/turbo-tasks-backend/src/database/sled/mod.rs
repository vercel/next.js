use std::{borrow::Cow, path::Path};

use anyhow::Result;
use sled::{transaction::ConflictableTransactionResult, IVec, Transactional};

use crate::database::{
    by_key_space::ByKeySpace,
    key_value_database::{KeySpace, KeyValueDatabase, WriteBatch},
};

pub struct SledKeyValueDatabase {
    db: sled::Db,
    trees: ByKeySpace<sled::Tree>,
}

impl SledKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        let db = sled::open(path)?;

        let trees = ByKeySpace::try_new(|key_space| {
            db.open_tree(match key_space {
                KeySpace::Infra => "infra",
                KeySpace::TaskMeta => "task_meta",
                KeySpace::TaskData => "task_data",
                KeySpace::ForwardTaskCache => "forward_task_cache",
                KeySpace::ReverseTaskCache => "reverse_task_cache",
            })
        })?;
        Ok(Self { db, trees })
    }
}

impl KeyValueDatabase for SledKeyValueDatabase {
    type ReadTransaction<'l>
        = ()
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        tx
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(())
    }

    type ValueBuffer<'l>
        = IVec
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        Ok(self.trees.get(key_space).get(key)?)
    }

    type WriteBatch<'l>
        = SledWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(SledWriteBatch {
            batch: ByKeySpace::default(),
            db: &self.db,
            trees: &self.trees,
        })
    }
}

pub struct SledWriteBatch<'a> {
    batch: ByKeySpace<sled::Batch>,
    db: &'a sled::Db,
    trees: &'a ByKeySpace<sled::Tree>,
}

impl<'a> WriteBatch<'a> for SledWriteBatch<'a> {
    type ValueBuffer<'l>
        = IVec
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        Ok(self.trees.get(key_space).get(key)?)
    }

    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        // self.batch
        //     .get_mut(key_space)
        //     .insert(cow_to_ivec(key), cow_to_ivec(value));
        self.trees
            .get(key_space)
            .insert(cow_to_ivec(key), cow_to_ivec(value))?;
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        // self.batch.get_mut(key_space).remove(cow_to_ivec(key));
        self.trees.get(key_space).remove(key)?;
        Ok(())
    }

    fn commit(self) -> Result<()> {
        // Batching won't work as it consumes sooooo much memory
        // match self.trees.values().transaction(
        //     |trees| -> ConflictableTransactionResult<(), anyhow::Error> {
        //         let trees = ByKeySpace::<&_>::from_values(vec_to_array_ref(trees));
        //         for (key_space, batch) in self.batch.iter() {
        //             trees.get(key_space).apply_batch(batch)?;
        //         }
        //         ConflictableTransactionResult::Ok(())
        //     },
        // ) {
        //     Ok(()) => {
        //         self.db.flush()?;
        //         Ok(())
        //     }
        //     Err(sled::transaction::TransactionError::Abort(_)) => unreachable!(),
        //     Err(sled::transaction::TransactionError::Storage(err)) => Err(err.into()),
        // }
        self.db.flush()?;
        Ok(())
    }
}

fn cow_to_ivec(cow: Cow<[u8]>) -> IVec {
    match cow {
        Cow::Borrowed(slice) => IVec::from(slice),
        Cow::Owned(vec) => IVec::from(vec),
    }
}

fn vec_to_array_ref<T, const N: usize>(vec: &Vec<T>) -> [&T; N] {
    let mut i = 0;
    [(); N].map(|_| {
        let v = &vec[i];
        i += 1;
        v
    })
}
