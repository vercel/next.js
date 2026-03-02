use std::{cell::UnsafeCell, mem::transmute, sync::Arc};

use anyhow::Result;
use arc_swap::ArcSwap;
use smallvec::SmallVec;
use thread_local::ThreadLocal;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{
        BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer,
    },
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

/// Caches read transactions in thread-local storage to avoid creating new ones for every operation.
///
/// # Safety invariant (field ordering)
///
/// `read_transactions_cache` must be declared before `database` so that Rust's field drop order
/// (declaration order) drops the cached transactions before the database. The cached transactions
/// store `T::ReadTransaction<'static>` where the `'static` is a transmuted lie — the true
/// lifetime is tied to `database`. Dropping the cache first ensures all transactions are released
/// before the database they borrow from.
pub struct ReadTransactionCache<T: KeyValueDatabase + 'static> {
    // Safety: Must be declared before `database` — see struct-level safety invariant above.
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
        key_space: KeySpace,
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
        // Safety: We cast to 'static because the thread-local cache stores transactions
        // with an erased lifetime. The transaction will be cast back to the database's
        // actual lifetime when popped in `begin_read_transaction`. This is sound because
        // `ReadTransactionCache` declares `read_transactions_cache` before `database`,
        // so Rust drops the cache (releasing all stored transactions) before the database.
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

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
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
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }
    fn delete(&mut self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }

    fn flush(&mut self, key_space: KeySpace) -> Result<()> {
        self.write_batch.flush(key_space)
    }
}

impl<'a, T: KeyValueDatabase, B: ConcurrentWriteBatch<'a>> ConcurrentWriteBatch<'a>
    for ReadTransactionCacheWriteBatch<'a, T, B>
{
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }
    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }

    unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
        unsafe { self.write_batch.flush(key_space) }
    }
}
