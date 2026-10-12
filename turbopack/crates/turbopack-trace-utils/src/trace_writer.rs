use std::{debug_assert, io::Write, sync::Arc, thread::JoinHandle, time::Duration};

use crossbeam_channel::{Receiver, RecvTimeoutError, Sender, TryRecvError, bounded, unbounded};
use crossbeam_utils::CachePadded;
use parking_lot::{Mutex, MutexGuard};
use thread_local::ThreadLocal;

type ThreadLocalState = CachePadded<Mutex<Option<TraceInfoBuffer>>>;

/// The amount of data that is accumulated in the thread local buffer before it is sent to the
/// writer. The buffer might grow if a single write is larger than this size.
const THREAD_LOCAL_INITIAL_BUFFER_SIZE: usize = 1024 * 1024;
/// Data buffered by the write thread before issuing a filesystem write
const WRITE_BUFFER_SIZE: usize = 100 * 1024 * 1024;

struct TraceInfoBuffer {
    buffer: Vec<u8>,
    /// The marker of the last marked row in the buffer, see [`WriteGuard::mark`].
    last_row_marker: Option<u64>,
    /// The offset where the last marked row starts in `buffer`.
    last_row_start: usize,
    /// The offset where the last marked row ends in `buffer`. It's only still the last row in
    /// the buffer when this is the length of the buffer.
    last_row_end: usize,
}

impl TraceInfoBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(capacity),
            last_row_marker: None,
            last_row_start: 0,
            last_row_end: 0,
        }
    }

    fn push(&mut self, data: u8) {
        self.buffer.push(data);
    }

    fn extend(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    fn clear(&mut self) {
        self.buffer.clear();
        self.last_row_marker = None;
        self.last_row_start = 0;
        self.last_row_end = 0;
    }
}

#[derive(Clone)]
pub struct TraceWriter {
    data_tx: Sender<Option<TraceInfoBuffer>>,
    return_rx: Receiver<TraceInfoBuffer>,
    thread_locals: Arc<ThreadLocal<ThreadLocalState>>,
}

impl TraceWriter {
    /// This is a non-blocking writer that writes a file in a background thread.
    /// This is inspired by tracing-appender non_blocking, but has some
    /// differences:
    /// * It allows writing an owned [`Vec<u8>`] instead of a reference, so avoiding additional
    ///   allocation.
    /// * It uses an unbounded channel to avoid slowing down the application at all (memory) cost.
    /// * It issues less writes by buffering the data into chunks of `WRITE_BUFFER_SIZE`, when
    ///   possible.
    pub fn new<W: Write + Send + 'static>(mut writer: W) -> (Self, TraceWriterGuard) {
        let (data_tx, data_rx) = unbounded::<Option<TraceInfoBuffer>>();
        let (return_tx, return_rx) = bounded::<TraceInfoBuffer>(1024);
        let thread_locals: Arc<ThreadLocal<ThreadLocalState>> = Default::default();

        let trace_writer = Self {
            data_tx: data_tx.clone(),
            return_rx: return_rx.clone(),
            thread_locals: thread_locals.clone(),
        };

        fn steal_from_thread_locals(
            thread_locals: &Arc<ThreadLocal<ThreadLocalState>>,
            stolen_buffers: &mut Vec<TraceInfoBuffer>,
        ) {
            for state in thread_locals.iter() {
                let mut buffer = state.lock();
                // Empty buffers (e.g. after the only row was removed again) are left in place.
                // An empty buffer would be interpreted as exit signal.
                if buffer
                    .as_ref()
                    .is_some_and(|buffer| !buffer.buffer.is_empty())
                    && let Some(buffer) = buffer.take()
                {
                    stolen_buffers.push(buffer);
                }
            }
        }

        let handle: std::thread::JoinHandle<()> = std::thread::spawn(move || {
            let _ = writer.write(b"TRACEv0");
            let mut buf = Vec::with_capacity(WRITE_BUFFER_SIZE);
            let mut stolen_buffers = Vec::new();
            let mut should_exit = false;
            'outer: loop {
                if !buf.is_empty() {
                    let _ = writer.write_all(&buf);
                    let _ = writer.flush();
                    buf.clear();
                }

                let recv = if should_exit {
                    Ok(None)
                } else {
                    data_rx.recv_timeout(Duration::from_secs(1))
                };

                let mut data = match recv {
                    Ok(Some(data)) => data,
                    result => {
                        if result.is_ok() {
                            // On exit signal
                            should_exit = true;
                        }
                        // When we receive no data for a second or we want to exit we poll the
                        // thread local buffers to steal some data. This
                        // prevents unsend data if a thread is hanging or the
                        // system just go into idle.
                        steal_from_thread_locals(&thread_locals, &mut stolen_buffers);
                        if let Some(data) = stolen_buffers.pop() {
                            data
                        } else {
                            match result {
                                Ok(Some(_)) => unreachable!(),
                                Ok(None) | Err(RecvTimeoutError::Disconnected) => {
                                    // We should exit.
                                    break 'outer;
                                }
                                Err(RecvTimeoutError::Timeout) => {
                                    // No data stolen, wait again
                                    continue;
                                }
                            }
                        }
                    }
                };
                if data.buffer.len() > buf.capacity() {
                    let _ = writer.write_all(&data.buffer);
                } else {
                    buf.extend_from_slice(&data.buffer);
                }
                data.clear();
                let _ = return_tx.try_send(data);
                loop {
                    let recv = stolen_buffers.pop().map(Some).ok_or(()).or_else(|_| {
                        if should_exit {
                            Ok(None)
                        } else {
                            data_rx.try_recv()
                        }
                    });
                    match recv {
                        Ok(Some(mut data)) => {
                            let data_buffer = &data.buffer;
                            if data_buffer.is_empty() {
                                break 'outer;
                            }
                            if buf.len() + data_buffer.len() > buf.capacity() {
                                let _ = writer.write_all(&buf);
                                buf.clear();
                                if data_buffer.len() > buf.capacity() {
                                    let _ = writer.write_all(data_buffer);
                                } else {
                                    buf.extend_from_slice(data_buffer);
                                }
                            } else {
                                buf.extend_from_slice(data_buffer);
                            }
                            data.clear();
                            let _ = return_tx.try_send(data);
                        }
                        Ok(None) | Err(TryRecvError::Disconnected) => {
                            should_exit = true;
                            break;
                        }
                        Err(TryRecvError::Empty) => {
                            break;
                        }
                    }
                }
            }
            drop(writer);
        });

        let guard = TraceWriterGuard {
            data_tx: Some(data_tx),
            return_rx: Some(return_rx),
            handle: Some(handle),
        };
        (trace_writer, guard)
    }

    fn send(&self, data: TraceInfoBuffer) {
        debug_assert!(!data.buffer.is_empty());
        let _ = self.data_tx.send(Some(data));
    }

    fn get_empty_buffer(&self, capacity: usize) -> TraceInfoBuffer {
        self.return_rx
            .try_recv()
            .ok()
            .unwrap_or_else(|| TraceInfoBuffer::new(capacity))
    }

    pub fn start_write(&self) -> WriteGuard<'_> {
        let thread_local_buffer = self.thread_locals.get_or_default();
        let buffer = thread_local_buffer.lock();
        WriteGuard::new(buffer, self)
    }
}

pub struct TraceWriterGuard {
    data_tx: Option<Sender<Option<TraceInfoBuffer>>>,
    return_rx: Option<Receiver<TraceInfoBuffer>>,
    handle: Option<JoinHandle<()>>,
}

impl Drop for TraceWriterGuard {
    fn drop(&mut self) {
        // Send exit signal, we can't use disconnect since there is another instance in TraceWriter
        let _ = self.data_tx.take().unwrap().send(None);
        // Receive all return buffers and drop them here. The thread is already busy writing.
        let return_rx = self.return_rx.take().unwrap();
        while return_rx.recv().is_ok() {}
        // Wait for the thread to finish completely
        let _ = self.handle.take().unwrap().join();
    }
}

pub struct WriteGuard<'l> {
    // Safety: The buffer must not be None
    buffer: MutexGuard<'l, Option<TraceInfoBuffer>>,
    trace_writer: &'l TraceWriter,
}

impl<'l> WriteGuard<'l> {
    fn new(
        mut buffer: MutexGuard<'l, Option<TraceInfoBuffer>>,
        trace_writer: &'l TraceWriter,
    ) -> Self {
        // Safety: The buffer must not be None, so we initialize it here
        buffer
            .get_or_insert_with(|| trace_writer.get_empty_buffer(THREAD_LOCAL_INITIAL_BUFFER_SIZE));
        Self {
            buffer,
            trace_writer,
        }
    }

    fn buffer(&mut self) -> &mut TraceInfoBuffer {
        // Safety: The struct invariant ensures that the buffer is not None
        unsafe { self.buffer.as_mut().unwrap_unchecked() }
    }

    pub fn push(&mut self, data: u8) {
        self.buffer().push(data);
    }

    pub fn extend(&mut self, data: &[u8]) {
        self.buffer().extend(data);
    }

    /// Marks exactly what `write` writes with this guard as a row with `marker`. As long as
    /// nothing else is written on this thread and the row wasn't sent to the writer thread in
    /// between, it can be removed again with [`WriteGuard::remove_last_row`].
    pub fn mark(&mut self, marker: u64, write: impl FnOnce(&mut Self)) {
        let start = self.buffer().buffer.len();
        write(self);
        let buffer = self.buffer();
        buffer.last_row_marker = Some(marker);
        buffer.last_row_start = start;
        buffer.last_row_end = buffer.buffer.len();
    }

    /// Removes the last row written on this thread, if it was marked with `marker` by
    /// [`WriteGuard::mark`] and is still at the end of the thread local buffer. Returns whether
    /// it was removed.
    pub fn remove_last_row(&mut self, marker: u64) -> bool {
        let buffer = self.buffer();
        if buffer.last_row_marker != Some(marker) || buffer.last_row_end != buffer.buffer.len() {
            return false;
        }
        buffer.last_row_marker = None;
        buffer.buffer.truncate(buffer.last_row_start);
        true
    }
}

impl Drop for WriteGuard<'_> {
    fn drop(&mut self) {
        if self.buffer().buffer.capacity() * 2 < self.buffer().buffer.len() * 3 {
            let capacity = self.buffer().buffer.capacity();
            let new_buffer = self.trace_writer.get_empty_buffer(capacity);
            let buffer = std::mem::replace(self.buffer(), new_buffer);
            self.trace_writer.send(buffer);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use crate::trace_writer::{THREAD_LOCAL_INITIAL_BUFFER_SIZE, TraceWriter};

    #[derive(Clone, Default)]
    struct SharedBuffer(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedBuffer {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn with_writer(f: impl FnOnce(&TraceWriter)) -> Vec<u8> {
        let buffer = SharedBuffer::default();
        let (writer, guard) = TraceWriter::new(buffer.clone());
        f(&writer);
        drop(writer);
        drop(guard);
        let data = Arc::try_unwrap(buffer.0).unwrap().into_inner().unwrap();
        data.strip_prefix(b"TRACEv0").unwrap().to_vec()
    }

    #[test]
    fn removes_marked_last_row() {
        let data = with_writer(|writer| {
            writer.start_write().extend(b"aa");
            writer.start_write().mark(1, |guard| guard.extend(b"bbb"));
            let mut guard = writer.start_write();
            assert!(guard.remove_last_row(1));
            guard.extend(b"c");
        });
        assert_eq!(data, b"aac");
    }

    /// The mark covers exactly what is written in the callback, not what this guard wrote
    /// before or after it.
    #[test]
    fn marks_only_the_callback() {
        let data = with_writer(|writer| {
            let mut guard = writer.start_write();
            guard.extend(b"aa");
            guard.mark(1, |guard| guard.extend(b"bbb"));
            drop(guard);
            let mut guard = writer.start_write();
            assert!(guard.remove_last_row(1));
            guard.extend(b"c");
        });
        assert_eq!(data, b"aac");

        let data = with_writer(|writer| {
            let mut guard = writer.start_write();
            guard.mark(1, |guard| guard.extend(b"a"));
            guard.extend(b"b");
            drop(guard);
            assert!(!writer.start_write().remove_last_row(1));
        });
        assert_eq!(data, b"ab");
    }

    #[test]
    fn requires_a_matching_marker() {
        let data = with_writer(|writer| {
            writer.start_write().mark(1, |guard| guard.extend(b"a"));
            assert!(!writer.start_write().remove_last_row(2));
            // The row is still marked
            assert!(writer.start_write().remove_last_row(1));
            // Already removed
            assert!(!writer.start_write().remove_last_row(1));
        });
        assert_eq!(data, b"");
    }

    #[test]
    fn marker_is_invalidated_by_the_next_write() {
        let data = with_writer(|writer| {
            writer.start_write().mark(1, |guard| guard.extend(b"a"));
            writer.start_write().extend(b"b");
            assert!(!writer.start_write().remove_last_row(1));
        });
        assert_eq!(data, b"ab");
    }

    #[test]
    fn marker_is_dropped_when_buffer_is_sent() {
        // Just below the threshold where the buffer is sent to the writer thread
        let fill = THREAD_LOCAL_INITIAL_BUFFER_SIZE * 2 / 3 - 10;
        let data = with_writer(|writer| {
            writer.start_write().extend(&vec![0; fill]);
            // This exceeds the threshold, so the buffer is sent when the guard is dropped
            writer.start_write().mark(1, |guard| guard.extend(&[1; 20]));
            assert!(!writer.start_write().remove_last_row(1));
        });
        assert_eq!(data.len(), fill + 20);
    }

    #[test]
    fn removing_the_only_row_leaves_an_empty_buffer() {
        let data = with_writer(|writer| {
            writer.start_write().mark(1, |guard| guard.extend(b"a"));
            assert!(writer.start_write().remove_last_row(1));
        });
        assert_eq!(data, b"");
    }
}
