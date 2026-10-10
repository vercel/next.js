//! Decompresses a trace stream on a background thread.
//!
//! Parsing a trace is much more expensive than decompressing it, so running the decoder on its
//! own thread hides the decompression cost behind parsing. The decoder thread fills batches of
//! decompressed data and hands them to the reader over a bounded channel.
//!
//! - Errors are sent after the data that preceded them, so they are never lost.
//! - After the decoder reports EOF (`Ok(0)`) or an error, the thread pauses until the reader asks
//!   for more data. This keeps the "wait for more data, then retry" behavior of the reader loop.
//! - Dropping the [`ThreadedDecoder`] stops and joins the thread.

use std::{
    io::{self, Read},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
        mpsc::{Receiver, SyncSender, sync_channel},
    },
    thread::{self, JoinHandle},
};

/// Number of decompressed batches that can be queued ahead of the reader.
const QUEUED_BATCHES: usize = 2;

enum Message {
    Data(Vec<u8>),
    Eof,
    Error(io::Error),
}

pub struct ThreadedDecoder {
    rx: Option<Receiver<Message>>,
    /// Wakes up the decoder thread after it paused on EOF or an error.
    resume_tx: Option<SyncSender<()>>,
    /// Returns consumed batch buffers to the decoder thread for reuse.
    recycle_tx: SyncSender<Vec<u8>>,
    waiting_for_resume: bool,
    pending: Vec<u8>,
    pending_pos: usize,
    /// Position in the underlying (compressed) stream that the decoder thread has consumed.
    position: Arc<AtomicU64>,
    thread: Option<JoinHandle<()>>,
}

impl ThreadedDecoder {
    /// Spawns a thread that reads `decoder` in batches of `batch_size` bytes.
    /// `stream_position` reports how far the decoder has consumed its compressed input. It is
    /// called on the decoder thread after each batch.
    pub fn new<R: Read + Send + 'static>(
        mut decoder: R,
        batch_size: usize,
        mut stream_position: impl FnMut(&mut R) -> u64 + Send + 'static,
    ) -> Self {
        assert!(batch_size > 0);
        let (tx, rx) = sync_channel::<Message>(QUEUED_BATCHES);
        let (resume_tx, resume_rx) = sync_channel::<()>(1);
        let (recycle_tx, recycle_rx) = sync_channel::<Vec<u8>>(QUEUED_BATCHES + 2);
        let position = Arc::new(AtomicU64::new(0));
        let thread_position = position.clone();
        let thread = thread::Builder::new()
            .name("trace decompression".into())
            .spawn(move || {
                loop {
                    let mut buf = recycle_rx.try_recv().unwrap_or_default();
                    buf.resize(batch_size, 0);
                    let mut filled = 0;
                    let mut error = None;
                    while filled < batch_size {
                        match decoder.read(&mut buf[filled..]) {
                            Ok(0) => break,
                            Ok(n) => filled += n,
                            Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
                            Err(err) => {
                                error = Some(err);
                                break;
                            }
                        }
                    }
                    // `fetch_max` keeps the position monotonic even if a position query fails.
                    thread_position.fetch_max(stream_position(&mut decoder), Ordering::Relaxed);
                    let paused = filled < batch_size;
                    if filled > 0 {
                        buf.truncate(filled);
                        if tx.send(Message::Data(buf)).is_err() {
                            return;
                        }
                    }
                    if paused {
                        let message = match error {
                            Some(err) => Message::Error(err),
                            None => Message::Eof,
                        };
                        // Exits when the reader has been dropped.
                        if tx.send(message).is_err() || resume_rx.recv().is_err() {
                            return;
                        }
                    }
                }
            })
            .expect("failed to spawn trace decompression thread");
        Self {
            rx: Some(rx),
            resume_tx: Some(resume_tx),
            recycle_tx,
            waiting_for_resume: false,
            pending: Vec::new(),
            pending_pos: 0,
            position,
            thread: Some(thread),
        }
    }

    pub fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }
        if self.pending_pos >= self.pending.len() {
            if self.waiting_for_resume {
                self.waiting_for_resume = false;
                if let Some(resume_tx) = &self.resume_tx {
                    // Fails only if the thread is gone, which the `recv` below reports.
                    let _ = resume_tx.send(());
                }
            }
            let rx = self.rx.as_ref().expect("receiver is only taken on drop");
            match rx.recv() {
                Ok(Message::Data(data)) => {
                    let consumed = std::mem::replace(&mut self.pending, data);
                    // Recycling is best effort: the buffer is dropped if the queue is full.
                    let _ = self.recycle_tx.try_send(consumed);
                    self.pending_pos = 0;
                }
                Ok(Message::Eof) => {
                    self.waiting_for_resume = true;
                    return Ok(0);
                }
                Ok(Message::Error(err)) => {
                    self.waiting_for_resume = true;
                    return Err(err);
                }
                Err(_) => {
                    // The thread only exits on its own when this side is dropped, so a
                    // disconnect means it panicked.
                    return Err(io::Error::other(
                        "trace decompression thread terminated unexpectedly",
                    ));
                }
            }
        }
        let n = (self.pending.len() - self.pending_pos).min(out.len());
        out[..n].copy_from_slice(&self.pending[self.pending_pos..self.pending_pos + n]);
        self.pending_pos += n;
        Ok(n)
    }

    /// Position in the compressed input that the decoder thread has consumed so far. This can
    /// be ahead of the data returned by [`Self::read`] by the queued batches.
    pub fn stream_position(&self) -> u64 {
        self.position.load(Ordering::Relaxed)
    }
}

impl Drop for ThreadedDecoder {
    fn drop(&mut self) {
        // Dropping the receiver unblocks a thread waiting to send a batch, and dropping the
        // resume sender unblocks a thread paused after EOF or an error.
        self.rx.take();
        self.resume_tx.take();
        if let Some(thread) = self.thread.take() {
            // A panic on the decoder thread was already reported by `read`.
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Cursor, Write},
        sync::{Arc, Mutex, mpsc},
        time::Duration,
    };

    use super::*;

    const TIMEOUT: Duration = Duration::from_secs(5);

    /// Compressible but non-trivial data.
    fn test_data(len: usize) -> Vec<u8> {
        let mut state = 0x2545_f491_u32;
        (0..len)
            .map(|_| {
                state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                b'a' + ((state >> 16) % 16) as u8
            })
            .collect()
    }

    /// Reads everything until `Ok(0)` using small and odd-sized reads.
    fn read_to_eof(decoder: &mut ThreadedDecoder) -> io::Result<Vec<u8>> {
        let mut result = Vec::new();
        let mut buf = [0; 7777];
        loop {
            match decoder.read(&mut buf)? {
                0 => return Ok(result),
                n => result.extend_from_slice(&buf[..n]),
            }
        }
    }

    /// Runs `f` on another thread and fails the test if it doesn't finish within `TIMEOUT`.
    fn finishes_in_time(f: impl FnOnce() + Send + 'static) {
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            f();
            let _ = tx.send(());
        });
        rx.recv_timeout(TIMEOUT).expect("did not finish in time");
    }

    #[test]
    fn delivers_all_data_gzip() {
        let data = test_data(5 * 1024 * 1024 + 123);
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&data).unwrap();
        let compressed = encoder.finish().unwrap();
        let reader = flate2::bufread::GzDecoder::new(Cursor::new(compressed));
        let mut decoder = ThreadedDecoder::new(reader, 64 * 1024, |_| 0);
        assert_eq!(read_to_eof(&mut decoder).unwrap(), data);
    }

    #[test]
    fn delivers_all_data_zstd() {
        let data = test_data(5 * 1024 * 1024 + 123);
        let compressed = zstd::encode_all(&data[..], 3).unwrap();
        let reader = zstd::Decoder::new(Cursor::new(compressed)).unwrap();
        let mut decoder = ThreadedDecoder::new(reader, 64 * 1024, |_| 0);
        assert_eq!(read_to_eof(&mut decoder).unwrap(), data);
    }

    /// Yields `data`, then fails once with `error`, then reports EOF. This mirrors decoders like
    /// flate2's that report a checksum error only once.
    struct FailOnceAfter {
        data: Cursor<Vec<u8>>,
        error: Option<io::ErrorKind>,
    }

    impl Read for FailOnceAfter {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            match self.data.read(buf)? {
                0 => match self.error.take() {
                    Some(kind) => Err(kind.into()),
                    None => Ok(0),
                },
                n => Ok(n),
            }
        }
    }

    /// Reads until the first error, returning the data received before it.
    fn read_until_error(decoder: &mut ThreadedDecoder) -> (Vec<u8>, io::Error) {
        let mut received = Vec::new();
        let mut buf = [0; 10_000];
        loop {
            match decoder.read(&mut buf) {
                Ok(0) => panic!("expected an error, got EOF"),
                Ok(n) => received.extend_from_slice(&buf[..n]),
                Err(err) => return (received, err),
            }
        }
    }

    #[test]
    fn error_after_data_is_not_swallowed() {
        let data = test_data(300 * 1024);
        let reader = FailOnceAfter {
            data: Cursor::new(data.clone()),
            error: Some(io::ErrorKind::Other),
        };
        // The error happens in the middle of a batch.
        let mut decoder = ThreadedDecoder::new(reader, 256 * 1024, |_| 0);
        let (received, err) = read_until_error(&mut decoder);
        assert_eq!(received, data);
        assert_eq!(err.kind(), io::ErrorKind::Other);
        // Reading again resumes the decoder, which now reports EOF.
        assert_eq!(read_to_eof(&mut decoder).unwrap(), b"");
    }

    #[test]
    fn gzip_checksum_error_is_not_swallowed() {
        let data = test_data(2 * 1024 * 1024);
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&data).unwrap();
        let mut compressed = encoder.finish().unwrap();
        // The gzip footer is CRC32 + size; corrupt the CRC.
        let crc = compressed.len() - 8;
        compressed[crc] ^= 0xff;
        let reader = flate2::bufread::GzDecoder::new(Cursor::new(compressed));
        let mut decoder = ThreadedDecoder::new(reader, 64 * 1024, |_| 0);
        let (received, err) = read_until_error(&mut decoder);
        assert_eq!(received, data);
        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
        // flate2 reports the checksum error only once.
        assert_eq!(read_to_eof(&mut decoder).unwrap(), b"");
    }

    #[test]
    fn truncated_gzip_reports_error_after_prefix() {
        let data = test_data(2 * 1024 * 1024);
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&data).unwrap();
        let mut compressed = encoder.finish().unwrap();
        compressed.truncate(compressed.len() / 2);
        let reader = flate2::bufread::GzDecoder::new(Cursor::new(compressed));
        let mut decoder = ThreadedDecoder::new(reader, 64 * 1024, |_| 0);
        let (received, err) = read_until_error(&mut decoder);
        // Depending on where the stream is cut, flate2 reports `UnexpectedEof` or `InvalidInput`.
        // The reader loop treats both like EOF and waits for more data.
        assert!(
            matches!(
                err.kind(),
                io::ErrorKind::UnexpectedEof | io::ErrorKind::InvalidInput
            ),
            "unexpected error: {err:?}"
        );
        assert!(!received.is_empty());
        assert!(data.starts_with(&received));
    }

    /// Reads from a buffer that can grow while it is being read, like a file being written.
    #[derive(Clone, Default)]
    struct Growing {
        data: Arc<Mutex<Vec<u8>>>,
        pos: usize,
    }

    impl Read for Growing {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            let data = self.data.lock().unwrap();
            let n = (data.len() - self.pos).min(buf.len());
            buf[..n].copy_from_slice(&data[self.pos..self.pos + n]);
            self.pos += n;
            Ok(n)
        }
    }

    #[test]
    fn resumes_after_eof() {
        let source = Growing::default();
        let data = source.data.clone();
        data.lock().unwrap().extend_from_slice(b"hello ");
        let mut decoder = ThreadedDecoder::new(source, 1024, |_| 0);
        assert_eq!(read_to_eof(&mut decoder).unwrap(), b"hello ");

        data.lock().unwrap().extend_from_slice(b"world");
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(read_to_eof(&mut decoder).unwrap());
        });
        assert_eq!(rx.recv_timeout(TIMEOUT).unwrap(), b"world");
    }

    /// Fails every other read with `Interrupted`.
    struct Interrupting {
        data: Cursor<Vec<u8>>,
        interrupt: bool,
    }

    impl Read for Interrupting {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.interrupt = !self.interrupt;
            if self.interrupt {
                return Err(io::ErrorKind::Interrupted.into());
            }
            let len = buf.len().min(1000);
            self.data.read(&mut buf[..len])
        }
    }

    #[test]
    fn interrupted_reads_are_retried() {
        let data = test_data(100 * 1024);
        let reader = Interrupting {
            data: Cursor::new(data.clone()),
            interrupt: false,
        };
        let mut decoder = ThreadedDecoder::new(reader, 4096, |_| 0);
        assert_eq!(read_to_eof(&mut decoder).unwrap(), data);
    }

    struct Panicking;

    impl Read for Panicking {
        fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
            panic!("decoder failure (expected by test)");
        }
    }

    #[test]
    fn worker_panic_is_an_error() {
        let mut decoder = ThreadedDecoder::new(Panicking, 1024, |_| 0);
        let mut buf = [0; 16];
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(decoder.read(&mut buf).map_err(|err| err.kind()));
        });
        assert_eq!(rx.recv_timeout(TIMEOUT).unwrap(), Err(io::ErrorKind::Other));
    }

    #[test]
    fn drop_while_waiting_exits_thread() {
        let mut decoder = ThreadedDecoder::new(Cursor::new(b"abc".to_vec()), 1024, |_| 0);
        assert_eq!(read_to_eof(&mut decoder).unwrap(), b"abc");
        // The thread is now paused after EOF; dropping joins it.
        finishes_in_time(move || drop(decoder));
    }

    /// Never-ending stream. Signals `started` when the given read call starts.
    struct Endless {
        reads: usize,
        signal_at: usize,
        started: mpsc::Sender<()>,
    }

    impl Read for Endless {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.reads += 1;
            if self.reads == self.signal_at {
                let _ = self.started.send(());
            }
            buf.fill(b'x');
            Ok(buf.len())
        }
    }

    #[test]
    fn drop_while_backpressured_exits_thread() {
        let (started, started_rx) = mpsc::channel();
        // Each read fills a whole batch. Once the channel holds `QUEUED_BATCHES` batches,
        // the thread fills one more batch and then blocks sending it.
        let reader = Endless {
            reads: 0,
            signal_at: QUEUED_BATCHES + 1,
            started,
        };
        let decoder = ThreadedDecoder::new(reader, 1024, |_| 0);
        started_rx.recv_timeout(TIMEOUT).unwrap();
        finishes_in_time(move || drop(decoder));
    }

    #[test]
    fn position_is_monotonic_and_bounded() {
        let data = test_data(100 * 1024);
        let len = data.len() as u64;
        let mut decoder = ThreadedDecoder::new(Cursor::new(data), 4096, |cursor| cursor.position());
        let mut last = 0;
        let mut buf = [0; 1000];
        loop {
            let n = decoder.read(&mut buf).unwrap();
            let position = decoder.stream_position();
            assert!(position >= last, "position decreased");
            assert!(position <= len, "position past the end");
            last = position;
            if n == 0 {
                break;
            }
        }
        assert_eq!(last, len);
    }
}
