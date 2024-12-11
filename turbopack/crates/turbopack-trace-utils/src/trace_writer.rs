use std::{debug_assert, io::Write, sync::Arc, thread::JoinHandle, time::Duration};

use crossbeam_channel::{bounded, unbounded, Receiver, RecvTimeoutError, Sender, TryRecvError};
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
}

impl TraceInfoBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(capacity),
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
    /// * It allows writing an owned Vec<u8> instead of a reference, so avoiding additional
    ///   allocation.
    /// * It uses an unbounded channel to avoid slowing down the application at all (memory) cost.
    /// * It issues less writes by buffering the data into chunks of WRITE_BUFFER_SIZE, when
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
                if let Some(buffer) = buffer.take() {
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
        if buffer.is_none() {
            *buffer = Some(trace_writer.get_empty_buffer(THREAD_LOCAL_INITIAL_BUFFER_SIZE));
        };
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
