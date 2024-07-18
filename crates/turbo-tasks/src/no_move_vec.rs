use std::{
    ptr::null_mut,
    slice::from_raw_parts_mut,
    sync::{
        atomic::{AtomicPtr, Ordering},
        Mutex,
    },
};

const BUCKETS: usize = (usize::BITS + 1) as usize;

/// An `Option`-like type that guarantees that a fully zeroed value is a valid
/// `None` variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
enum COption<T> {
    // TODO(alexkirsz) We need a way to guarantee that a fully zeroed value is a
    // valid `None` variant. This is theoretically possible when the wrapped
    // type has no valid value that can be represented by all zeros, but there
    // is no way to enforce this at the type level. For now, we just use a custom
    // option type with explicit discriminant for the `None` variant.
    // The issue with this implementation is that it disables niche optimization.
    None = 0,
    Some(T),
}

impl<T> Default for COption<T> {
    fn default() -> Self {
        Self::None
    }
}

impl<T> COption<T> {
    /// Returns a slice of the given size filled with the `None` variant.
    fn new_none_slice(size: usize) -> Box<[Self]> {
        let slice = Box::<[COption<T>]>::new_zeroed_slice(size);
        // Safety:
        // We know that a zeroed COption<T> is a valid COption::None value.
        unsafe { slice.assume_init() }
    }

    /// Returns a reference to the contained value, or `None` if it is `None`.
    fn as_option_ref(&self) -> Option<&T> {
        match self {
            COption::None => None,
            COption::Some(t) => Some(t),
        }
    }

    /// Takes the value out of the option, leaving a `None` in its place.
    fn take(&mut self) -> Option<T> {
        match std::mem::take(self) {
            COption::None => None,
            COption::Some(t) => Some(t),
        }
    }
}

impl<T: Default> COption<T> {
    /// Returns a slice of the given size filled with the `Some` variant and
    /// filled with default values.
    fn new_default_slice(size: usize) -> Box<[Self]> {
        (0..size)
            .map(|_| COption::Some(Default::default()))
            .collect::<Vec<_>>()
            .into_boxed_slice()
    }
}

pub struct NoMoveVec<T, const INITIAL_CAPACITY_BITS: u32 = 6> {
    buckets: [(AtomicPtr<COption<T>>, Mutex<()>); BUCKETS],
}

fn get_bucket_index<const INITIAL_CAPACITY_BITS: u32>(idx: usize) -> u32 {
    (usize::BITS - idx.leading_zeros()).saturating_sub(INITIAL_CAPACITY_BITS)
}

fn get_bucket_size<const INITIAL_CAPACITY_BITS: u32>(bucket_index: u32) -> usize {
    if bucket_index != 0 {
        1 << (bucket_index + INITIAL_CAPACITY_BITS - 1)
    } else {
        1 << INITIAL_CAPACITY_BITS
    }
}

fn get_index_in_bucket<const INITIAL_CAPACITY_BITS: u32>(idx: usize, bucket_index: u32) -> usize {
    if bucket_index != 0 {
        idx ^ (1 << (bucket_index + INITIAL_CAPACITY_BITS - 1))
    } else {
        idx
    }
}

/// Allocates a new bucket of `COption<T>`s, all initialized to `None`.
fn allocate_bucket<const INITIAL_CAPACITY_BITS: u32, T>(bucket_index: u32) -> *mut COption<T> {
    let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_index);
    let slice = COption::<T>::new_none_slice(size);
    Box::into_raw(slice) as *mut COption<T>
}

/// Allocates a new bucket of `COption<T>`s, all initialized to `None`.
fn allocate_default_bucket<const INITIAL_CAPACITY_BITS: u32, T: Default>(
    bucket_index: u32,
) -> *mut COption<T> {
    let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_index);
    let slice = COption::<T>::new_default_slice(size);
    Box::into_raw(slice) as *mut COption<T>
}

impl<T, const INITIAL_CAPACITY_BITS: u32> Default for NoMoveVec<T, INITIAL_CAPACITY_BITS> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const INITIAL_CAPACITY_BITS: u32> NoMoveVec<T, INITIAL_CAPACITY_BITS> {
    pub fn new() -> Self {
        let mut buckets = [null_mut(); BUCKETS];
        buckets[0] = allocate_bucket::<INITIAL_CAPACITY_BITS, T>(0);
        let buckets = buckets.map(|p| (AtomicPtr::new(p), Mutex::new(())));
        NoMoveVec { buckets }
    }

    pub fn get(&self, idx: usize) -> Option<&T> {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket_ptr = unsafe { self.buckets.get_unchecked(bucket_idx as usize) }
            .0
            .load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return None;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        unsafe { &*bucket_ptr.add(index) }.as_option_ref()
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    pub unsafe fn take(&self, idx: usize) -> Option<T> {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let bucket_ptr = bucket.0.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return None;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        let item = item.take();
        // To sync with any acquire load of the bucket ptr
        bucket.0.store(bucket_ptr, Ordering::Release);
        item
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    pub unsafe fn insert(&self, idx: usize, value: T) -> &T {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        // SAFETY: This is safe to be relaxed as the bucket will never become null
        // again. We perform a acquire load when it's null.
        let mut bucket_ptr = bucket.0.load(Ordering::Relaxed);
        if bucket_ptr.is_null() {
            bucket_ptr = bucket.0.load(Ordering::Acquire);
            if bucket_ptr.is_null() {
                let lock = bucket.1.lock();
                let guarded_bucket_ptr = bucket.0.load(Ordering::Acquire);
                if guarded_bucket_ptr.is_null() {
                    let new_bucket = allocate_bucket::<INITIAL_CAPACITY_BITS, T>(bucket_idx);
                    bucket_ptr = match bucket.0.compare_exchange(
                        null_mut(),
                        new_bucket,
                        Ordering::AcqRel,
                        Ordering::Relaxed,
                    ) {
                        Ok(_) => new_bucket,
                        Err(current_bucket) => {
                            drop(unsafe { Box::from_raw(new_bucket) });
                            current_bucket
                        }
                    };
                    drop(lock);
                } else {
                    bucket_ptr = guarded_bucket_ptr;
                }
            }
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        *item = COption::Some(value);
        // To sync with any acquire load of the bucket ptr
        bucket.0.store(bucket_ptr, Ordering::Release);
        item.as_option_ref().unwrap()
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    pub unsafe fn remove(&self, idx: usize) {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let bucket_ptr = bucket.0.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        *item = COption::None;
        // To sync with any acquire load of the bucket ptr
        bucket.0.store(bucket_ptr, Ordering::Release);
    }
}

impl<T: Default, const INITIAL_CAPACITY_BITS: u32> NoMoveVec<T, INITIAL_CAPACITY_BITS> {
    pub fn new_init_default() -> Self {
        let mut buckets = [null_mut(); BUCKETS];
        buckets[0] = allocate_default_bucket::<INITIAL_CAPACITY_BITS, T>(0);
        let buckets = buckets.map(|p| (AtomicPtr::new(p), Mutex::new(())));
        NoMoveVec { buckets }
    }

    pub fn get_init_default(&self, idx: usize) -> &T {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        // SAFETY: This is safe to be relaxed as the bucket will never become null
        // again. We perform a acquire load when it's null.
        let mut bucket_ptr = bucket.0.load(Ordering::Relaxed);
        if bucket_ptr.is_null() {
            bucket_ptr = bucket.0.load(Ordering::Acquire);
            if bucket_ptr.is_null() {
                let lock = bucket.1.lock();
                let guarded_bucket_ptr = bucket.0.load(Ordering::Acquire);
                if guarded_bucket_ptr.is_null() {
                    let new_bucket =
                        allocate_default_bucket::<INITIAL_CAPACITY_BITS, T>(bucket_idx);
                    bucket_ptr = match bucket.0.compare_exchange(
                        null_mut(),
                        new_bucket,
                        Ordering::AcqRel,
                        Ordering::Relaxed,
                    ) {
                        Ok(_) => new_bucket,
                        Err(current_bucket) => {
                            drop(unsafe { Box::from_raw(new_bucket) });
                            current_bucket
                        }
                    };
                    drop(lock);
                } else {
                    bucket_ptr = guarded_bucket_ptr;
                }
            }
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        let value = unsafe { &*bucket_ptr.add(index) }.as_option_ref();
        value.expect("get_init_default must not be combined with normal insert")
    }
}

impl<T, const INITIAL_CAPACITY_BITS: u32> Drop for NoMoveVec<T, INITIAL_CAPACITY_BITS> {
    fn drop(&mut self) {
        for (bucket_index, (bucket, _)) in self.buckets.iter_mut().enumerate() {
            if bucket_index < (usize::BITS + 1 - INITIAL_CAPACITY_BITS) as usize {
                let bucket_size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_index as u32);
                let bucket_ptr = *bucket.get_mut();

                if !bucket_ptr.is_null() {
                    drop(unsafe { Box::from_raw(from_raw_parts_mut(bucket_ptr, bucket_size)) });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::NoMoveVec;

    #[test]
    fn basic_operations() {
        let v = NoMoveVec::<(usize, usize)>::new();
        assert_eq!(v.get(0), None);
        assert_eq!(v.get(1), None);
        assert_eq!(v.get(8), None);
        assert_eq!(v.get(9), None);
        assert_eq!(v.get(15), None);
        assert_eq!(v.get(16), None);
        assert_eq!(v.get(100), None);
        assert_eq!(v.get(1000), None);

        for i in 0..1000 {
            unsafe {
                v.insert(i, (i, i));
            }
            assert_eq!(v.get(i), Some(&(i, i)));
        }
        for i in 0..1000 {
            assert_eq!(v.get(i), Some(&(i, i)));
        }
        assert_eq!(v.get(1001), None);

        unsafe {
            v.insert(1000000, (0, 0));
        }
        assert_eq!(v.get(1000000), Some(&(0, 0)));
        assert_eq!(v.get(10000), None);
    }
}
