use std::{
    ptr::null_mut,
    sync::atomic::{fence, AtomicPtr, Ordering},
};

const FIRST_BUCKET_BITS: u32 = 3; // first bucket is len = 8
const BUCKETS: usize = (usize::BITS + 1 - FIRST_BUCKET_BITS) as usize;

pub struct NoMoveVec<T> {
    buckets: [AtomicPtr<Option<T>>; BUCKETS],
}

fn get_bucket_index(idx: usize) -> u32 {
    (usize::BITS - idx.leading_zeros()).saturating_sub(FIRST_BUCKET_BITS)
}

fn get_bucket_size(bucket_index: u32) -> usize {
    if bucket_index != 0 {
        1 << (bucket_index + FIRST_BUCKET_BITS - 1)
    } else {
        1 << FIRST_BUCKET_BITS
    }
}

fn get_index_in_bucket(idx: usize, bucket_index: u32) -> usize {
    if bucket_index != 0 {
        idx ^ (1 << (bucket_index + FIRST_BUCKET_BITS - 1))
    } else {
        idx
    }
}

impl<T> NoMoveVec<T> {
    pub fn new() -> Self {
        NoMoveVec {
            buckets: [null_mut(); BUCKETS].map(AtomicPtr::new),
        }
    }

    pub fn get(&self, idx: usize) -> Option<&T> {
        let bucket_idx = get_bucket_index(idx);
        let bucket_ptr =
            unsafe { self.buckets.get_unchecked(bucket_idx as usize) }.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return None;
        }
        let index = get_index_in_bucket(idx, bucket_idx);
        unsafe { &*bucket_ptr.add(index) }.as_ref()
    }

    /// SAFETY: There must not be a concurrent operation to this idx
    pub unsafe fn insert(&self, idx: usize, value: T) {
        let bucket_idx = get_bucket_index(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let mut bucket_ptr = bucket.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            let new_bucket = {
                let size = get_bucket_size(bucket_idx);
                let boxed_slice = (0..size).map(|_| None as Option<T>).collect();
                let raw_box = Box::into_raw(boxed_slice);
                raw_box as *mut Option<T>
            };
            bucket_ptr = match bucket.compare_exchange(
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
            }
        }
        let index = get_index_in_bucket(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        *item = Some(value);
        fence(Ordering::Release);
    }

    /// SAFETY: There must not be a concurrent operation to this idx
    pub unsafe fn remove(&self, idx: usize) {
        let bucket_idx = get_bucket_index(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let bucket_ptr = bucket.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return;
        }
        let index = get_index_in_bucket(idx, bucket_idx);
        let item = unsafe { &mut *bucket_ptr.add(index) };
        *item = None;
        fence(Ordering::Release);
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
