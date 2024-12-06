use std::{debug_assert, io::Write, sync::Arc, thread::JoinHandle, time::Duration};

use crossbeam_channel::{bounded, unbounded, Receiver, RecvTimeoutError, Sender, TryRecvError};
use crossbeam_utils::CachePadded;
use parking_lot::{Mutex, MutexGuard};
use thread_local::ThreadLocal;

type ThreadLocalState = CachePadded<Mutex<Option<Vec<u8>>>>;

/// The amount of data that is accumulated in the thread local buffer before it is sent to the
/// writer. The buffer might grow if a single write is larger than this size.
const THEAD_LOCAL_INITIAL_BUFFER_SIZE: usize = 1024 * 1024;
/// Data buffered by the write thread before issuing a filesystem write
const WRITE_BUFFER_SIZE: usize = 100 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct TraceWriter {
    data_tx: Sender<Vec<u8>>,
    return_rx: Receiver<Vec<u8>>,
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
        let (data_tx, data_rx) = unbounded::<Vec<u8>>();
        let (return_tx, return_rx) = bounded::<Vec<u8>>(1024);
        let thread_locals: Arc<ThreadLocal<ThreadLocalState>> = Default::default();

        let trace_writer = Self {
            data_tx: data_tx.clone(),
            return_rx: return_rx.clone(),
            thread_locals: thread_locals.clone(),
        };

        let data_tx_for_guard = data_tx.clone();

        let handle: std::thread::JoinHandle<()> = std::thread::spawn(move || {
            let _ = writer.write(b"TRACEv0");
            let mut buf = Vec::with_capacity(WRITE_BUFFER_SIZE);
            'outer: loop {
                if !buf.is_empty() {
                    let _ = writer.write_all(&buf);
                    let _ = writer.flush();
                    buf.clear();
                }
                let mut data = match data_rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(data) => data,
                    Err(e) => {
                        // When we receive no data for a second or we want to exit we poll the
                        // thread local buffers to steal some data. This
                        // prevents unsend data if a thread is hanging or the
                        // system just go into idle.
                        for state in thread_locals.iter() {
                            let mut buffer = state.lock();
                            if let Some(buffer) = buffer.take() {
                                let _ = data_tx.send(buffer);
                            }
                        }
                        match e {
                            RecvTimeoutError::Disconnected => {
                                // The TraceWriteGuard has been dropped and we should exit.
                                break 'outer;
                            }
                            RecvTimeoutError::Timeout => continue,
                        }
                    }
                };
                if data.is_empty() {
                    break 'outer;
                }
                if data.len() > buf.capacity() {
                    let _ = writer.write_all(&data);
                } else {
                    buf.extend_from_slice(&data);
                }
                data.clear();
                let _ = return_tx.try_send(data);
                loop {
                    match data_rx.try_recv() {
                        Ok(mut data) => {
                            if data.is_empty() {
                                break 'outer;
                            }
                            if buf.len() + data.len() > buf.capacity() {
                                let _ = writer.write_all(&buf);
                                buf.clear();
                                if data.len() > buf.capacity() {
                                    let _ = writer.write_all(&data);
                                } else {
                                    buf.extend_from_slice(&data);
                                }
                            } else {
                                buf.extend_from_slice(&data);
                            }
                            data.clear();
                            let _ = return_tx.try_send(data);
                        }
                        Err(TryRecvError::Disconnected) => {
                            break 'outer;
                        }
                        Err(TryRecvError::Empty) => {
                            break;
                        }
                    }
                }
            }
            if !buf.is_empty() {
                let _ = writer.write_all(&buf);
            }
            let _ = writer.flush();
            drop(writer);
        });

        let guard = TraceWriterGuard {
            data_tx: Some(data_tx_for_guard),
            return_rx: Some(return_rx),
            handle: Some(handle),
        };
        (trace_writer, guard)
    }

    fn send(&self, data: Vec<u8>) {
        debug_assert!(!data.is_empty());
        let _ = self.data_tx.send(data);
    }

    #[inline(never)]
    pub fn start_write(&self) -> WriteGuard<'_> {
        let thread_local_buffer = self.thread_locals.get_or_default();
        let buffer = thread_local_buffer.lock();
        WriteGuard::new(buffer, self)
    }
}

pub struct TraceWriterGuard {
    data_tx: Option<Sender<Vec<u8>>>,
    return_rx: Option<Receiver<Vec<u8>>>,
    handle: Option<JoinHandle<()>>,
}

impl Drop for TraceWriterGuard {
    fn drop(&mut self) {
        let _ = self.data_tx.take().unwrap().send(Vec::new());
        let return_rx = self.return_rx.take().unwrap();
        while return_rx.recv().is_ok() {}
        let _ = self.handle.take().unwrap().join();
    }
}

pub struct WriteGuard<'l> {
    // Safety: The buffer must not be None
    buffer: MutexGuard<'l, Option<Vec<u8>>>,
    start_len: usize,
    trace_writer: &'l TraceWriter,
}

impl<'l> WriteGuard<'l> {
    fn new(mut buffer: MutexGuard<'l, Option<Vec<u8>>>, trace_writer: &'l TraceWriter) -> Self {
        // Safety: The buffer must not be None, so we initialize it here
        let start_len = if let Some(buffer) = buffer.as_ref() {
            buffer.len()
        } else {
            *buffer = Some(
                trace_writer
                    .return_rx
                    .try_recv()
                    .ok()
                    .unwrap_or_else(|| Vec::with_capacity(THEAD_LOCAL_INITIAL_BUFFER_SIZE)),
            );
            0
        };
        Self {
            start_len,
            buffer,
            trace_writer,
        }
    }

    fn buffer(&mut self) -> &mut Vec<u8> {
        // Safety: The struct invariant ensures that the buffer is not None
        unsafe { self.buffer.as_mut().unwrap_unchecked() }
    }

    pub fn push(&mut self, data: u8) {
        // self.check_flush(1);
        self.buffer().push(data);
    }

    pub fn extend(&mut self, data: &[u8]) {
        // self.check_flush(data.len());
        self.buffer().extend_from_slice(data);
    }

    fn check_flush(&mut self, additional: usize) {
        if self.start_len > 0 {
            let buffer = self.buffer();
            if buffer.capacity() - buffer.len() < additional {
                self.flush();
            }
        }
    }

    fn flush(&mut self) {
        let capacity = self.buffer().capacity();
        let mut new_buffer = self.get_buffer(capacity);
        let start_len = self.start_len;
        new_buffer.extend_from_slice(&self.buffer()[start_len..]);
        self.buffer().truncate(start_len);
        self.start_len = 0;
        let buffer = std::mem::replace(self.buffer(), new_buffer);
        self.trace_writer.send(buffer);
    }

    fn get_buffer(&self, capacity: usize) -> Vec<u8> {
        self.trace_writer
            .return_rx
            .try_recv()
            .ok()
            .unwrap_or_else(|| Vec::with_capacity(capacity))
    }
}

impl Drop for WriteGuard<'_> {
    fn drop(&mut self) {
        if self.buffer().capacity() * 2 < self.buffer().len() * 3 {
            let capacity = self.buffer().capacity();
            let new_buffer = self.get_buffer(capacity);
            let buffer = std::mem::replace(self.buffer(), new_buffer);
            self.trace_writer.send(buffer);
        }
    }
}
