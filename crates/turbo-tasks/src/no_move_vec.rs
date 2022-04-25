use std::{
    ptr::null_mut,
    sync::{
        atomic::{fence, AtomicPtr, Ordering},
        Mutex,
    },
};

pub const fn buckets<const INITIAL_CAPACITY_BITS: u32>() -> usize {
    (usize::BITS + 1 - INITIAL_CAPACITY_BITS) as usize
}

pub struct NoMoveVec<T, const INITIAL_CAPACITY_BITS: u32 = 6>
where
    [(); buckets::<INITIAL_CAPACITY_BITS>()]:,
{
    buckets: [(AtomicPtr<Option<T>>, Mutex<()>); buckets::<INITIAL_CAPACITY_BITS>()],
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

impl<T, const INITIAL_CAPACITY_BITS: u32> NoMoveVec<T, INITIAL_CAPACITY_BITS>
where
    [(); buckets::<INITIAL_CAPACITY_BITS>()]:,
{
    pub fn new() -> Self {
        let mut buckets = [null_mut(); buckets::<INITIAL_CAPACITY_BITS>()];
        buckets[0] = {
            let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(0);
            let boxed_slice = (0..size).map(|_| None as Option<T>).collect();
            let raw_box = Box::into_raw(boxed_slice);
            raw_box as *mut Option<T>
        };
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
        unsafe { &*bucket_ptr.add(index) }.as_ref()
    }

    /// SAFETY: There must not be a concurrent operation to this idx
    pub unsafe fn insert(&self, idx: usize, value: T) {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let mut bucket_ptr = bucket.0.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            let lock = bucket.1.lock().unwrap();
            let guarded_bucket_ptr = bucket.0.load(Ordering::Acquire);
            if guarded_bucket_ptr.is_null() {
                let new_bucket = {
                    let size = get_bucket_size::<INITIAL_CAPACITY_BITS>(bucket_idx);
                    let boxed_slice = (0..size).map(|_| None as Option<T>).collect();
                    let raw_box = Box::into_raw(boxed_slice);
                    raw_box as *mut Option<T>
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
        let item = unsafe { &mut *bucket_ptr.add(index) };
        *item = Some(value);
        fence(Ordering::Release);
    }

    /// SAFETY: There must not be a concurrent operation to this idx
    pub unsafe fn remove(&self, idx: usize) {
        let bucket_idx = get_bucket_index::<INITIAL_CAPACITY_BITS>(idx);
        let bucket = unsafe { self.buckets.get_unchecked(bucket_idx as usize) };
        let bucket_ptr = bucket.0.load(Ordering::Acquire);
        if bucket_ptr.is_null() {
            return;
        }
        let index = get_index_in_bucket::<INITIAL_CAPACITY_BITS>(idx, bucket_idx);
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
