use std::{
    cell::UnsafeCell,
    ptr::NonNull,
    sync::atomic::{AtomicUsize, Ordering},
};

static ALLOCATED: AtomicUsize = AtomicUsize::new(0);
const KB: usize = 1024;
/// When global counter is updates we will keep a thread-local buffer of this
/// size.
const TARGET_BUFFER: usize = 100 * KB;
/// When the thread-local buffer would exceed this size, we will update the
/// global counter.
const MAX_BUFFER: usize = 200 * KB;

struct ThreadLocalCounter {
    /// Thread-local buffer of allocated bytes that have been added to the
    /// global counter desprite not being allocated yet. It is unsigned so that
    /// means the global counter is always equal or greater than the real
    /// value.
    buffer: usize,
}

impl ThreadLocalCounter {
    fn add(&mut self, size: usize) {
        if self.buffer >= size {
            self.buffer -= size;
        } else {
            let offset = size - self.buffer + TARGET_BUFFER;
            self.buffer = TARGET_BUFFER;
            ALLOCATED.fetch_add(offset, Ordering::Relaxed);
        }
    }

    fn remove(&mut self, size: usize) {
        self.buffer += size;
        if self.buffer > MAX_BUFFER {
            let offset = self.buffer - TARGET_BUFFER;
            self.buffer = TARGET_BUFFER;
            ALLOCATED.fetch_sub(offset, Ordering::Relaxed);
        }
    }

    fn unload(&mut self) {
        if self.buffer > 0 {
            ALLOCATED.fetch_sub(self.buffer, Ordering::Relaxed);
            self.buffer = 0;
        }
    }
}

thread_local! {
  static LOCAL_COUNTER: UnsafeCell<ThreadLocalCounter> = UnsafeCell::new(ThreadLocalCounter { buffer: 0 });
}

pub fn get() -> usize {
    ALLOCATED.load(Ordering::Relaxed)
}

fn with_local_counter(f: impl FnOnce(&mut ThreadLocalCounter)) {
    LOCAL_COUNTER.with(|local| {
        let ptr = local.get();
        // SAFETY: This is a thread local.
        let mut local = unsafe { NonNull::new_unchecked(ptr) };
        f(unsafe { local.as_mut() });
    })
}

/// Adds some `size` to the global counter in a thread-local buffered way.
pub fn add(size: usize) {
    with_local_counter(|local| local.add(size));
}

/// Removes some `size` to the global counter in a thread-local buffered way.
pub fn remove(size: usize) {
    with_local_counter(|local| local.remove(size));
}

/// Flushes the thread-local buffer to the global counter. This should be called
/// e. g. when a thread is stopped or goes to sleep for a long time.
pub fn flush() {
    with_local_counter(|local| local.unload());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counting() {
        let mut expected = get();
        add(100);
        // Initial change should fill up the buffer
        expected += TARGET_BUFFER + 100;
        assert_eq!(get(), expected);
        add(100);
        // Further changes should use the buffer
        assert_eq!(get(), expected);
        add(MAX_BUFFER);
        // Large changes should require more buffer space
        expected += 100 + MAX_BUFFER;
        assert_eq!(get(), expected);
        remove(100);
        // Small changes should use the buffer
        // buffer size is now TARGET_BUFFER + 100
        assert_eq!(get(), expected);
        remove(MAX_BUFFER);
        // The buffer should not grow over MAX_BUFFER
        // buffer size would be TARGET_BUFFER + 100 + MAX_BUFFER
        // but it will be reduce to TARGET_BUFFER
        // this means the global counter should reduce by 100 + MAX_BUFFER
        expected -= MAX_BUFFER + 100;
        assert_eq!(get(), expected);
    }
}
