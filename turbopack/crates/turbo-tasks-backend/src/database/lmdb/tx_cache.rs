use std::{
    mem::transmute,
    ops::Deref,
    sync::{
        Arc, Mutex, PoisonError, RwLock, RwLockWriteGuard,
        atomic::{AtomicU64, Ordering},
        mpsc::{Receiver, SyncSender, sync_channel},
    },
};

use lmdb::{Environment, RoTransaction};

pub struct SendRoTransaction<'tx> {
    tx: RoTransaction<'tx>,
    generation: u64,
}

impl<'tx> Deref for SendRoTransaction<'tx> {
    type Target = RoTransaction<'tx>;

    fn deref(&self) -> &Self::Target {
        &self.tx
    }
}

// Safety: We open LMDB with `EnvironmentFlags::NO_TLS` (see `LmbdKeyValueDatabase::new`), which
// relaxes the default thread-local reader-slot behavior for read-only transactions.
// LMDB docs: https://github.com/mozilla/lmdb/blob/205300e8aec/libraries/liblmdb/lmdb.h#L576-L584
//
// We still do not use a transaction concurrently from multiple threads. This `Send` wrapper only
// allows moving ownership between threads when queue internals move transactions across threads.
unsafe impl<'tx> Send for SendRoTransaction<'tx> {}

struct QueueState {
    sender: SyncSender<SendRoTransaction<'static>>,
    receiver: Arc<Mutex<Receiver<SendRoTransaction<'static>>>>,
}

impl QueueState {
    fn new(env: &Environment, capacity: usize, generation: u64) -> Self {
        let (sender, receiver) = sync_channel(capacity);
        for _ in 0..capacity {
            let tx = env.begin_ro_txn().unwrap_or_else(|err| {
                panic!("failed to begin LMDB read transaction: {err}");
            });
            // Safety: these cached transactions are owned by `TxCache`, which is dropped
            // before the LMDB environment field in the parent database type.
            let tx = unsafe { transmute::<RoTransaction<'_>, RoTransaction<'static>>(tx) };
            sender
                .send(SendRoTransaction { tx, generation })
                .unwrap_or_else(|err| panic!("failed to seed LMDB read transaction queue: {err}"));
        }

        Self {
            sender,
            receiver: Arc::new(Mutex::new(receiver)),
        }
    }
}

struct ReadTxGuardInner<'db> {
    lease: Option<SendRoTransaction<'db>>,
    sender: SyncSender<SendRoTransaction<'static>>,
    generation: &'db AtomicU64,
}

impl Drop for ReadTxGuardInner<'_> {
    fn drop(&mut self) {
        let Some(lease) = self.lease.take() else {
            return;
        };
        if lease.generation != self.generation.load(Ordering::Acquire) {
            return;
        }

        // Safety: `lease` came from a `'static` transaction in the queue. We only narrow the
        // lifetime while leased and restore it before returning to the shared queue.
        let lease =
            unsafe { transmute::<SendRoTransaction<'_>, SendRoTransaction<'static>>(lease) };
        let _ = self.sender.send(lease);
    }
}

#[derive(Clone)]
pub struct ReadTxGuard<'db> {
    inner: Arc<ReadTxGuardInner<'db>>,
}

impl<'db> Deref for ReadTxGuard<'db> {
    type Target = SendRoTransaction<'db>;

    fn deref(&self) -> &Self::Target {
        self.inner
            .lease
            .as_ref()
            .expect("read transaction lease is always present")
    }
}

pub struct WriteTxGuard<'db> {
    env: &'db Environment,
    generation: u64,
    capacity: usize,
    queue: Option<RwLockWriteGuard<'db, QueueState>>,
}

impl WriteTxGuard<'_> {
    fn rebuild_queue(&mut self) {
        if let Some(queue) = self.queue.as_mut() {
            **queue = QueueState::new(self.env, self.capacity, self.generation);
        }
    }

    pub fn commit(mut self) {
        self.rebuild_queue();
        self.queue = None;
    }
}

impl Drop for WriteTxGuard<'_> {
    fn drop(&mut self) {
        if self.queue.is_some() {
            self.rebuild_queue();
        }
    }
}

pub struct TxCache {
    generation: AtomicU64,
    queue: RwLock<QueueState>,
    capacity: usize,
}

impl TxCache {
    pub fn new(env: &Environment, capacity: usize) -> Self {
        Self {
            generation: AtomicU64::new(0),
            queue: RwLock::new(QueueState::new(env, capacity, 0)),
            capacity,
        }
    }

    pub fn begin_write<'db>(&'db self, env: &'db Environment) -> WriteTxGuard<'db> {
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        let queue = self.queue.write().unwrap_or_else(PoisonError::into_inner);
        WriteTxGuard {
            env,
            generation,
            capacity: self.capacity,
            queue: Some(queue),
        }
    }

    /// NOTE: Callers should avoid acquiring multiple guards at once. If a single thread tries to
    /// acquire more than `capacity` read transactions, it could deadlock.
    pub fn get_read_tx<'db>(&'db self) -> ReadTxGuard<'db> {
        loop {
            let (sender, receiver) = {
                let queue = self.queue.read().unwrap_or_else(PoisonError::into_inner);
                (queue.sender.clone(), Arc::clone(&queue.receiver))
            };

            let lease = {
                let receiver = receiver.lock().unwrap_or_else(PoisonError::into_inner);
                match receiver.recv() {
                    Ok(lease) => lease,
                    Err(_) => continue,
                }
            };

            if lease.generation != self.generation.load(Ordering::Acquire) {
                continue;
            }

            // Safety: all leases come from queue-owned `'static` transactions. We narrow to `'db`
            // for the borrowed lease lifetime held by `ReadTxGuard`.
            let lease =
                unsafe { transmute::<SendRoTransaction<'static>, SendRoTransaction<'db>>(lease) };

            return ReadTxGuard {
                inner: Arc::new(ReadTxGuardInner {
                    lease: Some(lease),
                    sender,
                    generation: &self.generation,
                }),
            };
        }
    }
}
