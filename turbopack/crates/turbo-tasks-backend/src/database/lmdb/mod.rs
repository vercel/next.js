use std::{
    cell::UnsafeCell, fs::create_dir_all, marker::PhantomData, mem::transmute, ops::Deref,
    path::Path, sync::Arc, thread::available_parallelism,
};

use anyhow::{Context, Result};
use arc_swap::ArcSwap;
use lmdb::{
    Database, DatabaseFlags, Environment, EnvironmentFlags, RoTransaction, RwTransaction,
    Transaction, WriteFlags,
};
use smallvec::SmallVec;
use thread_local::ThreadLocal;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer},
};

mod extended_key;

type ReadTransactionsCache = ThreadLocal<ThreadLocalReadTransactionsContainer>;

struct SendRoTransaction(RoTransaction<'static>);

impl SendRoTransaction {
    fn into_inner(self) -> RoTransaction<'static> {
        self.0
    }
}

impl Deref for SendRoTransaction {
    type Target = RoTransaction<'static>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Safety: We open LMDB with `EnvironmentFlags::NO_TLS` (see `new()` below), which relaxes
// the default thread-local reader-slot behavior for read-only transactions.
// LMDB docs: https://github.com/mozilla/lmdb/blob/205300e8aec/libraries/liblmdb/lmdb.h#L576-L584
//
// We still do not use a transaction concurrently from multiple threads. This `Send` wrapper only
// allows moving ownership between threads when `ThreadLocal` internals move stored values at drop
// time.
unsafe impl Send for SendRoTransaction {}

struct ThreadLocalReadTransactionsContainer(UnsafeCell<SmallVec<[SendRoTransaction; 4]>>);

impl ThreadLocalReadTransactionsContainer {
    unsafe fn pop(&self) -> Option<RoTransaction<'static>> {
        let vec = unsafe { &mut *self.0.get() };
        vec.pop().map(SendRoTransaction::into_inner)
    }

    unsafe fn push(&self, tx: RoTransaction<'static>) {
        let vec = unsafe { &mut *self.0.get() };
        vec.push(SendRoTransaction(tx))
    }
}

struct LmdbReadTransactionGuardInner {
    tx: Option<SendRoTransaction>,
    // Keep this generation alive so dropped read txs return to the same cache generation.
    thread_locals: Arc<ReadTransactionsCache>,
}

impl Drop for LmdbReadTransactionGuardInner {
    fn drop(&mut self) {
        let container = self
            .thread_locals
            .get_or(|| ThreadLocalReadTransactionsContainer(UnsafeCell::new(Default::default())));
        // Safety: put back into this thread's local cache.
        unsafe {
            container.push(self.tx.take().unwrap().into_inner());
        }
    }
}

#[derive(Clone)]
struct LmdbReadTransactionGuard(Arc<LmdbReadTransactionGuardInner>);

impl LmdbReadTransactionGuard {
    fn transaction(&self) -> &RoTransaction<'static> {
        self.0.tx.as_ref().unwrap()
    }
}

pub struct LmdbValueBuffer<'l> {
    ptr: *const u8,
    len: usize,
    _guard: LmdbReadTransactionGuard,
    _marker: PhantomData<&'l LmbdKeyValueDatabase>,
}

impl<'l> LmdbValueBuffer<'l> {
    fn from_raw_parts(ptr: *const u8, len: usize, guard: LmdbReadTransactionGuard) -> Self {
        Self {
            ptr,
            len,
            _guard: guard,
            _marker: PhantomData,
        }
    }
}

impl AsRef<[u8]> for LmdbValueBuffer<'_> {
    fn as_ref(&self) -> &[u8] {
        // Safety: ptr/len points into LMDB value memory owned by the guarded read transaction.
        // The guard keeps that transaction alive for at least as long as this value buffer.
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

pub struct LmbdKeyValueDatabase {
    // Safety: must be dropped before `env`, as dropping cached transactions accesses LMDB env.
    read_transactions_cache: ArcSwap<ReadTransactionsCache>,
    env: Environment,
    infra_db: Database,
    data_db: Database,
    meta_db: Database,
    task_cache_db: Database,
}

impl LmbdKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        create_dir_all(path).context("Creating database directory failed")?;

        #[cfg(target_arch = "x86")]
        const MAP_SIZE: usize = usize::MAX;
        #[cfg(not(target_arch = "x86"))]
        const MAP_SIZE: usize = 40 * 1024 * 1024 * 1024;

        let env = Environment::new()
            .set_flags(
                EnvironmentFlags::WRITE_MAP
                    | EnvironmentFlags::NO_META_SYNC
                    | EnvironmentFlags::NO_TLS,
            )
            .set_max_readers((available_parallelism().map_or(16, |v| v.get()) * 8) as u32)
            .set_max_dbs(4)
            .set_map_size(MAP_SIZE)
            .open(path)?;
        let infra_db = env.create_db(Some("infra"), DatabaseFlags::INTEGER_KEY)?;
        let data_db = env.create_db(Some("data"), DatabaseFlags::INTEGER_KEY)?;
        let meta_db = env.create_db(Some("meta"), DatabaseFlags::INTEGER_KEY)?;
        let task_cache_db = env.create_db(Some("task_cache"), DatabaseFlags::empty())?;
        Ok(LmbdKeyValueDatabase {
            read_transactions_cache: ArcSwap::new(Arc::new(ThreadLocal::new())),
            env,
            infra_db,
            data_db,
            meta_db,
            task_cache_db,
        })
    }

    fn db(&self, key_space: KeySpace) -> Database {
        match key_space {
            KeySpace::Infra => self.infra_db,
            KeySpace::TaskMeta => self.meta_db,
            KeySpace::TaskData => self.data_db,
            KeySpace::TaskCache => self.task_cache_db,
        }
    }

    fn acquire_read_transaction_guard(&self) -> LmdbReadTransactionGuard {
        let thread_locals = self.read_transactions_cache.load().clone();
        let container = thread_locals
            .get_or(|| ThreadLocalReadTransactionsContainer(UnsafeCell::new(Default::default())));

        // Safety: container is thread-local.
        let tx = if let Some(tx) = unsafe { container.pop() } {
            SendRoTransaction(tx)
        } else {
            let tx = self.env.begin_ro_txn().unwrap_or_else(|err| {
                panic!("failed to begin LMDB read transaction: {err}");
            });
            // Safety: `read_transactions_cache` is dropped before `env`, so cached transactions
            // never outlive the LMDB environment.
            SendRoTransaction(unsafe { transmute::<RoTransaction<'_>, RoTransaction<'static>>(tx) })
        };

        LmdbReadTransactionGuard(Arc::new(LmdbReadTransactionGuardInner {
            tx: Some(tx),
            thread_locals,
        }))
    }

    fn get_from_tx<'tx>(
        tx: &'tx impl Transaction,
        db: Database,
        key: &[u8],
    ) -> Result<Option<&'tx [u8]>> {
        match extended_key::get(tx, db, key) {
            Ok(result) => Ok(Some(result)),
            Err(err) if err == lmdb::Error::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}

impl KeyValueDatabase for LmbdKeyValueDatabase {
    type ValueBuffer<'l> = LmdbValueBuffer<'l>;

    fn get<'l>(
        &'l self,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        let guard = self.acquire_read_transaction_guard();
        let Some((ptr, len)) = ({
            let tx = guard.transaction();
            Self::get_from_tx(tx, self.db(key_space), key)?
                .map(|value| (value.as_ptr(), value.len()))
        }) else {
            return Ok(None);
        };
        Ok(Some(LmdbValueBuffer::from_raw_parts(ptr, len, guard)))
    }

    fn get_multiple<'l>(
        &'l self,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<SmallVec<[Self::ValueBuffer<'l>; 1]>> {
        let guard = self.acquire_read_transaction_guard();
        let Some((ptr, len)) = ({
            let tx = guard.transaction();
            Self::get_from_tx(tx, self.db(key_space), key)?
                .map(|value| (value.as_ptr(), value.len()))
        }) else {
            return Ok(SmallVec::new());
        };
        Ok(SmallVec::from_iter([LmdbValueBuffer::from_raw_parts(
            ptr, len, guard,
        )]))
    }

    fn batch_get<'l>(
        &'l self,
        key_space: KeySpace,
        keys: &[&[u8]],
    ) -> Result<Vec<Option<Self::ValueBuffer<'l>>>> {
        let guard = self.acquire_read_transaction_guard();
        let tx = guard.transaction();
        let db = self.db(key_space);
        keys.iter()
            .map(|key| {
                let value = Self::get_from_tx(tx, db, key)?;
                Ok(value.map(|value| {
                    LmdbValueBuffer::from_raw_parts(value.as_ptr(), value.len(), guard.clone())
                }))
            })
            .collect()
    }

    type SerialWriteBatch<'l>
        = LmbdWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(WriteBatch::serial(LmbdWriteBatch {
            tx: self.env.begin_rw_txn()?,
            this: self,
        }))
    }
}

pub struct LmbdWriteBatch<'l> {
    tx: RwTransaction<'l>,
    this: &'l LmbdKeyValueDatabase,
}

impl<'a> BaseWriteBatch<'a> for LmbdWriteBatch<'a> {
    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        LmbdKeyValueDatabase::get_from_tx(&self.tx, self.this.db(key_space), key)
    }

    fn commit(self) -> Result<()> {
        self.tx.commit()?;
        // Swap generation after commit so new reads don't reuse old read transactions.
        self.this
            .read_transactions_cache
            .store(Arc::new(ThreadLocal::new()));
        Ok(())
    }
}

impl<'a> SerialWriteBatch<'a> for LmbdWriteBatch<'a> {
    fn put(
        &mut self,
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        extended_key::put(
            &mut self.tx,
            self.this.db(key_space),
            &key,
            &value,
            WriteFlags::empty(),
        )?;
        Ok(())
    }

    fn delete(&mut self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        extended_key::delete(
            &mut self.tx,
            self.this.db(key_space),
            &key,
            WriteFlags::empty(),
        )?;
        Ok(())
    }

    fn flush(&mut self, _key_space: KeySpace) -> Result<()> {
        // this is an unimplemented optimization, this LMDB implementation is only used in testing
        Ok(())
    }
}
