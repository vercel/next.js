//! Sparse, directly indexed resident task storage.
//!
//! The permanent `boxcar::Vec` directory has one entry per 128 historical task IDs. Each entry
//! optionally owns a 128-pointer page, and each non-null pointer owns one boxed resident task.
//! Pointer pages and tasks are detached only while the operation coordinator holds exclusion, so
//! ordinary admitted operations need only acquire-load pointers and take the task's intrusive lock.

use std::{
    marker::PhantomData,
    ops::{Deref, DerefMut},
    ptr,
    rc::Rc,
    sync::atomic::{AtomicPtr, AtomicU8, AtomicU64, Ordering},
};

use turbo_tasks::{TRANSIENT_TASK_BIT, TaskId, parallel};

pub(crate) const PAGE_SHIFT: usize = 7;
pub(crate) const PAGE_SIZE: usize = 1 << PAGE_SHIFT;
const PAGE_MASK: usize = PAGE_SIZE - 1;
const BITMAP_WORD_BITS: usize = u64::BITS as usize;
pub(crate) const BITMAP_WORDS: usize = PAGE_SIZE / BITMAP_WORD_BITS;
const _: () = assert!(PAGE_SIZE <= u8::MAX as usize);

/// Opaque proof that resident pointers are protected by a live operation admission or exclusion.
///
/// The token is intentionally not an owning guard. Its creator must keep the matching operation
/// guard or exclusion phase alive until every task guard carrying this token has been dropped.
#[derive(Clone, Copy)]
pub(crate) struct StorageAccessToken<'a> {
    kind: AccessKind,
    _lifetime: PhantomData<&'a ()>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AccessKind {
    Operation,
    Exclusive,
}

impl StorageAccessToken<'_> {
    pub(crate) fn operation() -> Self {
        Self {
            kind: AccessKind::Operation,
            _lifetime: PhantomData,
        }
    }

    pub(crate) fn exclusive() -> Self {
        Self {
            kind: AccessKind::Exclusive,
            _lifetime: PhantomData,
        }
    }

    fn assert_exclusive(self) {
        assert!(
            self.kind == AccessKind::Exclusive,
            "resident task removal requires coordinator exclusion"
        );
    }
}

/// Value stored behind one independently allocated resident pointer.
///
/// # Safety
///
/// Implementations must initialize their intrusive lock in `new`, and every shared payload access
/// must be protected by `lock_raw`/`unlock_raw`. A published value remains at a stable boxed
/// address until an exclusive storage phase removes it.
pub(crate) unsafe trait TaskSlotValue: Sized {
    fn new() -> Self;

    /// # Safety
    /// `value` must point to a live, stably-addressed value.
    unsafe fn lock_raw(value: *const Self);

    /// # Safety
    /// The current thread must own the lock acquired through the same pointer.
    unsafe fn unlock_raw(value: *const Self);
}

struct TaskPointerPage<T: TaskSlotValue + Send + 'static> {
    pub(crate) modified_count: AtomicU8,
    occupied_count: AtomicU8,
    occupied: [AtomicU64; BITMAP_WORDS],
    slots: [AtomicPtr<T>; PAGE_SIZE],
}

impl<T: TaskSlotValue + Send + 'static> TaskPointerPage<T> {
    fn new() -> Self {
        Self {
            modified_count: AtomicU8::new(0),
            occupied_count: AtomicU8::new(0),
            occupied: [const { AtomicU64::new(0) }; BITMAP_WORDS],
            slots: [const { AtomicPtr::new(ptr::null_mut()) }; PAGE_SIZE],
        }
    }

    fn word_and_mask(offset: usize) -> (usize, u64) {
        (offset / BITMAP_WORD_BITS, 1 << (offset % BITMAP_WORD_BITS))
    }

    fn mark_occupied(&self, offset: usize) {
        let (word, mask) = Self::word_and_mask(offset);
        self.occupied[word].fetch_or(mask, Ordering::Release);
    }

    fn clear_occupied(&self, offset: usize) {
        let (word, mask) = Self::word_and_mask(offset);
        self.occupied[word].fetch_and(!mask, Ordering::Release);
    }

    fn is_occupied(&self, offset: usize) -> bool {
        let (word, mask) = Self::word_and_mask(offset);
        self.occupied[word].load(Ordering::Acquire) & mask != 0
    }

    fn occupied_offsets(&self) -> OccupiedOffsets<'_> {
        OccupiedOffsets {
            words: &self.occupied,
            word_index: 0,
            bits: 0,
        }
    }

    fn lock_slot(&self, offset: usize) -> Option<*mut T> {
        if !self.is_occupied(offset) {
            return None;
        }
        let value = self.slots[offset].load(Ordering::Acquire);
        if value.is_null() {
            // A losing insertion may leave a stale positive hint. Physical deletion cannot race an
            // admitted reader, so null is authoritative and this hint is safe to clean up.
            self.clear_occupied(offset);
            return None;
        }
        // SAFETY: operation/exclusion admission keeps the box live, and this page is still live.
        unsafe { T::lock_raw(value) };
        Some(value)
    }
}

impl<T: TaskSlotValue + Send + 'static> Drop for TaskPointerPage<T> {
    fn drop(&mut self) {
        for slot in &mut self.slots {
            let value = *slot.get_mut();
            if !value.is_null() {
                // SAFETY: page destruction requires exclusive access, so no task guard exists.
                unsafe { drop(Box::from_raw(value)) };
            }
        }
    }
}

pub(crate) struct OccupiedOffsets<'a> {
    words: &'a [AtomicU64; BITMAP_WORDS],
    word_index: usize,
    bits: u64,
}

impl Iterator for OccupiedOffsets<'_> {
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

struct PageDirectoryEntry<T: TaskSlotValue + Send + 'static> {
    page: AtomicPtr<TaskPointerPage<T>>,
}

impl<T: TaskSlotValue + Send + 'static> PageDirectoryEntry<T> {
    fn new() -> Self {
        Self {
            page: AtomicPtr::new(ptr::null_mut()),
        }
    }

    fn load(&self) -> Option<&TaskPointerPage<T>> {
        let page = self.page.load(Ordering::Acquire);
        if page.is_null() {
            None
        } else {
            // SAFETY: every caller holds operation/exclusion access, so a published page cannot be
            // detached or freed for the duration of the returned use.
            Some(unsafe { &*page })
        }
    }

    fn get_or_insert(&self) -> &TaskPointerPage<T> {
        if let Some(page) = self.load() {
            return page;
        }
        let new_page = Box::into_raw(Box::new(TaskPointerPage::new()));
        match self.page.compare_exchange(
            ptr::null_mut(),
            new_page,
            Ordering::Release,
            Ordering::Acquire,
        ) {
            Ok(_) => {
                // SAFETY: this thread published and owns the stable page allocation.
                unsafe { &*new_page }
            }
            Err(page) => {
                // SAFETY: publication failed, so no other thread can observe this allocation.
                unsafe { drop(Box::from_raw(new_page)) };
                debug_assert!(!page.is_null());
                // SAFETY: the winning publisher release-initialized the page; acquire failure
                // ordering observes it, and operation access prevents detachment.
                unsafe { &*page }
            }
        }
    }

    fn detach_if_empty(&self, access: StorageAccessToken<'_>) -> bool {
        access.assert_exclusive();
        let page = self.page.load(Ordering::Acquire);
        if page.is_null() {
            return false;
        }
        // SAFETY: exclusion prevents pointer users and publishers.
        if unsafe { &*page }.occupied_count.load(Ordering::Acquire) != 0 {
            return false;
        }
        let detached = self.page.swap(ptr::null_mut(), Ordering::AcqRel);
        debug_assert_eq!(detached, page);
        // SAFETY: exclusion proves no task/page guard exists and this pointer was detached once.
        unsafe { drop(Box::from_raw(detached)) };
        true
    }

    fn clear(&self, access: StorageAccessToken<'_>) {
        access.assert_exclusive();
        let page = self.page.swap(ptr::null_mut(), Ordering::AcqRel);
        if !page.is_null() {
            // SAFETY: exclusion proves no pointer user exists and the swap transferred ownership.
            unsafe { drop(Box::from_raw(page)) };
        }
    }
}

struct PagedVec<T: TaskSlotValue + Send + 'static> {
    entries: boxcar::Vec<PageDirectoryEntry<T>>,
}

impl<T: TaskSlotValue + Send + 'static> PagedVec<T> {
    fn with_page_capacity(page_capacity: usize) -> Self {
        Self {
            entries: boxcar::Vec::with_capacity(page_capacity),
        }
    }

    fn entry(&self, index: usize) -> Option<&PageDirectoryEntry<T>> {
        self.entries.get(index >> PAGE_SHIFT)
    }

    fn get_or_create_entry(&self, index: usize) -> &PageDirectoryEntry<T> {
        let page_index = index >> PAGE_SHIFT;
        if let Some(entry) = self.entries.get(page_index) {
            return entry;
        }
        while self.entries.count() <= page_index {
            self.entries.push(PageDirectoryEntry::new());
        }
        loop {
            if let Some(entry) = self.entries.get(page_index) {
                return entry;
            }
            std::hint::spin_loop();
        }
    }

    fn entries(&self) -> impl Iterator<Item = (usize, &PageDirectoryEntry<T>)> {
        self.entries.iter()
    }

    fn live_pages<'a>(
        &'a self,
        access: StorageAccessToken<'a>,
        transient: bool,
    ) -> Vec<TaskPageRef<'a, T>> {
        self.entries()
            .filter_map(|(index, entry)| {
                entry.load().map(|page| TaskPageRef {
                    page,
                    base_id: index << PAGE_SHIFT,
                    transient,
                    access,
                })
            })
            .collect()
    }

    fn len(&self) -> usize {
        self.entries()
            .filter_map(|(_, entry)| entry.load())
            .map(|page| page.occupied_count.load(Ordering::Relaxed) as usize)
            .sum()
    }

    fn clear(&self, access: StorageAccessToken<'_>) {
        access.assert_exclusive();
        for (_, entry) in self.entries() {
            entry.clear(access);
        }
    }

    fn reclaim_empty_pages(&self, access: StorageAccessToken<'_>) -> usize {
        access.assert_exclusive();
        self.entries()
            .filter(|(_, entry)| entry.detach_if_empty(access))
            .count()
    }

    #[cfg(test)]
    fn live_page_count(&self) -> usize {
        self.entries()
            .filter(|(_, entry)| !entry.page.load(Ordering::Acquire).is_null())
            .count()
    }
}

impl<T: TaskSlotValue + Send + 'static> Drop for PagedVec<T> {
    fn drop(&mut self) {
        for index in 0..self.entries.count() {
            let entry = self
                .entries
                .get_mut(index)
                .expect("all Boxcar entries below count are initialized");
            let page = *entry.page.get_mut();
            if !page.is_null() {
                // SAFETY: `&mut self` proves no directory/page users remain.
                unsafe { drop(Box::from_raw(page)) };
            }
        }
    }
}

pub(crate) struct TaskMap<T: TaskSlotValue + Send + 'static> {
    persistent: PagedVec<T>,
    transient: PagedVec<T>,
}

impl<T: TaskSlotValue + Send + 'static> TaskMap<T> {
    pub(crate) fn new(small_preallocation: bool) -> Self {
        let persistent_page_capacity = if small_preallocation {
            1
        } else {
            (1024 * 1024) / PAGE_SIZE
        };
        Self {
            persistent: PagedVec::with_page_capacity(persistent_page_capacity),
            transient: PagedVec::with_page_capacity(1),
        }
    }

    fn id_space(&self, key: TaskId) -> (&PagedVec<T>, usize) {
        let raw = *key as usize;
        if key.is_transient() {
            (&self.transient, raw & !(TRANSIENT_TASK_BIT as usize))
        } else {
            (&self.persistent, raw)
        }
    }

    pub(crate) fn get<'a>(
        &'a self,
        key: TaskId,
        access: StorageAccessToken<'a>,
    ) -> Option<TaskMapGuard<'a, T>> {
        let (namespace, index) = self.id_space(key);
        let entry = namespace.entry(index)?;
        let page = entry.load()?;
        let offset = index & PAGE_MASK;
        let value = page.lock_slot(offset)?;
        Some(TaskMapGuard::new_locked(
            key,
            value,
            &page.slots[offset],
            page,
            access,
        ))
    }

    pub(crate) fn get_or_insert<'a>(
        &'a self,
        key: TaskId,
        access: StorageAccessToken<'a>,
    ) -> TaskMapGuard<'a, T> {
        if let Some(task) = self.get(key, access) {
            return task;
        }
        let (namespace, index) = self.id_space(key);
        let entry = namespace.get_or_create_entry(index);
        let page = entry.get_or_insert();
        let offset = index & PAGE_MASK;
        let slot = &page.slots[offset];
        loop {
            let current = slot.load(Ordering::Acquire);
            if !current.is_null() {
                // This path follows a bitmap miss, so repair a transient/stale false hint before
                // returning the authoritative pointer. Ordinary hits never perform this RMW.
                page.mark_occupied(offset);
                // SAFETY: operation admission keeps the published box live.
                unsafe { T::lock_raw(current) };
                return TaskMapGuard::new_locked(key, current, slot, page, access);
            }

            let new_value = Box::into_raw(Box::new(T::new()));
            // Lock before publication so this creator returns the first mutable guard and racing
            // readers cannot observe a partially initialized caller mutation.
            // SAFETY: `new_value` is a live stable box initialized by `T::new`.
            unsafe { T::lock_raw(new_value) };
            match slot.compare_exchange(
                ptr::null_mut(),
                new_value,
                Ordering::Release,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    // Publish iteration metadata only after the authoritative pointer. Exclusive
                    // scans wait for this operation to finish; concurrent scans may miss this
                    // in-flight insertion, but can never clear a bit before publication.
                    page.mark_occupied(offset);
                    let previous = page.occupied_count.fetch_add(1, Ordering::AcqRel);
                    debug_assert!((previous as usize) < PAGE_SIZE);
                    return TaskMapGuard::new_locked(key, new_value, slot, page, access);
                }
                Err(winner) => {
                    // SAFETY: publication failed; unlock and free the unobserved allocation.
                    unsafe { T::unlock_raw(new_value) };
                    unsafe { drop(Box::from_raw(new_value)) };
                    if !winner.is_null() {
                        page.mark_occupied(offset);
                        // SAFETY: operation admission keeps the winner live.
                        unsafe { T::lock_raw(winner) };
                        return TaskMapGuard::new_locked(key, winner, slot, page, access);
                    }
                }
            }
        }
    }

    pub(crate) fn len(&self, _access: StorageAccessToken<'_>) -> usize {
        self.persistent.len() + self.transient.len()
    }

    pub(crate) fn clear(&self, access: StorageAccessToken<'_>) {
        access.assert_exclusive();
        self.persistent.clear(access);
        self.transient.clear(access);
    }

    pub(crate) fn reclaim_empty_pages(&self, access: StorageAccessToken<'_>) -> usize {
        access.assert_exclusive();
        self.persistent.reclaim_empty_pages(access) + self.transient.reclaim_empty_pages(access)
    }

    #[cfg(test)]
    pub(crate) fn loaded_page_count(&self) -> usize {
        self.persistent.live_page_count() + self.transient.live_page_count()
    }

    #[cfg(test)]
    pub(crate) fn directory_entry_count(&self) -> usize {
        self.persistent.entries.count() + self.transient.entries.count()
    }

    #[cfg(test)]
    pub(crate) fn directory_entry_size() -> usize {
        std::mem::size_of::<PageDirectoryEntry<T>>()
    }

    #[cfg(test)]
    pub(crate) fn pointer_page_size() -> usize {
        std::mem::size_of::<TaskPointerPage<T>>()
    }

    pub(crate) fn parallel_collect<'a, R, C>(
        &'a self,
        access: StorageAccessToken<'a>,
        f: impl Fn(TaskPageRef<'a, T>) -> R + Send + Sync,
    ) -> C
    where
        R: Send + Sync,
        C: FromIterator<R>,
    {
        let pages = self.pages(access);
        parallel::map_collect_owned(pages, f)
    }

    pub(crate) fn pages<'a>(&'a self, access: StorageAccessToken<'a>) -> Vec<TaskPageRef<'a, T>> {
        let mut pages = self.persistent.live_pages(access, false);
        pages.extend(self.transient.live_pages(access, true));
        pages
    }

    pub(crate) fn persistent_pages<'a>(
        &'a self,
        access: StorageAccessToken<'a>,
    ) -> Vec<TaskPageRef<'a, T>> {
        self.persistent.live_pages(access, false)
    }

    pub(crate) fn persistent_page_indices(&self, _access: StorageAccessToken<'_>) -> Vec<usize> {
        self.persistent
            .entries()
            .filter_map(|(index, entry)| {
                (!entry.page.load(Ordering::Acquire).is_null()).then_some(index)
            })
            .collect()
    }

    pub(crate) fn persistent_page<'a>(
        &'a self,
        index: usize,
        access: StorageAccessToken<'a>,
    ) -> Option<TaskPageRef<'a, T>> {
        let entry = self.persistent.entries.get(index)?;
        let page = entry.load()?;
        Some(TaskPageRef {
            page,
            base_id: index << PAGE_SHIFT,
            transient: false,
            access,
        })
    }
}

#[derive(Clone, Copy)]
pub(crate) struct TaskPageRef<'a, T: TaskSlotValue + Send + 'static> {
    page: &'a TaskPointerPage<T>,
    base_id: usize,
    transient: bool,
    access: StorageAccessToken<'a>,
}

impl<'a, T: TaskSlotValue + Send + 'static> TaskPageRef<'a, T> {
    pub(crate) fn for_each_mut(&self, mut f: impl FnMut(TaskMapGuard<'a, T>)) {
        for offset in self.page.occupied_offsets() {
            if let Some(value) = self.page.lock_slot(offset) {
                f(TaskMapGuard::new_locked(
                    self.task_id(offset),
                    value,
                    &self.page.slots[offset],
                    self.page,
                    self.access,
                ));
            }
        }
    }

    #[allow(dead_code)]
    pub(crate) fn for_each_all_mut(&self, mut f: impl FnMut(TaskMapGuard<'a, T>)) {
        for offset in 0..PAGE_SIZE {
            if let Some(value) = self.page.lock_slot(offset) {
                f(TaskMapGuard::new_locked(
                    self.task_id(offset),
                    value,
                    &self.page.slots[offset],
                    self.page,
                    self.access,
                ));
            }
        }
    }

    #[allow(dead_code)]
    pub(crate) fn get(&self, offset: usize) -> Option<TaskMapGuard<'a, T>> {
        let value = self.page.lock_slot(offset)?;
        Some(TaskMapGuard::new_locked(
            self.task_id(offset),
            value,
            &self.page.slots[offset],
            self.page,
            self.access,
        ))
    }

    pub(crate) fn take_modified_count(&self) -> Option<u8> {
        Some(self.page.modified_count.swap(0, Ordering::AcqRel))
    }

    pub(crate) fn modified_count(&self) -> u8 {
        self.page.modified_count.load(Ordering::Relaxed)
    }

    #[allow(dead_code)]
    pub(crate) fn is_probably_occupied(&self, offset: usize) -> bool {
        self.page.is_occupied(offset)
    }

    #[allow(dead_code)]
    pub(crate) fn probably_occupied_offsets(&self) -> Vec<usize> {
        self.page.occupied_offsets().collect()
    }

    fn task_id(&self, offset: usize) -> TaskId {
        let mut raw = self.base_id + offset;
        if self.transient {
            raw |= TRANSIENT_TASK_BIT as usize;
        }
        TaskId::new(raw as u32).expect("occupied task slot must have a valid TaskId")
    }
}

/// Exclusive access to one boxed resident task.
pub(crate) struct TaskMapGuard<'a, T: TaskSlotValue + Send + 'static> {
    key: TaskId,
    value_ptr: *mut T,
    slot: &'a AtomicPtr<T>,
    page: &'a TaskPointerPage<T>,
    access: StorageAccessToken<'a>,
    locked: bool,
    _not_send: PhantomData<Rc<()>>,
}

impl<'a, T: TaskSlotValue + Send + 'static> TaskMapGuard<'a, T> {
    fn new_locked(
        key: TaskId,
        value: *mut T,
        slot: &'a AtomicPtr<T>,
        page: &'a TaskPointerPage<T>,
        access: StorageAccessToken<'a>,
    ) -> Self {
        Self {
            key,
            value_ptr: value,
            slot,
            page,
            access,
            locked: true,
            _not_send: PhantomData,
        }
    }

    pub(crate) fn key(&self) -> &TaskId {
        &self.key
    }

    pub(crate) fn modified_count(&self) -> &AtomicU8 {
        &self.page.modified_count
    }

    pub(crate) fn modified_count_ptr(&self) -> *const AtomicU8 {
        &self.page.modified_count
    }

    fn remove_box(mut self) -> Box<T> {
        self.access.assert_exclusive();
        let removed = self
            .slot
            .compare_exchange(
                self.value_ptr,
                ptr::null_mut(),
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .expect("exclusive task removal must detach the guarded pointer");
        debug_assert_eq!(removed, self.value_ptr);
        let raw = *self.key as usize & !(TRANSIENT_TASK_BIT as usize);
        self.page.clear_occupied(raw & PAGE_MASK);
        let previous = self.page.occupied_count.fetch_sub(1, Ordering::AcqRel);
        debug_assert!(previous > 0);
        // Unlock before transferring/dropping allocation ownership: the mutex lives inside T.
        // SAFETY: this guard owns the intrusive lock acquired through `self.value`.
        unsafe { T::unlock_raw(self.value_ptr) };
        self.locked = false;
        // SAFETY: compare_exchange transferred the one published box allocation to this guard.
        unsafe { Box::from_raw(self.value_ptr) }
    }

    pub(crate) fn take_and_vacate(self) -> T {
        *self.remove_box()
    }

    pub(crate) fn vacate(self) {
        drop(self.remove_box());
    }
}

impl<T: TaskSlotValue + Send + 'static> Deref for TaskMapGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: this guard owns the pointed-to task's intrusive lock and operation/exclusion
        // access keeps the allocation alive.
        unsafe { &*self.value_ptr }
    }
}

impl<T: TaskSlotValue + Send + 'static> DerefMut for TaskMapGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: this guard exclusively owns the pointed-to task's intrusive lock.
        unsafe { &mut *self.value_ptr }
    }
}

impl<T: TaskSlotValue + Send + 'static> Drop for TaskMapGuard<'_, T> {
    fn drop(&mut self) {
        if self.locked {
            // SAFETY: construction acquired this lock and the guard is !Send.
            unsafe { T::unlock_raw(self.value_ptr) };
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier},
        thread,
    };

    use parking_lot::{Mutex, lock_api::RawMutex as _};
    use static_assertions::assert_not_impl_any;

    use super::*;

    struct TestValue {
        lock: Mutex<()>,
        value: u64,
    }

    // SAFETY: every payload access is protected by `lock` and values stay boxed while admitted.
    unsafe impl TaskSlotValue for TestValue {
        fn new() -> Self {
            Self {
                lock: Mutex::new(()),
                value: 0,
            }
        }

        unsafe fn lock_raw(value: *const Self) {
            // SAFETY: guaranteed by TaskSlotValue's caller contract.
            unsafe { (&*ptr::addr_of!((*value).lock)).raw().lock() };
        }

        unsafe fn unlock_raw(value: *const Self) {
            // SAFETY: caller owns the same raw lock.
            unsafe { (&*ptr::addr_of!((*value).lock)).raw().unlock() };
        }
    }

    fn task_id(raw: u32) -> TaskId {
        TaskId::new(raw).unwrap()
    }

    fn operation() -> StorageAccessToken<'static> {
        StorageAccessToken::operation()
    }

    fn exclusive() -> StorageAccessToken<'static> {
        StorageAccessToken::exclusive()
    }

    assert_not_impl_any!(TaskMapGuard<'static, TestValue>: Send, Sync);

    #[test]
    fn page_boundary_and_reclamation() {
        let map = TaskMap::<TestValue>::new(true);
        map.get_or_insert(task_id(127), operation()).value = 1;
        map.get_or_insert(task_id(128), operation()).value = 2;
        assert_eq!(map.loaded_page_count(), 2);
        map.get(task_id(127), exclusive()).unwrap().vacate();
        assert_eq!(map.reclaim_empty_pages(exclusive()), 1);
        assert_eq!(map.loaded_page_count(), 1);
        map.get(task_id(128), exclusive()).unwrap().vacate();
        assert_eq!(map.reclaim_empty_pages(exclusive()), 1);
        assert_eq!(map.loaded_page_count(), 0);
        map.get_or_insert(task_id(128), operation()).value = 3;
        assert_eq!(map.get(task_id(128), operation()).unwrap().value, 3);
    }

    #[test]
    fn sparse_high_id_allocates_one_page() {
        let map = TaskMap::<TestValue>::new(true);
        map.get_or_insert(task_id(1_000_000), operation());
        assert_eq!(map.loaded_page_count(), 1);
        assert_eq!(map.directory_entry_count(), (1_000_000 >> PAGE_SHIFT) + 1);
    }

    #[test]
    fn transient_and_persistent_namespaces_do_not_alias() {
        let map = TaskMap::<TestValue>::new(true);
        let persistent = task_id(1);
        let transient = task_id(1 | TRANSIENT_TASK_BIT);
        map.get_or_insert(persistent, operation()).value = 10;
        map.get_or_insert(transient, operation()).value = 20;
        assert_eq!(map.get(persistent, operation()).unwrap().value, 10);
        assert_eq!(map.get(transient, operation()).unwrap().value, 20);
    }

    #[test]
    fn concurrent_first_insertion_has_one_winner() {
        let map = Arc::new(TaskMap::<TestValue>::new(true));
        let barrier = Arc::new(Barrier::new(8));
        let threads = (0..8)
            .map(|_| {
                let map = Arc::clone(&map);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    map.get_or_insert(task_id(1), operation()).value += 1;
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(map.len(operation()), 1);
        assert_eq!(map.get(task_id(1), operation()).unwrap().value, 8);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn parallel_collect_seeds_only_live_pages() {
        let map = TaskMap::<TestValue>::new(true);
        for id in [1, 130, 1_000_000] {
            map.get_or_insert(task_id(id), operation());
        }
        let counts: Vec<usize> = map.parallel_collect(operation(), |page| {
            let mut count = 0;
            page.for_each_mut(|_| count += 1);
            count
        });
        assert_eq!(counts.len(), 3);
        assert_eq!(counts.into_iter().sum::<usize>(), 3);

        map.clear(exclusive());
        let counts: Vec<usize> = map.parallel_collect(operation(), |_| 1);
        assert!(counts.is_empty());
        assert_eq!(map.loaded_page_count(), 0);
    }
}
