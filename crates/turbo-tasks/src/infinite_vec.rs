use std::{
    ptr::null_mut,
    slice::from_raw_parts_mut,
    sync::{
        atomic::{fence, AtomicPtr, Ordering},
        Mutex,
    },
};

const BUCKETS: usize = (usize::BITS + 1) as usize;

pub struct InfiniteVec<T: Default, const INITIAL_CAPACITY_BITS: u32 = 6> {
    buckets: [(AtomicPtr<T>, Mutex<()>); BUCKETS],
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

impl<T: Default, const INITIAL_CAPACITY_BITS: u32> Default
    for InfiniteVec<T, INITIAL_CAPACITY_BITS>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<T: Default, const INITIAL_CAPACITY_BITS: u32> InfiniteVec<T, INITIAL_CAPACITY_BITS> {
    pub fn new_allocate_initial() -> Self {
        let mut buckets = [null_mut(); BUCKETS];
        buckets[0] = {
            let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(0);
            let boxed_slice = (0..size).map(|_| T::default()).collect();
            let raw_box = Box::into_raw(boxed_slice);
            raw_box as *mut T
        };
        let buckets = buckets.map(|p| (AtomicPtr::new(p), Mutex::new(())));
        InfiniteVec { buckets }
    }

    pub fn new() -> Self {
        let buckets = [null_mut(); BUCKETS];
        let buckets = buckets.map(|p| (AtomicPtr::new(p), Mutex::new(())));
        InfiniteVec { buckets }
    }

    pub fn get_or<'a, 'b: 'a>(&'a self, idx: usize, default: &'b T) -> &'b T {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket_ptr = unsafe { self.buckets.get_unchecked(bucket_idx as usize) }
            .0
            .load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return default;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        unsafe { &*bucket_ptr.add(index) }
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    pub unsafe fn get_mut_or<'a, 'b: 'a>(&'a self, idx: usize, default: &'b mut T) -> &'b mut T {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket_ptr = unsafe { self.buckets.get_unchecked(bucket_idx as usize) }
            .0
            .load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return default;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        fence(Ordering::Release);
        item
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    /// Make sure to call "fence(Ordering::Release)" after writing
    #[allow(clippy::mut_from_ref)]
    pub unsafe fn get_mut(&self, idx: usize) -> &mut T {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let mut bucket_ptr = bucket.0.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            let lock = bucket.1.lock().unwrap();
            let guarded_bucket_ptr = bucket.0.load(Ordering::Acquire);
            if guarded_bucket_ptr.is_null() {
                let new_bucket = {
                    let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_idx);
                    let boxed_slice = (0..size).map(|_| T::default()).collect();
                    let raw_box = Box::into_raw(boxed_slice);
                    raw_box as *mut T
                };
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
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
        unsafe { &mut *bucket_ptr.add(index) }
    }

    /// # Safety
    /// There must not be a concurrent operation to this idx
    pub unsafe fn set(&self, idx: usize, value: T) -> T {
        let item = unsafe { self.get_mut(idx) };
        let old = std::mem::replace(item, value);
        fence(Ordering::Release);
        old
    }

    pub fn get(&self, idx: usize) -> &T {
        unsafe { self.get_mut(idx) }
    }

    pub fn iter(&self) -> InfiniteVecIter<'_, T, INITIAL_CAPACITY_BITS> {
        InfiniteVecIter { vec: self, idx: 0 }
    }
}

impl<T: Default, const INITIAL_CAPACITY_BITS: u32> Drop for InfiniteVec<T, INITIAL_CAPACITY_BITS> {
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

pub struct InfiniteVecIter<'a, T: Default, const INITIAL_CAPACITY_BITS: u32 = 6> {
    vec: &'a InfiniteVec<T, INITIAL_CAPACITY_BITS>,
    idx: usize,
}

impl<'a, T: Default, const INITIAL_CAPACITY_BITS: u32> Iterator
    for InfiniteVecIter<'a, T, INITIAL_CAPACITY_BITS>
{
    type Item = (usize, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(self.idx);
            if bucket_idx >= (usize::BITS - INITIAL_CAPACITY_BITS + 1) as u32 {
                return None;
            }
            let bucket = unsafe { self.vec.buckets.get_unchecked(bucket_idx as usize) };
            let bucket_ptr = bucket.0.load(Ordering::Acquire);
            if bucket_ptr.is_null() {
                if bucket_idx >= (usize::BITS - INITIAL_CAPACITY_BITS) as u32 {
                    return None;
                }
                let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_idx);
                self.idx += size;
            } else {
                let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(self.idx, bucket_idx);
                let item = unsafe { &*bucket_ptr.add(index) };
                let result = (self.idx, item);
                self.idx += 1;
                return Some(result);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::InfiniteVec;

    #[test]
    fn basic_operations() {
        let v = InfiniteVec::<usize>::new();
        assert_eq!(v.get(0), &0);
        assert_eq!(v.get(1), &0);
        assert_eq!(v.get(8), &0);
        assert_eq!(v.get(9), &0);
        assert_eq!(v.get(15), &0);
        assert_eq!(v.get(16), &0);
        assert_eq!(v.get(100), &0);
        assert_eq!(v.get(1000), &0);

        for i in 0..1000 {
            unsafe {
                v.set(i, i);
            }
            assert_eq!(v.get(i), &i);
        }
        for i in 0..1000 {
            assert_eq!(v.get(i), &i);
        }
        assert_eq!(v.get(1001), &0);

        unsafe {
            *v.get_mut(1000000) = 1;
            *v.get_mut(1000001) = 0;
        }
        assert_eq!(v.get(1000000), &1);
        assert_eq!(v.get(1000001), &0);
        assert_eq!(v.get(10000), &0);
    }
}
