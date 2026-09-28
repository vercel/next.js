//! Dense, independently locked task storage.
//!
//! `boxcar::Vec` is an append-only directory of permanent chunk entries. Each entry uses Kovan to
//! publish and reclaim its large task chunk while retaining a stable location for later
//! replacement. Missing intermediate chunks cost one small empty directory entry, not `CHUNK_SIZE`
//! task slots.
//!
//! Kovan requires lock-free 128-bit atomics on its native x86-64/aarch64/s390x paths. In
//! particular, x86-64 CPUs must support `CMPXCHG16B`; Kovan runtime-detects this and panics during
//! global-state initialization when unavailable.

use std::{
    cell::UnsafeCell,
    marker::PhantomData,
    ops::{Deref, DerefMut},
    rc::Rc,
    sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
};

use kovan::{AtomGuard, AtomOption};
use parking_lot::Mutex;
use turbo_tasks::{TRANSIENT_TASK_BIT, TaskId, parallel};

/// 128 slots balances GC scan work, sparse reclamation granularity, construction cost, and
/// concurrent metadata contention in the 64/128/256/1024 block-size matrix.
pub(crate) const CHUNK_SHIFT: usize = 7;
pub(crate) const CHUNK_SIZE: usize = 1 << CHUNK_SHIFT;
const CHUNK_MASK: usize = CHUNK_SIZE - 1;
const BITMAP_WORD_BITS: usize = u64::BITS as usize;
pub(crate) const BITMAP_WORDS: usize = CHUNK_SIZE / BITMAP_WORD_BITS;

/// Value stored in an always-initialized intrusive task slot.
///
/// This small abstraction lets the container's concurrency invariants be tested with a minimal
/// value and lets the benchmark compare the exact container using a representative 128-byte value.
/// Production has a single implementation for `TaskStorage`.
///
/// # Safety
///
/// Implementations must keep the lock at a stable address, initialize it in `EMPTY`, require the
/// lock for every payload/presence access, and leave the source lock untouched when vacating.
pub(crate) unsafe trait TaskSlotValue: Sized {
    const EMPTY: Self;

    /// Locks the intrusive mutex reached through a stable raw value pointer.
    ///
    /// # Safety
    /// `value` must point to a live, stably-addressed slot value.
    unsafe fn lock_raw(value: *const Self);

    /// Unlocks the mutex previously acquired through `lock_raw`.
    ///
    /// # Safety
    /// The current thread must own this value's intrusive mutex.
    unsafe fn unlock_raw(value: *const Self);

    fn is_occupied(&self) -> bool;
    fn occupy(&mut self);
    fn take_and_vacate(&mut self) -> Self;
    fn vacate_in_place(&mut self);
}

/// Stable storage for a value whose mutex is embedded inside the value itself.
#[repr(transparent)]
pub(crate) struct TaskSlot<T: TaskSlotValue>(UnsafeCell<T>);

impl<T: TaskSlotValue> TaskSlot<T> {
    pub(crate) const fn empty() -> Self {
        Self(UnsafeCell::new(T::EMPTY))
    }

    fn lock(&self) -> TaskSlotGuard<'_, T> {
        // SAFETY: The value is initialized by `empty` and never moved after its chunk is published.
        unsafe { T::lock_raw(self.0.get()) };
        TaskSlotGuard {
            value: self.0.get(),
            _lifetime: PhantomData,
            _not_send: PhantomData,
        }
    }

    fn as_ptr(&self) -> *mut T {
        self.0.get()
    }
}

// SAFETY: `TaskSlotValue` requires all shared payload access to be protected by its embedded lock.
// `T: Send` allows ownership of protected values to move between threads when detached.
unsafe impl<T: TaskSlotValue + Send> Sync for TaskSlot<T> {}

struct TaskSlotGuard<'a, T: TaskSlotValue> {
    value: *mut T,
    _lifetime: PhantomData<&'a TaskSlot<T>>,
    _not_send: PhantomData<Rc<()>>,
}

impl<T: TaskSlotValue> Deref for TaskSlotGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: This guard owns the slot's intrusive lock.
        unsafe { &*self.value }
    }
}

impl<T: TaskSlotValue> DerefMut for TaskSlotGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: This guard exclusively owns the slot's intrusive lock.
        unsafe { &mut *self.value }
    }
}

impl<T: TaskSlotValue> Drop for TaskSlotGuard<'_, T> {
    fn drop(&mut self) {
        // SAFETY: construction acquires this same value's lock and the guard is !Send.
        unsafe { T::unlock_raw(self.value) };
    }
}

pub(crate) struct TaskChunk<T: TaskSlotValue> {
    pub(crate) modified_count: AtomicU64,
    occupied_count: AtomicUsize,
    probably_occupied: [AtomicU64; BITMAP_WORDS],
    slots: Box<[TaskSlot<T>; CHUNK_SIZE]>,
}

impl<T: TaskSlotValue> TaskChunk<T> {
    fn new() -> Self {
        Self {
            modified_count: AtomicU64::new(0),
            occupied_count: AtomicUsize::new(0),
            // Start conservatively set so chunk construction and dense first insertion need no
            // atomic read-modify-write per slot. The first scan locks/rechecks vacant slots and
            // clears their stale hints; subsequent sparse scans skip them.
            probably_occupied: [const { AtomicU64::new(u64::MAX) }; BITMAP_WORDS],
            slots: Box::new([const { TaskSlot::empty() }; CHUNK_SIZE]),
        }
    }

    fn word_and_mask(offset: usize) -> (usize, u64) {
        (offset / BITMAP_WORD_BITS, 1 << (offset % BITMAP_WORD_BITS))
    }

    fn mark_probably_occupied(&self, offset: usize) {
        let (word, mask) = Self::word_and_mask(offset);
        self.probably_occupied[word].fetch_or(mask, Ordering::Release);
    }

    fn clear_probably_occupied(&self, offset: usize) {
        let (word, mask) = Self::word_and_mask(offset);
        self.probably_occupied[word].fetch_and(!mask, Ordering::Release);
    }

    pub(crate) fn is_probably_occupied(&self, offset: usize) -> bool {
        let (word, mask) = Self::word_and_mask(offset);
        self.probably_occupied[word].load(Ordering::Acquire) & mask != 0
    }

    fn lock(&self, offset: usize) -> TaskSlotGuard<'_, T> {
        self.slots[offset].lock()
    }

    fn lock_raw(&self, offset: usize) -> *mut T {
        let value = self.slots[offset].as_ptr();
        // SAFETY: this chunk and all of its slot values have stable addresses while protected.
        unsafe { T::lock_raw(value) };
        value
    }

    pub(crate) fn probably_occupied_offsets(&self) -> ProbablyOccupiedOffsets<'_> {
        ProbablyOccupiedOffsets {
            words: &self.probably_occupied,
            word_index: 0,
            bits: 0,
        }
    }
}

pub(crate) struct ProbablyOccupiedOffsets<'a> {
    words: &'a [AtomicU64; BITMAP_WORDS],
    word_index: usize,
    bits: u64,
}

impl Iterator for ProbablyOccupiedOffsets<'_> {
    type Item = usize;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.bits != 0 {
                let bit = self.bits.trailing_zeros() as usize;
                self.bits &= self.bits - 1;
                return Some((self.word_index - 1) * BITMAP_WORD_BITS + bit);
            }
            let word = self.words.get(self.word_index)?;
            self.word_index += 1;
            self.bits = word.load(Ordering::Acquire);
        }
    }
}

struct ChunkDirectoryEntry<T: TaskSlotValue + Send + 'static> {
    chunk: AtomOption<TaskChunk<T>>,
    transition: Mutex<()>,
    retire_candidate: AtomicBool,
}

impl<T: TaskSlotValue + Send + 'static> ChunkDirectoryEntry<T> {
    fn new() -> Self {
        Self {
            chunk: AtomOption::none(),
            transition: Mutex::new(()),
            retire_candidate: AtomicBool::new(false),
        }
    }

    fn retire_if_empty(&self) -> bool {
        // Keep the overwhelmingly-common non-candidate path read-only. The swap below claims a
        // candidate that was already observed; a concurrent false→true transition after this load
        // remains set for the next retirement pass.
        if !self.retire_candidate.load(Ordering::Acquire)
            || !self.retire_candidate.swap(false, Ordering::AcqRel)
        {
            return false;
        }
        let _transition = self.transition.lock();
        let Some(chunk) = self.chunk.load() else {
            return false;
        };
        if chunk.occupied_count.load(Ordering::Acquire) != 0 {
            return false;
        }
        // Transition exclusion prevents insertion from publishing into or replacing this chunk
        // between the zero-count check and the unconditional detach.
        self.chunk.store_none();
        true
    }
}

struct ChunkedVec<T: TaskSlotValue + Send + 'static> {
    chunks: boxcar::Vec<ChunkDirectoryEntry<T>>,
    len: AtomicUsize,
}

impl<T: TaskSlotValue + Send + 'static> ChunkedVec<T> {
    fn with_chunk_capacity(chunk_capacity: usize) -> Self {
        Self {
            chunks: boxcar::Vec::with_capacity(chunk_capacity),
            len: AtomicUsize::new(0),
        }
    }

    fn entry(&self, index: usize) -> Option<&ChunkDirectoryEntry<T>> {
        self.chunks.get(index >> CHUNK_SHIFT)
    }

    fn get_or_create_entry(&self, index: usize) -> &ChunkDirectoryEntry<T> {
        let chunk_index = index >> CHUNK_SHIFT;
        loop {
            if let Some(entry) = self.chunks.get(chunk_index) {
                return entry;
            }

            // `count` includes indices reserved by in-progress pushes. If our index has already
            // been reserved, wait for it to become visible; otherwise help append permanent empty
            // entries toward it. Only their Kovan-managed contents are ever reclaimed.
            if self.chunks.count() <= chunk_index {
                self.chunks.push(ChunkDirectoryEntry::new());
            } else {
                std::hint::spin_loop();
            }
        }
    }

    fn len(&self) -> usize {
        self.len.load(Ordering::Relaxed)
    }

    fn entries(&self) -> impl Iterator<Item = (usize, &ChunkDirectoryEntry<T>)> {
        self.chunks.iter()
    }

    fn clear(&self) {
        let entries: Vec<_> = self.entries().map(|(_, entry)| entry).collect();
        parallel::for_each(&entries, |entry| {
            if let Some(chunk) = entry.chunk.load() {
                for offset in chunk.probably_occupied_offsets() {
                    let mut value = chunk.lock(offset);
                    if value.is_occupied() {
                        value.vacate_in_place();
                    }
                    chunk.clear_probably_occupied(offset);
                }
                chunk.modified_count.store(0, Ordering::Relaxed);
                chunk.occupied_count.store(0, Ordering::Release);
                entry.retire_candidate.store(true, Ordering::Release);
                drop(chunk);
            }
            // `AtomOption::load`, including an empty load, pins this OS thread. Do not leave a
            // parallel clear worker parked with a stale reservation.
            kovan::flush();
        });
        self.len.store(0, Ordering::Relaxed);
        self.retire_empty_chunks();
    }

    fn directory_entry_count(&self) -> usize {
        self.chunks.count()
    }

    #[allow(dead_code)]
    fn loaded_chunk_count(&self) -> usize {
        self.entries()
            .filter(|(_, entry)| entry.chunk.is_some())
            .count()
    }

    fn retire_empty_chunks(&self) -> usize {
        let retired = self
            .entries()
            .filter(|(_, entry)| entry.retire_if_empty())
            .count();
        if retired != 0 {
            kovan::flush();
        }
        retired
    }
}

pub(crate) struct TaskMap<T: TaskSlotValue + Send + 'static> {
    persistent: ChunkedVec<T>,
    transient: ChunkedVec<T>,
}

impl<T: TaskSlotValue + Send + 'static> TaskMap<T> {
    pub(crate) fn new(small_preallocation: bool) -> Self {
        let persistent_chunk_capacity = if small_preallocation {
            1
        } else {
            (1024 * 1024) / CHUNK_SIZE
        };
        Self {
            persistent: ChunkedVec::with_chunk_capacity(persistent_chunk_capacity),
            transient: ChunkedVec::with_chunk_capacity(1),
        }
    }

    fn namespace_and_index(&self, key: TaskId) -> (&ChunkedVec<T>, usize) {
        let raw = *key as usize;
        let index = raw & !(TRANSIENT_TASK_BIT as usize);
        if key.is_transient() {
            (&self.transient, index)
        } else {
            (&self.persistent, index)
        }
    }

    pub(crate) fn get(&self, key: TaskId) -> Option<TaskMapGuard<'_, T>> {
        let (namespace, index) = self.namespace_and_index(key);
        let entry = namespace.entry(index)?;
        let protection = entry.chunk.load()?;
        let offset = index & CHUNK_MASK;
        if !protection.is_probably_occupied(offset) {
            return None;
        }
        TaskMapGuard::new_owned(key, protection, entry, offset, &namespace.len, false)
    }

    pub(crate) fn get_or_insert(&self, key: TaskId) -> TaskMapGuard<'_, T> {
        if let Some(task) = self.get(key) {
            return task;
        }

        let (namespace, index) = self.namespace_and_index(key);
        let entry = namespace.get_or_create_entry(index);
        let offset = index & CHUNK_MASK;
        loop {
            let Some(protection) = entry.chunk.load() else {
                // Publish only the empty chunk while holding transition exclusion. Never wait for
                // a task lock under this mutex: callers may already own another task in the chunk.
                let transition = entry.transition.lock();
                if entry.chunk.is_none() {
                    entry.chunk.store_some(TaskChunk::new());
                    entry.retire_candidate.store(false, Ordering::Release);
                }
                drop(transition);
                continue;
            };

            let chunk = &*protection as *const TaskChunk<T>;
            // SAFETY: `protection` keeps the loaded raw chunk alive.
            let value = unsafe { (&*chunk).lock_raw(offset) };
            // SAFETY: this thread owns the value's intrusive lock.
            if unsafe { &*value }.is_occupied() {
                return TaskMapGuard::new_locked(
                    key,
                    value,
                    Some(protection),
                    entry,
                    chunk,
                    &namespace.len,
                );
            }

            // Lock order is task -> transition. Retirement never takes task locks, so this cannot
            // cycle with callers that already hold another task in the same chunk.
            let transition = entry.transition.lock();
            let current = entry.chunk.load();
            let still_current = current
                .as_ref()
                .is_some_and(|current| std::ptr::eq::<TaskChunk<T>>(&**current, &*protection));
            if !still_current {
                drop(current);
                drop(transition);
                // SAFETY: `lock_raw` acquired this same value's lock on this thread.
                unsafe { T::unlock_raw(value) };
                continue;
            }

            // Publish the hint before authoritative occupancy. A clear hint can therefore never
            // hide a modified task from a racing bulk scan.
            unsafe { &*chunk }.mark_probably_occupied(offset);
            // SAFETY: this thread owns the value's intrusive lock.
            unsafe { &mut *value }.occupy();
            unsafe { &*chunk }
                .occupied_count
                .fetch_add(1, Ordering::Release);
            namespace.len.fetch_add(1, Ordering::Relaxed);
            entry.retire_candidate.store(false, Ordering::Release);
            drop(current);
            let task = TaskMapGuard::new_locked(
                key,
                value,
                Some(protection),
                entry,
                chunk,
                &namespace.len,
            );
            drop(transition);
            return task;
        }
    }

    #[allow(dead_code)]
    pub(crate) fn remove(&self, key: TaskId) -> Option<T> {
        let guard = self.get(key)?;
        Some(guard.take_and_vacate())
    }

    #[allow(dead_code)]
    pub(crate) fn remove_discard(&self, key: TaskId) -> bool {
        let Some(guard) = self.get(key) else {
            return false;
        };
        guard.vacate();
        true
    }

    pub(crate) fn len(&self) -> usize {
        self.persistent.len() + self.transient.len()
    }

    pub(crate) fn clear(&self) {
        self.persistent.clear();
        self.transient.clear();
    }

    pub(crate) fn retire_empty_chunks(&self) -> usize {
        self.persistent.retire_empty_chunks() + self.transient.retire_empty_chunks()
    }

    #[allow(dead_code)]
    pub(crate) fn loaded_chunk_count(&self) -> usize {
        self.persistent.loaded_chunk_count() + self.transient.loaded_chunk_count()
    }

    #[allow(dead_code)]
    pub(crate) fn directory_entry_count(&self) -> usize {
        self.persistent.directory_entry_count() + self.transient.directory_entry_count()
    }

    #[allow(dead_code)]
    pub(crate) fn directory_entry_size() -> usize {
        std::mem::size_of::<ChunkDirectoryEntry<T>>()
    }

    pub(crate) fn parallel_collect<R, C>(
        &self,
        f: impl Fn(TaskChunkRef<'_, T>) -> R + Send + Sync,
    ) -> C
    where
        R: Send + Sync,
        C: FromIterator<R>,
    {
        parallel::map_collect_owned(self.chunks(), |chunk| {
            let result = f(chunk);
            // A clean snapshot may only load the per-chunk counter and return without constructing
            // LoadedTaskChunk, so flush the worker reservation at the batch boundary as well.
            kovan::flush();
            result
        })
    }

    pub(crate) fn chunks(&self) -> Vec<TaskChunkRef<'_, T>> {
        self.persistent
            .entries()
            .map(|(index, entry)| TaskChunkRef {
                base_id: index << CHUNK_SHIFT,
                transient: false,
                entry,
                len: &self.persistent.len,
            })
            .chain(self.transient.entries().map(|(index, entry)| TaskChunkRef {
                base_id: index << CHUNK_SHIFT,
                transient: true,
                entry,
                len: &self.transient.len,
            }))
            .collect()
    }

    pub(crate) fn persistent_chunks(&self) -> Vec<TaskChunkRef<'_, T>> {
        self.persistent
            .entries()
            .map(|(index, entry)| TaskChunkRef {
                base_id: index << CHUNK_SHIFT,
                transient: false,
                entry,
                len: &self.persistent.len,
            })
            .collect()
    }
}

pub(crate) struct TaskChunkRef<'a, T: TaskSlotValue + Send + 'static> {
    pub(crate) base_id: usize,
    pub(crate) transient: bool,
    entry: &'a ChunkDirectoryEntry<T>,
    len: &'a AtomicUsize,
}

impl<T: TaskSlotValue + Send + 'static> Copy for TaskChunkRef<'_, T> {}

impl<T: TaskSlotValue + Send + 'static> Clone for TaskChunkRef<'_, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'a, T: TaskSlotValue + Send + 'static> TaskChunkRef<'a, T> {
    fn load(&self) -> Option<LoadedTaskChunk<'a, T>> {
        Some(LoadedTaskChunk {
            owner: *self,
            chunk: self.entry.chunk.load()?,
        })
    }

    pub(crate) fn for_each_mut(&self, f: impl FnMut(TaskMapGuard<'_, T>)) {
        if let Some(chunk) = self.load() {
            chunk.for_each_mut(f);
        } else {
            // Loading an empty AtomOption still pins this OS thread. Do not leave scan workers
            // parked with a stale reservation that delays physical reclamation.
            kovan::flush();
        }
    }

    #[allow(dead_code)]
    pub(crate) fn get(&self, offset: usize) -> Option<TaskMapGuard<'a, T>> {
        // Persistent TaskId zero is reserved and can only appear as a conservative bitmap hint.
        if !self.transient && self.base_id + offset == 0 {
            return None;
        }
        let protection = self.entry.chunk.load()?;
        if !protection.is_probably_occupied(offset) {
            return None;
        }
        TaskMapGuard::new_owned(
            self.task_id(offset),
            protection,
            self.entry,
            offset,
            self.len,
            true,
        )
    }

    pub(crate) fn swap_modified_count(&self) -> Option<u64> {
        Some(
            self.entry
                .chunk
                .load()?
                .modified_count
                .swap(0, Ordering::Relaxed),
        )
    }

    pub(crate) fn modified_count(&self) -> u64 {
        self.entry
            .chunk
            .load()
            .map_or(0, |chunk| chunk.modified_count.load(Ordering::Relaxed))
    }

    #[allow(dead_code)]
    pub(crate) fn is_probably_occupied(&self, offset: usize) -> bool {
        self.entry
            .chunk
            .load()
            .is_some_and(|chunk| chunk.is_probably_occupied(offset))
    }

    #[allow(dead_code)]
    pub(crate) fn probably_occupied_offsets(&self) -> Vec<usize> {
        self.entry.chunk.load().map_or_else(Vec::new, |chunk| {
            chunk.probably_occupied_offsets().collect()
        })
    }

    pub(crate) fn task_id(&self, offset: usize) -> TaskId {
        let mut raw = (self.base_id + offset) as u32;
        if self.transient {
            raw |= TRANSIENT_TASK_BIT;
        }
        TaskId::try_from(raw).expect("occupied task slots always have valid task IDs")
    }
}

struct LoadedTaskChunk<'a, T: TaskSlotValue + Send + 'static> {
    // Keep this guard alive while any borrowed per-task guard exists.
    chunk: AtomGuard<'a, TaskChunk<T>>,
    owner: TaskChunkRef<'a, T>,
}

impl<T: TaskSlotValue + Send + 'static> Drop for LoadedTaskChunk<'_, T> {
    fn drop(&mut self) {
        // Kovan reservations are thread-local and remain published after Guard drop. Flushing each
        // scan worker keeps a large eviction/snapshot/GC pass from leaving its worker idle with a
        // stale reservation. Physical reclamation remains eventual for unrelated idle workers.
        kovan::flush();
    }
}

impl<T: TaskSlotValue + Send + 'static> LoadedTaskChunk<'_, T> {
    fn for_each_mut(&self, mut f: impl FnMut(TaskMapGuard<'_, T>)) {
        for offset in self.chunk.probably_occupied_offsets() {
            if let Some(task) = self.get(offset) {
                f(task);
            }
        }
    }

    fn get(&self, offset: usize) -> Option<TaskMapGuard<'_, T>> {
        if !self.chunk.is_probably_occupied(offset) {
            return None;
        }
        let value = self.chunk.lock_raw(offset);
        // SAFETY: this thread owns the value's intrusive lock.
        if !unsafe { &*value }.is_occupied() {
            self.chunk.clear_probably_occupied(offset);
            // SAFETY: `lock_raw` acquired this same value's lock on this thread.
            unsafe { T::unlock_raw(value) };
            return None;
        }
        Some(TaskMapGuard {
            key: self.owner.task_id(offset),
            value_ptr: value,
            _protection: None,
            modified_count: &self.chunk.modified_count,
            occupied_count: &self.chunk.occupied_count,
            entry: self.owner.entry,
            len: self.owner.len,
            _lifetime: PhantomData,
            _not_send: PhantomData,
        })
    }
}

pub(crate) struct TaskMapGuard<'a, T: TaskSlotValue + Send + 'static> {
    key: TaskId,
    value_ptr: *mut T,
    // Point access owns protection through unlock. Chunk scans borrow protection from their
    // LoadedTaskChunk, represented by `_lifetime`, and finish each callback before it drops.
    _protection: Option<AtomGuard<'a, TaskChunk<T>>>,
    modified_count: *const AtomicU64,
    occupied_count: *const AtomicUsize,
    entry: &'a ChunkDirectoryEntry<T>,
    len: &'a AtomicUsize,
    _lifetime: PhantomData<&'a TaskChunk<T>>,
    _not_send: PhantomData<Rc<()>>,
}

impl<'a, T: TaskSlotValue + Send + 'static> TaskMapGuard<'a, T> {
    fn new_owned(
        key: TaskId,
        protection: AtomGuard<'a, TaskChunk<T>>,
        entry: &'a ChunkDirectoryEntry<T>,
        offset: usize,
        len: &'a AtomicUsize,
        clear_stale_hint: bool,
    ) -> Option<Self> {
        let chunk = &*protection as *const TaskChunk<T>;
        // SAFETY: the AtomGuard keeps the raw chunk alive and is moved into the returned guard.
        let value = unsafe { (&*chunk).lock_raw(offset) };
        // SAFETY: this thread owns the value's intrusive lock.
        if !unsafe { &*value }.is_occupied() {
            if clear_stale_hint {
                // Bulk scans converge stale-positive hints after taking the task lock.
                unsafe { &*chunk }.clear_probably_occupied(offset);
            }
            // SAFETY: `lock_raw` acquired this same value's lock on this thread.
            unsafe { T::unlock_raw(value) };
            return None;
        }
        Some(Self::new_locked(
            key,
            value,
            Some(protection),
            entry,
            chunk,
            len,
        ))
    }

    fn new_locked(
        key: TaskId,
        value_ptr: *mut T,
        protection: Option<AtomGuard<'a, TaskChunk<T>>>,
        entry: &'a ChunkDirectoryEntry<T>,
        chunk: *const TaskChunk<T>,
        len: &'a AtomicUsize,
    ) -> Self {
        Self {
            key,
            value_ptr,
            _protection: protection,
            // SAFETY: owned guards retain Kovan protection; borrowed scan guards cannot outlive
            // their LoadedTaskChunk protection.
            modified_count: unsafe { std::ptr::addr_of!((*chunk).modified_count) },
            occupied_count: unsafe { std::ptr::addr_of!((*chunk).occupied_count) },
            entry,
            len,
            _lifetime: PhantomData,
            _not_send: PhantomData,
        }
    }

    pub(crate) fn key(&self) -> &TaskId {
        &self.key
    }

    pub(crate) fn modified_count(&self) -> &AtomicU64 {
        // SAFETY: owned point guards retain Kovan protection; borrowed scan guards cannot outlive
        // their LoadedTaskChunk protection.
        unsafe { &*self.modified_count }
    }

    pub(crate) fn modified_count_ptr(&self) -> *const AtomicU64 {
        self.modified_count
    }

    fn finish_vacate(&self) {
        self.len.fetch_sub(1, Ordering::Relaxed);
        // SAFETY: Kovan protection remains live through this handoff.
        if unsafe { &*self.occupied_count }.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.entry.retire_candidate.store(true, Ordering::Release);
        }
    }

    pub(crate) fn take_and_vacate(self) -> T {
        // SAFETY: this guard owns the value's intrusive lock.
        let detached = unsafe { &mut *self.value_ptr }.take_and_vacate();
        // Leave the advisory bit set. A later scan locks, observes authoritative vacancy, and
        // clears it. Immediate ID reuse therefore needs no bitmap clear/set round trip.
        self.finish_vacate();
        detached
    }

    pub(crate) fn vacate(self) {
        // SAFETY: this guard owns the value's intrusive lock.
        unsafe { &mut *self.value_ptr }.vacate_in_place();
        self.finish_vacate();
    }
}

impl<T: TaskSlotValue + Send + 'static> Deref for TaskMapGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: this guard owns the value's intrusive lock.
        unsafe { &*self.value_ptr }
    }
}

impl<T: TaskSlotValue + Send + 'static> DerefMut for TaskMapGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: this guard exclusively owns the value's intrusive lock.
        unsafe { &mut *self.value_ptr }
    }
}

impl<T: TaskSlotValue + Send + 'static> Drop for TaskMapGuard<'_, T> {
    fn drop(&mut self) {
        // SAFETY: construction acquired this value's lock and the guard is !Send. This runs before
        // fields are dropped, so owned Kovan protection remains live through unlock.
        unsafe { T::unlock_raw(self.value_ptr) };
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            Arc, Barrier,
            atomic::{AtomicUsize, Ordering},
        },
        thread,
    };

    use parking_lot::{Mutex, lock_api::RawMutex as _};
    use turbo_tasks::TRANSIENT_TASK_BIT;

    use super::*;

    struct TestValue {
        lock: Mutex<()>,
        occupied: bool,
        value: usize,
    }

    impl TestValue {
        fn set(&mut self, value: usize) {
            self.value = value;
        }
    }

    // SAFETY: The raw lock is always initialized, is never moved after publication, and all
    // payload/presence access in TaskMap goes through its guard.
    unsafe impl TaskSlotValue for TestValue {
        const EMPTY: Self = Self {
            lock: Mutex::new(()),
            occupied: false,
            value: 0,
        };

        unsafe fn lock_raw(value: *const Self) {
            // SAFETY: the caller provides a live, stable TestValue pointer.
            let lock = unsafe { &*std::ptr::addr_of!((*value).lock) };
            unsafe { lock.raw() }.lock();
        }

        unsafe fn unlock_raw(value: *const Self) {
            // SAFETY: the current thread owns the lock acquired from this value.
            let lock = unsafe { &*std::ptr::addr_of!((*value).lock) };
            let raw = unsafe { lock.raw() };
            unsafe { raw.unlock() };
        }

        fn is_occupied(&self) -> bool {
            self.occupied
        }

        fn occupy(&mut self) {
            assert!(!self.occupied);
            self.occupied = true;
        }

        fn take_and_vacate(&mut self) -> Self {
            assert!(self.occupied);
            let value = self.value;
            self.value = 0;
            self.occupied = false;
            Self {
                lock: Mutex::new(()),
                occupied: false,
                value,
            }
        }

        fn vacate_in_place(&mut self) {
            assert!(self.occupied);
            self.value = 0;
            self.occupied = false;
        }
    }

    fn task_id(raw: u32) -> TaskId {
        TaskId::try_from(raw).unwrap()
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn directory_entry_is_compact() {
        assert_eq!(std::mem::size_of::<ChunkDirectoryEntry<TestValue>>(), 16);
    }

    #[test]
    fn grows_across_chunk_boundaries_and_reuses_slots() {
        let map = TaskMap::<TestValue>::new(true);
        for raw in [
            1,
            CHUNK_SIZE as u32 - 1,
            CHUNK_SIZE as u32,
            CHUNK_SIZE as u32 + 1,
        ] {
            map.get_or_insert(task_id(raw)).set(raw as usize);
        }
        assert_eq!(map.len(), 4);
        assert_eq!(
            map.get(task_id(CHUNK_SIZE as u32)).unwrap().value,
            CHUNK_SIZE
        );
        assert_eq!(
            map.remove(task_id(CHUNK_SIZE as u32)).unwrap().value,
            CHUNK_SIZE
        );
        assert!(map.get(task_id(CHUNK_SIZE as u32)).is_none());
        map.get_or_insert(task_id(CHUNK_SIZE as u32)).set(7);
        assert_eq!(map.get(task_id(CHUNK_SIZE as u32)).unwrap().value, 7);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn clear_drops_all_namespaces_in_parallel() {
        let map = TaskMap::<TestValue>::new(true);
        for raw in [1, CHUNK_SIZE as u32 + 1, 7 | TRANSIENT_TASK_BIT] {
            map.get_or_insert(task_id(raw)).set(raw as usize);
        }
        map.clear();
        assert_eq!(map.len(), 0);
        assert!(map.get(task_id(1)).is_none());
        assert!(map.get(task_id(CHUNK_SIZE as u32 + 1)).is_none());
        assert!(map.get(task_id(7 | TRANSIENT_TASK_BIT)).is_none());
    }

    #[test]
    fn persistent_and_transient_namespaces_do_not_alias() {
        let map = TaskMap::<TestValue>::new(true);
        map.get_or_insert(task_id(7)).set(1);
        map.get_or_insert(task_id(7 | TRANSIENT_TASK_BIT)).set(2);
        assert_eq!(map.get(task_id(7)).unwrap().value, 1);
        assert_eq!(map.get(task_id(7 | TRANSIENT_TASK_BIT)).unwrap().value, 2);
    }

    #[test]
    fn concurrent_first_access_initializes_once() {
        let map = Arc::new(TaskMap::<TestValue>::new(true));
        let barrier = Arc::new(Barrier::new(9));
        let initializations = Arc::new(AtomicUsize::new(0));
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let map = map.clone();
                let barrier = barrier.clone();
                let initializations = initializations.clone();
                thread::spawn(move || {
                    barrier.wait();
                    let mut value = map.get_or_insert(task_id(1));
                    if value.value == 0 {
                        initializations.fetch_add(1, Ordering::Relaxed);
                        value.value = 42;
                    }
                    assert_eq!(value.value, 42);
                })
            })
            .collect();
        barrier.wait();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(initializations.load(Ordering::Relaxed), 1);
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn concurrent_growth_preserves_existing_entries() {
        let map = Arc::new(TaskMap::<TestValue>::new(true));
        map.get_or_insert(task_id(1)).set(1);
        let barrier = Arc::new(Barrier::new(9));
        let threads: Vec<_> = (0..8)
            .map(|thread_index| {
                let map = map.clone();
                let barrier = barrier.clone();
                thread::spawn(move || {
                    barrier.wait();
                    for chunk in 1..32 {
                        let raw = (chunk * CHUNK_SIZE + thread_index + 1) as u32;
                        map.get_or_insert(task_id(raw)).set(raw as usize);
                        assert_eq!(map.get(task_id(1)).unwrap().value, 1);
                    }
                })
            })
            .collect();
        barrier.wait();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(map.len(), 1 + 8 * 31);
    }

    #[test]
    fn stale_bitmap_bit_is_safely_rechecked() {
        let map = TaskMap::<TestValue>::new(true);
        let id = task_id(1);
        map.get_or_insert(id);
        let chunk = map.chunks()[0];
        // Vacating deliberately leaves the advisory bit set to avoid remove/reinsert churn.
        assert!(map.remove_discard(id));
        assert!(chunk.is_probably_occupied(1));
        assert!(map.get(id).is_none());
        assert!(
            chunk.is_probably_occupied(1),
            "point misses leave hint cleanup to bulk scans"
        );
        assert!(chunk.get(1).is_none());
        assert!(!chunk.is_probably_occupied(1));
    }

    #[test]
    fn empty_chunk_is_detached_and_republished() {
        let map = TaskMap::<TestValue>::new(true);
        let id = task_id(1);

        map.get_or_insert(id).set(1);
        assert_eq!(map.loaded_chunk_count(), 1);
        assert!(map.remove_discard(id));
        assert_eq!(map.retire_empty_chunks(), 1);
        assert_eq!(map.loaded_chunk_count(), 0);

        map.get_or_insert(id).set(2);
        assert_eq!(map.loaded_chunk_count(), 1);
        assert_eq!(map.get(id).unwrap().value, 2);
    }

    #[test]
    fn protected_stale_chunk_survives_detach_until_guard_drops() {
        let map = TaskMap::<TestValue>::new(true);
        let id = task_id(1);
        map.get_or_insert(id).set(1);
        let entry = map.persistent.entry(1).unwrap();
        let protection = entry.chunk.load().unwrap();
        let chunk = &*protection as *const TaskChunk<TestValue>;
        assert!(map.remove_discard(id));
        assert_eq!(map.retire_empty_chunks(), 1);
        assert_eq!(map.loaded_chunk_count(), 0);
        // SAFETY: the protection guard was acquired before detach and still pins the old chunk.
        let stale = unsafe { (&*chunk).lock(1) };
        assert!(!stale.is_occupied());
        drop(stale);
        drop(protection);
    }

    #[test]
    fn insertion_racing_empty_chunk_retirement_preserves_a_valid_slot() {
        let map = Arc::new(TaskMap::<TestValue>::new(true));
        let id = task_id(1);
        for round in 1..=500 {
            map.get_or_insert(id).set(round);
            let barrier = Arc::new(Barrier::new(3));
            thread::scope(|scope| {
                let remove_map = map.clone();
                let remove_barrier = barrier.clone();
                scope.spawn(move || {
                    remove_barrier.wait();
                    if remove_map.remove_discard(id) {
                        remove_map.retire_empty_chunks();
                    }
                });
                let insert_map = map.clone();
                let insert_barrier = barrier.clone();
                scope.spawn(move || {
                    insert_barrier.wait();
                    insert_map.get_or_insert(id).set(round + 1);
                });
                barrier.wait();
            });

            assert!(map.len() <= 1);
            if let Some(task) = map.get(id) {
                assert_eq!(task.value, round + 1);
            } else {
                assert_eq!(map.len(), 0);
            }
        }
    }

    #[test]
    fn occupied_chunk_is_not_retired_from_a_stale_candidate() {
        let map = TaskMap::<TestValue>::new(true);
        let id = task_id(1);
        let task = map.get_or_insert(id);
        let entry = map.persistent.entry(1).unwrap();
        entry.retire_candidate.store(true, Ordering::Release);
        assert_eq!(map.retire_empty_chunks(), 0);
        assert_eq!(map.loaded_chunk_count(), 1);
        drop(task);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn parallel_collect_visits_dense_and_sparse_entries_once() {
        let map = TaskMap::<TestValue>::new(true);
        let ids = [1, 2, CHUNK_SIZE as u32 + 3, (CHUNK_SIZE * 4) as u32 + 5];
        for raw in ids {
            map.get_or_insert(task_id(raw)).set(raw as usize);
        }
        let groups: Vec<Vec<u32>> = map.parallel_collect(|chunk| {
            let mut seen = Vec::new();
            chunk.for_each_mut(|mut task| {
                task.value ^= 0;
                seen.push(**task.key());
            });
            seen
        });
        let mut seen: Vec<_> = groups.into_iter().flatten().collect();
        seen.sort_unstable();
        assert_eq!(seen, ids);
    }
}
