use std::cell::UnsafeCell;

use parking_lot::Mutex;
use roaring::RoaringBitmap;
use thread_local::ThreadLocal;

use crate::utils::age_queue::AgeQueue;

const BUFFER_SIZE: u64 = 1024;

pub struct BufferedAgeQueue {
    queue: Mutex<AgeQueue>,
    completed: Mutex<RoaringBitmap>,
    thread_local: ThreadLocal<UnsafeCell<RoaringBitmap>>,
}

impl BufferedAgeQueue {
    pub fn new() -> Self {
        Self {
            queue: Mutex::new(AgeQueue::new()),
            completed: Mutex::new(RoaringBitmap::new()),
            thread_local: ThreadLocal::new(),
        }
    }

    pub fn push(&self, item: u32) {
        let thread_local = self
            .thread_local
            .get_or(|| UnsafeCell::new(RoaringBitmap::new()));
        // Safety: We are the only thread accessing this thread local.
        let bitmap = unsafe { &mut *thread_local.get() };
        bitmap.insert(item);
        if bitmap.len() > BUFFER_SIZE {
            self.queue.lock().push(bitmap);
            bitmap.clear();
        }
    }

    pub fn queue(&self) -> &Mutex<AgeQueue> {
        &self.queue
    }

    pub fn completed(&self) -> &Mutex<RoaringBitmap> {
        &self.completed
    }
}
