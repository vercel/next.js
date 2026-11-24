//! A concurrent priority queue for many threads that push and pop a lot:
//! [`ConcurrentPriorityQueue`].
//!
//! The queue is a set of [`SHARD_COUNT`] mutex-protected shards plus one shared atomic state word.
//! A thread sticks to one shard, its *home* (a thread-local index), so in the common case pushes
//! and pops of different threads take different, uncontended locks. Threads that run out of work
//! at the highest priority steal half of another shard's items at that priority.
//!
//! # Shards
//!
//! A shard maps each priority it contains to the items queued with it (a `Vec`), and keeps a heap
//! of these priorities (one heap entry per distinct priority, not per item). Items with the same
//! priority are popped in LIFO order *within a shard* (the newest first, which keeps recently
//! queued work hot); across shards there is no order among equal priorities.
//!
//! Next to its lock, every shard publishes its *top* in an atomic (`0` when empty, else the top
//! priority's rank plus one). It is written under the shard's lock whenever the top changes, so a
//! search can read all shards' tops without locking them (see "Races considered" for how these
//! stores are ordered with the state word).
//!
//! A shard's buffers are allocated up front when the queue is created, and the `Vec` of a priority
//! that runs empty is kept as a spare for the next new priority (if it is larger than the current
//! spare). A thread that keeps pushing and popping the same priority therefore doesn't allocate,
//! and the shards' buffers are less likely to share cache lines with small allocations of other
//! threads.
//!
//! # Home shards and steal pressure
//!
//! Every shard counts its *steal pressure*, a heuristic for how much other threads use it compared
//! to the threads whose home it is. It doesn't track which threads call the shard home.
//! - A steal from the shard adds `1`. So does a push (or a nonempty `push_many`) to it or a pop
//!   from it by a thread whose home it is *not*.
//! - Such a push or pop by a thread whose home it is halves it.
//! - A thread that makes it its home (see below) resets it to `0`.
//!
//! A high value (at least `STEAL_PRESSURE_THRESHOLD`) means other threads used the shard many times
//! since a thread whose home it is last did, e.g. because that thread is busy elsewhere or moved
//! its home away. A thread that keeps using its home shard keeps its pressure low: each of its uses
//! halves it.
//!
//! - A pop locks its home shard. If that is busy, it tries shards whose bit is set in the state
//!   word (they may have items at `highest`; the pop revalidates under the lock), and blocks on its
//!   home shard after a bounded number of attempts.
//! - A push locks its home shard. If that is busy, it tries other shards, and blocks on its home
//!   shard after a bounded number of attempts.
//! - A thread that uses a shard other than its home for a push or pop only moves its home there
//!   when that shard has high steal pressure, and then resets it.
//! - Instead of stealing from a victim with high steal pressure, a thread moves its home to the
//!   victim, resets its steal pressure and pops from it directly: the shard's home threads have
//!   probably stopped using it, so the thief takes it over instead of moving half of it again and
//!   again. The reset makes the next thief steal from the shard instead of also taking it over.
//!
//! # The state word
//!
//! `state` is an `AtomicU64` made of:
//! - `highest` (bits 32..64): the [`QueuePriority::rank`] of the highest queued priority. While a
//!   search is in progress it is the maximum rank pushed during the search (starting at `0`);
//! - `SEARCHING` (bit 31): set while the holder of the search lock looks for the new highest
//!   priority;
//! - 31 shard bits (bits 0..31), one per shard.
//!
//! Ranks are monotone but not strictly so (see [`QueuePriority`]): shards order by the full
//! priority, the state word only by rank. "A shard has `highest`" means the shard is not empty and
//! the top of its heap has `rank == highest` (an empty shard never has `highest`, not even `0`).
//!
//! ## Invariants
//!
//! - **I1 (no hidden higher work):** while `SEARCHING` is clear, no shard's top priority has a rank
//!   above `highest`. Pushes raise `highest` while still holding the shard lock, and a search only
//!   finishes with the maximum of all shards' tops (see below).
//! - **I2 (superset bits):** while `SEARCHING` is clear, every shard that has `highest` has its bit
//!   set. A bit may be set spuriously (the shard doesn't have `highest`); any thread that holds
//!   that shard's lock and sees it doesn't have `highest` may clear it. A pop that empties a shard
//!   whose items were last added by pushes leaves the bit set on purpose: the shard's thread
//!   usually pushes the same rank again soon, and then neither the pop nor the push writes the
//!   state word. A shard last filled by a steal clears its bit when it runs empty, so other thieves
//!   don't keep trying it.
//! - **I3 (search):** while `SEARCHING` is set, a set bit means the shard was pushed to during the
//!   search, and `highest` is the maximum of those pushes' ranks.
//! - **I4 (empty):** `state == 0` (not searching, `highest == 0`, no bits) means the queue is
//!   empty: by I2 no shard has rank `0`, and by I1 none has more. Rank `0` is the lowest rank, so
//!   draining it reaches the empty state by clearing the last (possibly lazily kept) bits, without
//!   a search. `pop` only returns `None` in this state.
//! - **I5 (locks):** a shard bit is only *cleared* by a thread holding that shard's lock (or by a
//!   transition that discards all bits: raising `highest`, starting a search). Items moved by a
//!   steal are never outside a locked shard. At most two shard locks are held at once, and the
//!   second one is only ever taken with `try_lock`, so shard locks can't deadlock. No other lock is
//!   taken while holding a shard lock: the search lock is only taken by threads that hold no shard
//!   lock, and its holder takes no shard lock.
//! - **I6 (one search at a time):** only the holder of the search lock sets or clears `SEARCHING`,
//!   and it does both (start and finish) before it releases the lock.
//!
//! ## Transitions
//!
//! Transitions are CAS loops on `state`. All but the search's decide only from the current word
//! and from shards whose lock the thread holds, so a word that changes and changes back (ABA) can't
//! make those decisions wrong. The search decides from unlocked reads of the published tops, which
//! is why searches are serialized (see "ABA across searches" below).
//!
//! - **Push** to shard `i` (holding its lock, after inserting) publishes the shard's new top rank
//!   `r`:
//!   - not searching, `r > highest`: `(r, only bit i)`. The old bits refer to a lower priority and
//!     are dropped (I2 holds for the new `highest`: only shard `i` can have it, by I1).
//!   - not searching, `r == highest`: set bit `i`.
//!   - not searching, `r < highest`: no write.
//!   - searching: max `r` into `highest` and set bit `i` (I3); the search merges it when it
//!     finishes.
//! - **Pop** from shard `i` (holding its lock): re-read `state` under the lock and only pop if the
//!   shard has `highest` ("peek first"), or has a rank this pop verified (see the ordering
//!   guarantee). If the shard no longer has `highest` afterwards, clear bit `i` (only if `highest`
//!   is unchanged and not searching), except when the shard is empty and was last filled by pushes:
//!   then keep the bit (I2). If the shard has neither, clear bit `i` and steal.
//! - **Steal:** if shard `i` doesn't have `highest`, keep holding its lock and `try_lock` a shard
//!   `j` whose bit is set. If `j` has `highest`, move half (rounded up) of its items at that
//!   priority, the newest ones, to shard `i`, publish `i`, then clear bit `j` if `j` no longer has
//!   `highest`. If `j` has high steal pressure, pop from `j` instead (like a pop from `j`, with the
//!   same bit maintenance), make `j` the thread's home and reset its steal pressure. If `j` doesn't
//!   have `highest`, clear its spurious bit.
//! - **Search:** a pop that sees `(highest > 0, not searching, bits == 0)` takes the search lock
//!   and re-reads the word. If it still needs a search, the holder:
//!   1. starts it: `(highest, 0, 0)` → `(0, SEARCHING, 0)`. By I2 no shard has `highest` any more,
//!      and by I1 none has more, so `highest` is stale. (With `highest == 0` and no bits the queue
//!      is empty instead, I4.)
//!   2. reads every shard's published top without locking: `found` is their maximum rank, and
//!      `found_bits` the shards whose top has it;
//!   3. finishes it with a CAS loop on the current word `S = (h, SEARCHING, bits)`: → `(max(h,
//!      found), not searching, found_bits ∪ bits)`, or → `0` (empty) when every top was empty and
//!      `S` has no bits. A failed CAS only means a push published meanwhile; the pushes merged
//!      themselves into the word, so the holder retries with the new word without scanning again.
//!
//!   Pops that see `SEARCHING` wait for the search lock and start over.
//!
//! ## Races considered
//!
//! - *ABA across searches:* every search starts from the same word `(0, SEARCHING, 0)`. If any
//!   thread could finish a search, one that scanned during one search and paused before its CAS
//!   could later CAS its stale result into a newer search whose word happens to be equal, and hide
//!   items pushed in between. With the search lock, the thread that finishes a search is the one
//!   that started it, and the scan belongs to that search (I6), so a scan is never applied to a
//!   different search.
//! - *Push during a search:* the push stores its shard's new top, then publishes (CAS-max into
//!   `highest`, set its bit). If the search's scan read that shard's top before the store, the
//!   publish is merged into the word before the finishing CAS (which then retries with the merged
//!   word), or comes after it (and is then a normal push against the new `highest`). Either way the
//!   push is not lost.
//! - *Unlocked tops:* the searching thread doesn't lock shards; every insertion stores the new top
//!   before it publishes. A push whose rank is below `highest` doesn't write the state word at all,
//!   so its top store and a search are a store-buffering pattern: the pusher stores its top and
//!   then reads the state, the search's start writes the state and then the searching thread reads
//!   the tops. All four accesses are `SeqCst`, so either the pusher sees the search (and publishes
//!   into it) or the searching thread sees the pusher's top. (A shard lock would give that ordering
//!   too, but the search doesn't take one.)
//! - *Removals during a search:* pops and steals that see `SEARCHING` start over, but one that
//!   checked the state before a search started (e.g. it verified `highest`, then another shard
//!   raised and drained it, then a search started) may still remove items while the search runs.
//!   Removals only lower tops. A search that read a top before it was lowered computes a `highest`
//!   or bits that are too high: a stale `highest` without any shard having it, or a spurious bit.
//!   Both are allowed by I1 and I2 and get cleared lazily (and a stale `highest` with no bits
//!   starts a new search). A removal can't hide items, so it can't make the search end too low or
//!   empty.
//! - *Moves during a search:* a steal moves items between two locked shards. It stores the
//!   destination's new top and publishes the destination *before* it lowers the source's top. A
//!   search that read the source's lowered top therefore read it after the publish. Then either the
//!   publish was merged into the word before the finishing CAS (which retries with the merged
//!   word), or the CAS came first, so the publish of the moved items comes after it, against the
//!   new word. Either way the moved items are never missed by both the tops and the state word.
//! - *Empty shards with set bits* (kept by I2's lazy clearing): a pop that finds its shard without
//!   `highest` clears its bit, and steals clear the spurious bits of the shards they try. Thieves
//!   try set bits in pseudo-random order, so spurious bits can cost extra lock attempts, but they
//!   are cleared as they are tried. When the last bit is cleared, the queue reaches the empty state
//!   (rank `0`) or starts a search.
//! - *Raise vs. bit clear:* a pop clearing its bit for `highest == h` races with a push raising
//!   `highest` to `h' > h`. The clear is a CAS conditioned on `highest == h`, so it fails and
//!   retries, and then sees `h'` and does nothing.
//! - *Steal vs. search:* a search can only start once all bits are clear. While a thief holds a
//!   victim that has `highest`, the victim's bit can't be cleared (I5) unless `highest` changes.
//!   The thief stores its own shard's new top and publishes it before it lowers the victim's top
//!   and clears the victim's bit, so the bits don't run empty while the moved items are being
//!   published. If a search starts anyway (after `highest` was raised and drained elsewhere), the
//!   thief re-reads the state under the locks and starts over instead of popping.
//! - *Contention:* a thread that fails to `try_lock` its home shard tries other shards (for a pop,
//!   only shards whose bit is set). After a bounded number of attempts it blocks on its home shard
//!   instead, so a pop never returns `None` just because shards were busy (I4). A pop only picks
//!   shards by their bit outside of a search (during a search it waits for the search lock), where
//!   a set bit means the shard may have `highest` (I2). A spurious bit only costs a retry: the pop
//!   sees the shard doesn't have `highest`, clears the bit and steals or starts over.
//! - *Home switches* only change thread-local state, and the steal pressure is only read or written
//!   under its shard's lock, so neither affects the invariants above.
//!
//! ## Ordering guarantee
//!
//! Without concurrent pushes, a pop returns an item of the highest queued priority (among
//! priorities of equal rank, in any order). With concurrent pushes, a pop returns an item whose
//! priority was the highest at some point during the pop: a concurrently pushed higher priority may
//! be overtaken by items that are already being popped.
//!
//! The implementation uses that room in one case: a thread that verified under a shard's lock that
//! rank `h` is the highest (the shard has `h`, and `state` read under the lock says `highest == h`;
//! by I1 nothing above `h` is queued at that moment) may still pop an item of rank `h` from that
//! shard, or from the items it just stole from it, if `highest` is raised concurrently. Such a
//! pop doesn't use the `highest` it read before taking any lock: lazily kept bits can make that
//! value stale (no shard has it), so it isn't verified.
//!
//! ## Memory ordering for callers
//!
//! A push that happens before a `pop` call (e.g. via a `SeqCst` fence pairing) is observed by that
//! `pop`: it either returns an item or the queue was empty after the push. `pop` only returns
//! `None` once it read the empty state word. That word is only written by clearing the last bit of
//! rank `0` under its shard's lock, or by a search that read every shard's top as empty with a CAS
//! that fails if any push published in between.

use std::{
    cell::Cell,
    collections::{BinaryHeap, hash_map::Entry},
    hash::Hash,
    sync::atomic::{AtomicU64, AtomicUsize, Ordering},
};

use crossbeam_utils::CachePadded;
use parking_lot::{Mutex, MutexGuard};
use rustc_hash::FxHashMap;

/// A priority that can be summarized in the queue's shared state word.
pub trait QueuePriority {
    /// A rank that is monotone in the priority's order: `a < b` implies
    /// `a.rank() <= b.rank()`. Give the lowest priority rank `0`: draining rank `0` empties the
    /// queue without a search for the next priority, so the queue is cheapest when most items have
    /// the lowest priority.
    ///
    /// Ranks don't need to be distinct: priorities of equal rank are only ordered within one shard,
    /// across shards they are treated as equal.
    fn rank(&self) -> u32;
}

/// Unsigned integers up to 32 bits are their own rank.
macro_rules! impl_queue_priority_for_uint {
    ($($ty:ty),*) => {
        $(
            impl QueuePriority for $ty {
                fn rank(&self) -> u32 {
                    u32::from(*self)
                }
            }
        )*
    };
}
impl_queue_priority_for_uint!(u8, u16, u32);

/// The number of shards. Each has one bit in the state word, next to the `SEARCHING` flag and the
/// 32-bit `highest` rank.
pub const SHARD_COUNT: usize = 31;
const ALL_BITS: u64 = (1 << SHARD_COUNT) - 1;
const SEARCHING: u64 = 1 << SHARD_COUNT;
const HIGHEST_SHIFT: u32 = 32;
/// How many shards a thread tries with `try_lock` before it blocks on a lock.
const TRY_LOCK_ATTEMPTS: usize = 4;
/// The steal pressure (see the crate docs) from which a shard is taken over by a thread that wants
/// to steal from it, or that happens to use it, instead of being stolen from. See the crate docs.
const STEAL_PRESSURE_THRESHOLD: u32 = 64;
/// Bytes allocated up front for each of a shard's buffers (priority heap, priority map, spare item
/// `Vec`): several cache lines each.
const SHARD_BUFFER_BYTES: usize = 512;
/// A spare item `Vec` larger than this many bytes is shrunk before it is kept.
const MAX_SPARE_BYTES: usize = 4096;

/// How many `T`s fit into `bytes` (at least 1).
fn capacity_for<T>(bytes: usize) -> usize {
    (bytes / size_of::<T>().max(1)).max(1)
}

fn state_highest(state: u64) -> u32 {
    (state >> HIGHEST_SHIFT) as u32
}

fn state_bits(state: u64) -> u64 {
    state & ALL_BITS
}

fn is_searching(state: u64) -> bool {
    state & SEARCHING != 0
}

fn make_state(highest: u32, searching: bool, bits: u64) -> u64 {
    ((highest as u64) << HIGHEST_SHIFT) | if searching { SEARCHING } else { 0 } | bits
}

fn shard_bit(index: usize) -> u64 {
    1 << index
}

/// Hands out the initial shard of each thread round-robin.
static NEXT_THREAD_SHARD: AtomicUsize = AtomicUsize::new(0);

thread_local! {
    /// The shard this thread pushes to and pops from first. `usize::MAX` until first use.
    static THREAD_SHARD: Cell<usize> = const { Cell::new(usize::MAX) };
    /// State of a per-thread xorshift generator, used to spread steal and search attempts.
    static THREAD_RNG: Cell<u32> = const { Cell::new(0) };
}

fn thread_shard() -> usize {
    THREAD_SHARD.with(|shard| {
        let mut index = shard.get();
        if index == usize::MAX {
            index = NEXT_THREAD_SHARD.fetch_add(1, Ordering::Relaxed) % SHARD_COUNT;
            shard.set(index);
        }
        index
    })
}

fn set_thread_shard(index: usize) {
    THREAD_SHARD.with(|shard| shard.set(index));
}

/// A pseudo-random number in `0..SHARD_COUNT`.
fn random_shard() -> usize {
    THREAD_RNG.with(|rng| {
        let mut x = rng.get();
        if x == 0 {
            // Seed from the thread's shard, so threads start at different points.
            x = (thread_shard() as u32).wrapping_mul(0x9E37_79B9) | 1;
        }
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        rng.set(x);
        // Multiply-shift maps `x` to `0..SHARD_COUNT` without a division.
        ((u64::from(x) * SHARD_COUNT as u64) >> 32) as usize
    })
}

/// The shard after `index`, wrapping around after the last one (no division).
fn next_shard(index: usize) -> usize {
    let next = index + 1;
    if next == SHARD_COUNT { 0 } else { next }
}

/// One shard: the items queued in it, by priority.
///
/// Invariant: `heap` contains exactly the keys of `buckets`, each once, and no bucket is empty.
struct Shard<P, T> {
    buckets: FxHashMap<P, Vec<T>>,
    heap: BinaryHeap<P>,
    /// Raised by steals and by uses by threads whose home this shard isn't, halved by every use by
    /// a thread whose home it is, reset when a thread makes it its home. A heuristic, see the
    /// crate docs.
    steal_pressure: u32,
    /// The (empty) `Vec` of the last priority that ran empty, reused for the next new priority.
    spare: Vec<T>,
    /// Whether items were last added by a push (`true`) or by a steal into this shard (`false`).
    /// A pop that empties a shard keeps its bit only after pushes: then the shard's thread likely
    /// pushes the same rank again soon (I2). After a steal it clears the bit right away, so other
    /// thieves don't keep trying a drained shard.
    filled_by_push: bool,
}

impl<P: Clone + Ord + Hash + QueuePriority, T> Shard<P, T> {
    fn new() -> Self {
        Self {
            buckets: FxHashMap::with_capacity_and_hasher(
                capacity_for::<(P, Vec<T>)>(SHARD_BUFFER_BYTES),
                Default::default(),
            ),
            heap: BinaryHeap::with_capacity(capacity_for::<P>(SHARD_BUFFER_BYTES)),
            steal_pressure: 0,
            spare: Vec::with_capacity(capacity_for::<T>(SHARD_BUFFER_BYTES)),
            filled_by_push: true,
        }
    }

    /// The value of this shard's published top rank: `0` when empty, else the top rank plus one.
    fn published_top(&self) -> u64 {
        self.top_rank().map_or(0, |rank| u64::from(rank) + 1)
    }

    /// Whether other threads used this shard many times since a thread whose home it is last did.
    fn has_high_steal_pressure(&self) -> bool {
        self.steal_pressure >= STEAL_PRESSURE_THRESHOLD
    }

    /// Updates the steal pressure for a push or pop by a thread whose home this shard is
    /// (`is_home`), or by another thread. See the crate docs.
    fn record_use(&mut self, is_home: bool) {
        self.steal_pressure = if is_home {
            self.steal_pressure / 2
        } else {
            self.steal_pressure.saturating_add(1)
        };
    }

    fn top_rank(&self) -> Option<u32> {
        self.heap.peek().map(QueuePriority::rank)
    }

    /// Whether the shard is non-empty and its top priority has rank `rank`.
    fn has_rank(&self, rank: u32) -> bool {
        self.top_rank() == Some(rank)
    }

    fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }

    fn push(&mut self, priority: P, item: T) {
        self.filled_by_push = true;
        match self.buckets.entry(priority) {
            Entry::Occupied(mut entry) => entry.get_mut().push(item),
            Entry::Vacant(entry) => {
                self.heap.push(entry.key().clone());
                let mut bucket = std::mem::take(&mut self.spare);
                bucket.push(item);
                entry.insert(bucket);
            }
        }
    }

    /// Appends `items` (not empty), stolen from another shard, to the bucket of `priority`.
    fn push_many(&mut self, priority: P, mut items: Vec<T>) {
        self.filled_by_push = false;
        match self.buckets.entry(priority) {
            Entry::Occupied(mut entry) => entry.get_mut().append(&mut items),
            Entry::Vacant(entry) => {
                self.heap.push(entry.key().clone());
                entry.insert(items);
            }
        }
    }

    /// Removes the newest item of the top priority. The caller updates the steal pressure (see
    /// [`Shard::record_use`]).
    fn pop_top(&mut self) -> Option<(P, T)> {
        let priority = self.heap.peek()?.clone();
        let bucket = self.buckets.get_mut(&priority).unwrap();
        let item = bucket.pop().unwrap();
        if bucket.is_empty() {
            let bucket = self.buckets.remove(&priority).unwrap();
            self.heap.pop();
            self.keep_spare(bucket);
        }
        Some((priority, item))
    }

    /// Keeps the empty `bucket` for reuse, if it is larger than the current spare.
    fn keep_spare(&mut self, mut bucket: Vec<T>) {
        if bucket.capacity() > self.spare.capacity() {
            bucket.shrink_to(capacity_for::<T>(MAX_SPARE_BYTES));
            self.spare = bucket;
        }
    }

    /// Removes half (rounded up) of the items of the top priority, the newest ones, for a steal,
    /// and raises the steal pressure.
    fn take_half_top(&mut self) -> Option<(P, Vec<T>)> {
        let priority = self.heap.peek()?.clone();
        self.steal_pressure = self.steal_pressure.saturating_add(1);
        let bucket = self.buckets.get_mut(&priority).unwrap();
        let count = bucket.len().div_ceil(2);
        if count == bucket.len() {
            let items = self.buckets.remove(&priority).unwrap();
            self.heap.pop();
            Some((priority, items))
        } else {
            let keep = bucket.len() - count;
            Some((priority, bucket.split_off(keep)))
        }
    }
}

/// What a pop attempt on a locked shard found.
enum ShardPop<P, T> {
    /// An item at the highest priority.
    Item(P, T),
    /// The shard doesn't have the highest priority (any more).
    NotHighest,
    /// The state changed (a search started or the queue became empty); start over.
    Retry,
}

/// A shard behind its lock, with its published top. Padded to its own cache line by
/// [`PaddedShard`].
struct Slot<P, T> {
    /// The shard's top rank plus one, `0` when empty. Written under `shard`'s lock whenever the
    /// top changes, read without the lock by searches.
    top: AtomicU64,
    shard: Mutex<Shard<P, T>>,
}

type PaddedShard<P, T> = CachePadded<Slot<P, T>>;

/// A concurrent priority queue: pops return the highest priority first. Items of equal priority
/// are popped newest first within a shard, in no particular order across shards. See the
/// [crate docs](crate) for the exact ordering guarantee under concurrent pushes.
pub struct ConcurrentPriorityQueue<P, T> {
    shards: Box<[PaddedShard<P, T>]>,
    /// `highest` rank, `SEARCHING` flag and shard bits, see the crate docs.
    state: CachePadded<AtomicU64>,
    /// Serializes searches: only its holder starts and finishes a search. See "Search" in the
    /// crate docs.
    search_lock: CachePadded<Mutex<()>>,
}

impl<P: Clone + Ord + Hash + QueuePriority, T> Default for ConcurrentPriorityQueue<P, T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<P: Clone + Ord + Hash + QueuePriority, T> ConcurrentPriorityQueue<P, T> {
    /// Creates an empty queue. Allocates all [`SHARD_COUNT`] shards and their buffers up front.
    pub fn new() -> Self {
        Self {
            shards: (0..SHARD_COUNT)
                .map(|_| {
                    CachePadded::new(Slot {
                        top: AtomicU64::new(0),
                        shard: Mutex::new(Shard::new()),
                    })
                })
                .collect(),
            state: CachePadded::new(AtomicU64::new(0)),
            search_lock: CachePadded::new(Mutex::new(())),
        }
    }

    /// Whether the queue is empty. Only a snapshot when used concurrently with pushes and pops.
    ///
    /// The state word alone can't always tell: after the last item of a rank above `0` was popped,
    /// it keeps that stale `highest` until the next `pop` searches, and it may keep bits of shards
    /// that ran empty (I2). So unless the word is `0`, this looks at every shard's published top.
    pub fn is_empty(&self) -> bool {
        self.state.load(Ordering::Acquire) == 0
            || self
                .shards
                .iter()
                .all(|slot| slot.top.load(Ordering::Acquire) == 0)
    }

    /// Locks the thread's home shard for a push, or another one if that is busy. Blocks on the home
    /// shard only after [`TRY_LOCK_ATTEMPTS`] failed attempts.
    fn lock_some_shard(&self) -> (usize, MutexGuard<'_, Shard<P, T>>) {
        let home = thread_shard();
        if let Some(guard) = self.shards[home].shard.try_lock() {
            return (home, guard);
        }
        for _ in 1..TRY_LOCK_ATTEMPTS {
            let index = random_shard();
            if let Some(mut guard) = self.shards[index].shard.try_lock() {
                Self::visit_shard(home, index, &mut guard);
                return (index, guard);
            }
        }
        (home, self.shards[home].shard.lock())
    }

    /// Locks the thread's home shard for a pop, or, if that is busy, a shard whose bit is set in
    /// `state` (not searching), so it may have items at the highest priority. The caller
    /// revalidates under the lock. Blocks on the home shard only after [`TRY_LOCK_ATTEMPTS`]
    /// failed attempts or when no other bit is set.
    fn lock_shard_for_pop(&self, state: u64) -> (usize, MutexGuard<'_, Shard<P, T>>) {
        let home = thread_shard();
        if let Some(guard) = self.shards[home].shard.try_lock() {
            return (home, guard);
        }
        let candidates = state_bits(state) & !shard_bit(home);
        if candidates != 0 {
            let mut index = random_shard();
            let mut attempts = 1;
            for _ in 0..SHARD_COUNT {
                let current = index;
                index = next_shard(index);
                if candidates & shard_bit(current) == 0 {
                    continue;
                }
                if let Some(mut guard) = self.shards[current].shard.try_lock() {
                    Self::visit_shard(home, current, &mut guard);
                    return (current, guard);
                }
                attempts += 1;
                if attempts >= TRY_LOCK_ATTEMPTS {
                    break;
                }
            }
        }
        (home, self.shards[home].shard.lock())
    }

    /// Called when a thread uses shard `index` (whose lock it holds) instead of its `home` shard:
    /// it only moves its home there when that shard has high steal pressure, which it then resets.
    fn visit_shard(home: usize, index: usize, shard: &mut Shard<P, T>) {
        if index != home && shard.has_high_steal_pressure() {
            set_thread_shard(index);
            shard.steal_pressure = 0;
        }
    }

    /// Updates the steal pressure of shard `index`, whose lock the caller holds, for a push or pop
    /// by this thread.
    fn record_use(&self, index: usize, shard: &mut Shard<P, T>) {
        shard.record_use(index == thread_shard());
    }

    /// Stores the published top rank of shard `index`, whose lock the caller holds, if it changed.
    /// Called after every change of the shard, before the state word is updated.
    fn store_top(&self, index: usize, shard: &Shard<P, T>) {
        let top = &self.shards[index].top;
        let value = shard.published_top();
        // Only this shard's lock holder writes it, so a relaxed read sees the current value. The
        // store is `SeqCst`, see "Unlocked tops" in the crate docs.
        if top.load(Ordering::Relaxed) != value {
            top.store(value, Ordering::SeqCst);
        }
    }

    /// Queues `item` with `priority`.
    pub fn push(&self, priority: P, item: T) {
        let (index, mut shard) = self.lock_some_shard();
        shard.push(priority, item);
        self.record_use(index, &mut shard);
        self.store_top(index, &shard);
        self.publish(index, &shard);
    }

    /// Queues all `items`, like calling [`ConcurrentPriorityQueue::push`] for each of them, but
    /// locks a shard and updates the state word only once for the whole batch.
    ///
    /// The items are collected before the shard is locked, so the caller's iterator never runs
    /// under a shard lock (a panicking iterator can't leave unpublished items behind, and a
    /// reentrant one can't deadlock).
    pub fn push_many(&self, items: impl IntoIterator<Item = (P, T)>) {
        let items: Vec<(P, T)> = items.into_iter().collect();
        if items.is_empty() {
            return;
        }
        let (index, mut shard) = self.lock_some_shard();
        for (priority, item) in items {
            shard.push(priority, item);
        }
        self.record_use(index, &mut shard);
        self.store_top(index, &shard);
        self.publish(index, &shard);
    }

    /// Publishes the top rank of shard `index`, whose lock the caller holds and which is not
    /// empty. Called after inserting into the shard. See "Push" in the crate docs.
    fn publish(&self, index: usize, shard: &Shard<P, T>) {
        let rank = shard
            .top_rank()
            .expect("a shard is published after inserting into it");
        let bit = shard_bit(index);
        // `SeqCst`, paired with the start of a search, see "Unlocked tops" in the crate docs.
        let mut state = self.state.load(Ordering::SeqCst);
        loop {
            let highest = state_highest(state);
            let new_state = if is_searching(state) {
                make_state(highest.max(rank), true, state_bits(state) | bit)
            } else if rank > highest {
                make_state(rank, false, bit)
            } else if rank == highest && state & bit == 0 {
                state | bit
            } else {
                return;
            };
            match self.state.compare_exchange_weak(
                state,
                new_state,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return,
                Err(actual) => state = actual,
            }
        }
    }

    /// Clears the bit of shard `index`, whose lock the caller holds and which doesn't have rank
    /// `highest`, if `highest` is still the state's highest rank and no search is in progress.
    fn clear_bit_if_highest(&self, index: usize, highest: u32) {
        let bit = shard_bit(index);
        let mut state = self.state.load(Ordering::Acquire);
        loop {
            if is_searching(state) || state_highest(state) != highest || state & bit == 0 {
                return;
            }
            match self.state.compare_exchange_weak(
                state,
                state & !bit,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return,
                Err(actual) => state = actual,
            }
        }
    }

    /// Searches for the new highest priority once no shard bit is set, see "Search" in the crate
    /// docs. Returns when the state word no longer needs a search.
    #[cold]
    fn search(&self) {
        let _search = self.search_lock.lock();
        // Re-read under the lock: another thread may have searched (or a push published) since.
        let mut state = self.state.load(Ordering::SeqCst);
        loop {
            if state == 0 || state_bits(state) != 0 {
                return;
            }
            debug_assert!(
                !is_searching(state),
                "only the search lock holder sets SEARCHING"
            );
            match self
                .state
                .compare_exchange(state, SEARCHING, Ordering::SeqCst, Ordering::SeqCst)
            {
                Ok(_) => break,
                Err(actual) => state = actual,
            }
        }
        let scan = self.scan_tops();
        self.finish_search(scan);
    }

    /// Reads every shard's published top, without locking the shards: the maximum rank (`None`
    /// when every shard is empty) and the bits of the shards whose top has it.
    fn scan_tops(&self) -> (Option<u32>, u64) {
        let mut found: Option<u32> = None;
        let mut found_bits = 0;
        for (index, slot) in self.shards.iter().enumerate() {
            let top = slot.top.load(Ordering::SeqCst);
            let Some(rank) = top.checked_sub(1) else {
                continue;
            };
            // A published top is a rank plus one, so it fits into `u32` after `- 1`.
            let rank = rank as u32;
            match found {
                Some(max) if rank < max => {}
                Some(max) if rank == max => found_bits |= shard_bit(index),
                _ => {
                    found = Some(rank);
                    found_bits = shard_bit(index);
                }
            }
        }
        (found, found_bits)
    }

    /// Finishes the search started by the caller, which holds the search lock, with the result of
    /// its [`scan_tops`](Self::scan_tops): merges it with what pushes wrote into the word during
    /// the search.
    fn finish_search(&self, (found, found_bits): (Option<u32>, u64)) {
        let mut state = self.state.load(Ordering::SeqCst);
        loop {
            debug_assert!(is_searching(state));
            let new_state = match found {
                None if state_bits(state) == 0 => 0,
                None => make_state(state_highest(state), false, state_bits(state)),
                Some(max) => make_state(
                    state_highest(state).max(max),
                    false,
                    found_bits | state_bits(state),
                ),
            };
            match self
                .state
                .compare_exchange(state, new_state, Ordering::SeqCst, Ordering::SeqCst)
            {
                Ok(_) => return,
                Err(actual) => state = actual,
            }
        }
    }

    /// Waits until the running search (if any) is finished.
    #[cold]
    fn wait_for_search(&self) {
        drop(self.search_lock.lock());
    }

    /// Pops an item of the highest priority. Only returns `None` when the queue is empty: busy
    /// shards make it wait, never give up.
    pub fn pop(&self) -> Option<(P, T)> {
        loop {
            let state = self.state.load(Ordering::Acquire);
            if state == 0 {
                return None;
            }
            if is_searching(state) {
                self.wait_for_search();
                continue;
            }
            if state_bits(state) == 0 {
                // No shard has `highest` (I2), and `highest > 0` (else `state == 0`): search for
                // the new highest priority.
                self.search();
                continue;
            }
            let (index, mut shard) = self.lock_shard_for_pop(state);
            match self.pop_locked(index, &mut shard, None) {
                ShardPop::Item(priority, item) => return Some((priority, item)),
                ShardPop::Retry => continue,
                ShardPop::NotHighest => {}
            }
            if let Some(item) = self.steal(index, &mut shard) {
                return Some(item);
            }
        }
    }

    /// Pops an item at the highest priority from shard `index`, whose lock the caller holds. With
    /// `verified`, the rank that this pop verified to be the highest (see the ordering guarantee in
    /// the crate docs), an item of that rank may be popped even if `highest` was raised since.
    fn pop_locked(
        &self,
        index: usize,
        shard: &mut Shard<P, T>,
        verified: Option<u32>,
    ) -> ShardPop<P, T> {
        // Re-read under the lock: never pop below the current highest priority (or the verified
        // one).
        let state = self.state.load(Ordering::Acquire);
        if state == 0 || is_searching(state) {
            return ShardPop::Retry;
        }
        let highest = state_highest(state);
        if !shard.has_rank(highest) {
            if let Some(verified) = verified
                && shard.has_rank(verified)
            {
                // `highest` was raised after `verified` was verified: the item's priority was the
                // highest at that point, during this pop.
                let (priority, item) = shard.pop_top().unwrap();
                self.record_use(index, shard);
                self.store_top(index, shard);
                return ShardPop::Item(priority, item);
            }
            self.clear_bit_if_highest(index, highest);
            return ShardPop::NotHighest;
        }
        let (priority, item) = shard.pop_top().unwrap();
        self.record_use(index, shard);
        self.store_top(index, shard);
        // An empty shard that was filled by pushes keeps its bit (I2): the next push to it likely
        // has the same rank. One filled by a steal clears it, see `Shard::filled_by_push`.
        if !(shard.is_empty() && shard.filled_by_push) && !shard.has_rank(highest) {
            self.clear_bit_if_highest(index, highest);
        }
        ShardPop::Item(priority, item)
    }

    /// Steals half of the items at the highest priority from a shard whose bit is set into shard
    /// `index` (whose lock the caller holds), and pops one of them. A victim with high steal
    /// pressure is taken over instead: the thread makes it its home and pops from it directly. See
    /// "Steal" in the crate docs.
    fn steal(&self, index: usize, shard: &mut Shard<P, T>) -> Option<(P, T)> {
        let state = self.state.load(Ordering::Acquire);
        if state == 0 || is_searching(state) {
            return None;
        }
        let highest = state_highest(state);
        let candidates = state_bits(state) & !shard_bit(index);
        let mut next = random_shard();
        for _ in 0..SHARD_COUNT {
            let victim_index = next;
            next = next_shard(next);
            if candidates & shard_bit(victim_index) == 0 {
                continue;
            }
            let Some(mut victim) = self.shards[victim_index].shard.try_lock() else {
                continue;
            };
            let state = self.state.load(Ordering::Acquire);
            if is_searching(state) || state_highest(state) != highest {
                return None;
            }
            if !victim.has_rank(highest) {
                self.clear_bit_if_highest(victim_index, highest);
                continue;
            }
            if victim.has_high_steal_pressure() {
                set_thread_shard(victim_index);
                victim.steal_pressure = 0;
                // `highest` was just verified on the victim, under its lock.
                return match self.pop_locked(victim_index, &mut victim, Some(highest)) {
                    ShardPop::Item(priority, item) => Some((priority, item)),
                    // The state changed (e.g. a higher priority was pushed): let `pop` start over.
                    ShardPop::NotHighest | ShardPop::Retry => None,
                };
            }
            let (priority, items) = victim.take_half_top().unwrap();
            shard.push_many(priority, items);
            self.store_top(index, shard);
            // Publish ours before lowering the victim's top and clearing its bit: then neither the
            // bits nor the published tops ever miss the moved items (see "Moves during a search" in
            // the crate docs).
            self.publish(index, shard);
            self.store_top(victim_index, &victim);
            if !victim.has_rank(highest) {
                self.clear_bit_if_highest(victim_index, highest);
            }
            drop(victim);
            // `highest` was verified on the victim, and the stolen items have that rank.
            return match self.pop_locked(index, shard, Some(highest)) {
                ShardPop::Item(priority, item) => Some((priority, item)),
                // The state changed: let `pop` start over.
                ShardPop::NotHighest | ShardPop::Retry => None,
            };
        }
        None
    }
}

#[cfg(test)]
mod tests;
