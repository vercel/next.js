use std::{marker::PhantomData, mem::transmute, ops::Deref, sync::Arc};

use arc_swap::ArcSwap;
use lmdb::{Environment, RoTransaction};
use thread_local::ThreadLocal;

type ReadTransactionsCache = ThreadLocal<SendRoTransaction>;

struct SendRoTransaction(RoTransaction<'static>);

impl Deref for SendRoTransaction {
    type Target = RoTransaction<'static>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Safety: We open LMDB with `EnvironmentFlags::NO_TLS` (see `LmbdKeyValueDatabase::new`), which
// relaxes the default thread-local reader-slot behavior for read-only transactions.
// LMDB docs: https://github.com/mozilla/lmdb/blob/205300e8aec/libraries/liblmdb/lmdb.h#L576-L584
//
// We still do not use a transaction concurrently from multiple threads. This `Send` wrapper only
// allows moving ownership between threads when `ThreadLocal` internals move stored values at drop
// time.
unsafe impl Send for SendRoTransaction {}

#[derive(Clone)]
pub struct ReadTxGuard<'db> {
    // Keep this generation alive so the borrowed read transaction (and value pointers from it)
    // remain valid until all value buffers/guards from that generation are dropped.
    _thread_locals: Arc<ReadTransactionsCache>,
    _marker: PhantomData<&'db Environment>,
}

pub struct ReadTxCache {
    // Safety: must be dropped before LMDB `Environment`, as dropping cached transactions touches
    // LMDB internals tied to the environment.
    read_transactions_cache: ArcSwap<ReadTransactionsCache>,
}

impl ReadTxCache {
    pub fn new() -> Self {
        Self {
            read_transactions_cache: ArcSwap::new(Arc::new(ThreadLocal::new())),
        }
    }

    pub fn with_read_tx<'db, R>(
        &'db self,
        env: &'db Environment,
        f: impl FnOnce(&'db RoTransaction<'db>, ReadTxGuard<'db>) -> R,
    ) -> R {
        let thread_locals = self.read_transactions_cache.load().clone();
        let guard_thread_locals = thread_locals.clone();
        let tx_static = thread_locals.get_or(|| {
            let tx = env.begin_ro_txn().unwrap_or_else(|err| {
                panic!("failed to begin LMDB read transaction: {err}");
            });
            // Safety: `read_transactions_cache` is dropped before the environment field.
            SendRoTransaction(unsafe { transmute::<RoTransaction<'_>, RoTransaction<'static>>(tx) })
        });
        // Safety: `tx_static` always originates from `env` and `ReadTxCache` is dropped before
        // the environment in the parent database type. We narrow the externally-visible lifetime
        // to `'db` so callers cannot observe or depend on `'static`.
        let tx: &'db RoTransaction<'db> =
            unsafe { transmute::<&RoTransaction<'static>, &'db RoTransaction<'db>>(tx_static) };

        let guard = ReadTxGuard {
            _thread_locals: guard_thread_locals,
            _marker: PhantomData,
        };
        f(tx, guard)
    }

    pub fn swap_generation(&self) {
        self.read_transactions_cache
            .store(Arc::new(ThreadLocal::new()));
    }
}
