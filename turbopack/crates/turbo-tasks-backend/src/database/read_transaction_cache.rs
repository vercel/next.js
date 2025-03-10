use std::{cell::UnsafeCell, mem::transmute, sync::Arc};

use anyhow::Result;
use arc_swap::ArcSwap;
use smallvec::SmallVec;
use thread_local::ThreadLocal;

use crate::database::{
    key_value_database::KeyValueDatabase,
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch},
};

struct ThreadLocalReadTransactionsContainer<T: KeyValueDatabase + 'static>(
    UnsafeCell<SmallVec<[T::ReadTransaction<'static>; 4]>>,
);

impl<T: KeyValueDatabase> ThreadLocalReadTransactionsContainer<T> {
    unsafe fn pop(&self) -> Option<T::ReadTransaction<'static>> {
        let vec = unsafe { &mut *self.0.get() };
        vec.pop()
    }

    unsafe fn push(&self, tx: T::ReadTransaction<'static>) {
        let vec = unsafe { &mut *self.0.get() };
        vec.push(tx)
    }
}

// Safety: It's safe to send RoTransaction between threads, but the types don't allow that.
unsafe impl<T: KeyValueDatabase> Send for ThreadLocalReadTransactionsContainer<T> {}

pub struct ReadTransactionCache<T: KeyValueDatabase + 'static> {
    // Safety: `read_transactions_cache` need to be dropped before `database` since it will end the
    // transactions.
    read_transactions_cache: ArcSwap<ThreadLocal<ThreadLocalReadTransactionsContainer<T>>>,
    database: T,
}

impl<T: KeyValueDatabase + 'static> ReadTransactionCache<T> {
    pub fn new(database: T) -> Self {
        Self {
            read_transactions_cache: ArcSwap::new(Arc::new(ThreadLocal::new())),
            database,
        }
    }
}

impl<T: KeyValueDatabase + 'static> KeyValueDatabase for ReadTransactionCache<T> {
    type ReadTransaction<'l>
        = CachedReadTransaction<'l, T>
    where
        T: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        // Safety: When T compiles fine and lower_read_transaction is implemented correctly this is
        // safe to do.
        unsafe { transmute::<&'r Self::ReadTransaction<'l>, &'r Self::ReadTransaction<'i>>(tx) }
    }

    fn is_empty(&self) -> bool {
        self.database.is_empty()
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        let guard = self.read_transactions_cache.load();
        let container = guard
            .get_or(|| ThreadLocalReadTransactionsContainer(UnsafeCell::new(Default::default())));
        // Safety: Since it's a thread local it's safe to take from the container
        let tx = if let Some(tx) = unsafe { container.pop() } {
            unsafe { transmute::<T::ReadTransaction<'static>, T::ReadTransaction<'_>>(tx) }
        } else {
            self.database.begin_read_transaction()?
        };

        let thread_locals = guard.clone();
        Ok(CachedReadTransaction::<T> {
            tx: Some(tx),
            thread_locals,
        })
    }

    type ValueBuffer<'l> = T::ValueBuffer<'l>;

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> anyhow::Result<Option<Self::ValueBuffer<'l>>> {
        self.database
            .get(transaction.tx.as_ref().unwrap(), key_space, key)
    }

    type SerialWriteBatch<'l> = ReadTransactionCacheWriteBatch<'l, T, T::SerialWriteBatch<'l>>;

    type ConcurrentWriteBatch<'l> =
        ReadTransactionCacheWriteBatch<'l, T, T::ConcurrentWriteBatch<'l>>;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(match self.database.write_batch()? {
            WriteBatch::Serial(write_batch) => WriteBatch::serial(ReadTransactionCacheWriteBatch {
                write_batch,
                read_transactions_cache: &self.read_transactions_cache,
            }),
            WriteBatch::Concurrent(write_batch, _) => {
                WriteBatch::concurrent(ReadTransactionCacheWriteBatch {
                    write_batch,
                    read_transactions_cache: &self.read_transactions_cache,
                })
            }
        })
    }
}

pub struct CachedReadTransaction<'l, T: KeyValueDatabase + 'static> {
    tx: Option<T::ReadTransaction<'l>>,
    thread_locals: Arc<ThreadLocal<ThreadLocalReadTransactionsContainer<T>>>,
}

impl<T: KeyValueDatabase> Drop for CachedReadTransaction<'_, T> {
    fn drop(&mut self) {
        let container = self
            .thread_locals
            .get_or(|| ThreadLocalReadTransactionsContainer(UnsafeCell::new(Default::default())));
        // Safety: We cast it to 'static lifetime, but it will be casted back to 'env when
        // taken. It's safe since this will not outlive the environment. We need to
        // be careful with Drop, but `read_transactions_cache` is before `env` in the
        // LmdbBackingStorage struct, so it's fine.
        let tx = unsafe {
            transmute::<T::ReadTransaction<'_>, T::ReadTransaction<'static>>(
                self.tx.take().unwrap(),
            )
        };
        // Safety: It's safe to put it back since it's a thread local
        unsafe {
            container.push(tx);
        }
    }
}

pub struct ReadTransactionCacheWriteBatch<'l, T: KeyValueDatabase + 'static, B> {
    write_batch: B,
    read_transactions_cache: &'l ArcSwap<ThreadLocal<ThreadLocalReadTransactionsContainer<T>>>,
}

impl<'a, T: KeyValueDatabase + 'static, B: BaseWriteBatch<'a>> BaseWriteBatch<'a>
    for ReadTransactionCacheWriteBatch<'a, T, B>
{
    fn commit(self) -> anyhow::Result<()> {
        self.write_batch.commit()?;
        let _span = tracing::trace_span!("swap read transactions").entered();
        // This resets the thread local storage for read transactions, read transactions are
        // eventually dropped, allowing DB to free up unused storage.
        self.read_transactions_cache
            .store(Arc::new(ThreadLocal::new()));
        Ok(())
    }

    type ValueBuffer<'l>
        = B::ValueBuffer<'l>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(
        &'l self,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.write_batch.get(key_space, key)
    }
}

impl<'a, T: KeyValueDatabase, B: SerialWriteBatch<'a>> SerialWriteBatch<'a>
    for ReadTransactionCacheWriteBatch<'a, T, B>
{
    fn put(
        &mut self,
        key_space: super::key_value_database::KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }
    fn delete(
        &mut self,
        key_space: super::key_value_database::KeySpace,
        key: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }
}

impl<'a, T: KeyValueDatabase, B: ConcurrentWriteBatch<'a>> ConcurrentWriteBatch<'a>
    for ReadTransactionCacheWriteBatch<'a, T, B>
{
    fn put(
        &self,
        key_space: super::key_value_database::KeySpace,
        key: std::borrow::Cow<[u8]>,
        value: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }
    fn delete(
        &self,
        key_space: super::key_value_database::KeySpace,
        key: std::borrow::Cow<[u8]>,
    ) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }
}
