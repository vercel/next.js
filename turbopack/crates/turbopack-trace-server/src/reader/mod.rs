mod heaptrack;
mod nextjs;
mod threaded;
pub(crate) mod turbopack;

use std::{
    any::Any,
    env,
    fs::File,
    io::{self, BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::Arc,
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use anyhow::Result;
use flate2::bufread::GzDecoder;

use crate::{
    reader::{heaptrack::HeaptrackFormat, nextjs::NextJsFormat, turbopack::TurbopackFormat},
    store_container::StoreContainer,
};

/// How much data is handed to the trace format at once. The format does some work per batch
/// (e.g. invalidating cached span data), so batches shouldn't be tiny, but large batches parse
/// noticeably slower (1 MB batches loaded traces ~1.3-1.6x faster than 64 MB batches).
const BATCH_SIZE: usize = 1024 * 1024;

const MIN_INITIAL_REPORT_SIZE: u64 = 100 * 1024 * 1024;

pub(crate) trait TraceFormat {
    type Reused: Default;
    /// Create the initial reused buffer. Override to pre-allocate capacity.
    fn create_reused() -> Self::Reused {
        Self::Reused::default()
    }
    fn read(&mut self, buffer: &[u8], reuse: &mut Self::Reused) -> Result<usize>;
    fn stats(&self) -> String {
        String::new()
    }
}

type ErasedReused = Box<dyn Any>;

struct ErasedTraceFormat(Box<dyn ObjectSafeTraceFormat>);

trait ObjectSafeTraceFormat {
    fn create_reused(&self) -> ErasedReused;
    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize>;
    fn stats(&self) -> String;
}

impl<T: TraceFormat> ObjectSafeTraceFormat for T
where
    T::Reused: 'static,
{
    fn create_reused(&self) -> ErasedReused {
        Box::new(T::create_reused())
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize> {
        let reuse = reuse.downcast_mut().expect("Type of reuse is invalid");
        TraceFormat::read(self, buffer, reuse)
    }

    fn stats(&self) -> String {
        TraceFormat::stats(self)
    }
}

impl ObjectSafeTraceFormat for ErasedTraceFormat {
    fn create_reused(&self) -> ErasedReused {
        self.0.create_reused()
    }

    fn read(&mut self, buffer: &[u8], reuse: &mut ErasedReused) -> Result<usize> {
        self.0.read(buffer, reuse)
    }

    fn stats(&self) -> String {
        self.0.stats()
    }
}

#[derive(Default)]
enum TraceFile {
    Raw(BufReader<File>),
    /// A zstd or gzip compressed file, decompressed on a background thread.
    Compressed {
        decoder: threaded::ThreadedDecoder,
        /// Handle to the compressed file, used for size queries.
        file: File,
    },
    #[default]
    Unloaded,
}

impl TraceFile {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Raw(file) => file.read(buffer),
            Self::Compressed { decoder, .. } => decoder.read(buffer),
            Self::Unloaded => unreachable!(),
        }
    }

    /// Position in the file on disk. For compressed files this is the position in the compressed
    /// data, which can be slightly ahead of the data returned by `read`.
    fn stream_position(&mut self) -> io::Result<u64> {
        match self {
            Self::Raw(file) => file.stream_position(),
            Self::Compressed { decoder, .. } => Ok(decoder.stream_position()),
            Self::Unloaded => unreachable!(),
        }
    }

    /// Size of the opened file on disk.
    fn size(&mut self) -> io::Result<u64> {
        match self {
            Self::Raw(file) => file.get_ref().metadata().map(|m| m.len()),
            Self::Compressed { file, .. } => file.metadata().map(|m| m.len()),
            Self::Unloaded => unreachable!(),
        }
    }
}

pub struct TraceReader {
    store: Arc<StoreContainer>,
    path: PathBuf,
}

impl TraceReader {
    pub fn spawn(store: Arc<StoreContainer>, path: PathBuf) -> JoinHandle<()> {
        let mut reader = Self { store, path };
        std::thread::spawn(move || reader.run())
    }

    pub fn run(&mut self) {
        let mut file_warning_printed = false;
        loop {
            let read_success = self.try_read();
            if !file_warning_printed && !read_success {
                println!("Unable to read trace file at {:?}, waiting...", self.path);
                file_warning_printed = true;
            }
            thread::sleep(Duration::from_millis(500));
        }
    }

    fn trace_file_from_file(&self, file: File) -> io::Result<TraceFile> {
        let path = &self.path.to_string_lossy();
        let mut file = BufReader::with_capacity(
            // zstd max block size (1 << 17) + block header (3) + magic bytes (4)
            (1 << 17) + 7,
            file,
        );
        let magic_bytes = file.peek(4)?;
        let is_zstd = path.ends_with(".zst") || magic_bytes == [0x28, 0xb5, 0x2f, 0xfd];
        let is_gz = path.ends_with(".gz") || matches!(magic_bytes, [0x1f, 0x8b, _, _]);
        if !is_zstd && !is_gz {
            return Ok(TraceFile::Raw(file));
        }
        // Keep a handle to the compressed file for size queries, since the decoder (and the
        // file it reads from) moves to the decompression thread.
        let size_handle = file.get_ref().try_clone()?;
        let decoder = if is_zstd {
            threaded::ThreadedDecoder::new(
                zstd::Decoder::with_buffer(file)?,
                BATCH_SIZE,
                |decoder: &mut zstd::Decoder<'static, BufReader<File>>| {
                    decoder.get_mut().stream_position().unwrap_or(0)
                },
            )
        } else {
            threaded::ThreadedDecoder::new(
                GzDecoder::new(file),
                BATCH_SIZE,
                |decoder: &mut GzDecoder<BufReader<File>>| {
                    decoder.get_mut().stream_position().unwrap_or(0)
                },
            )
        };
        Ok(TraceFile::Compressed {
            decoder,
            file: size_handle,
        })
    }

    fn try_read(&mut self) -> bool {
        let Ok(mut file) = File::open(&self.path) else {
            return false;
        };
        println!("Trace file opened");
        let stop_at = env::var("STOP_AT")
            .unwrap_or_default()
            .parse()
            .map_or(u64::MAX, |v: u64| v * 1024 * 1024);
        if stop_at != u64::MAX {
            println!("Will stop reading file at {} MB", stop_at / 1024 / 1024)
        }

        {
            let mut store = self.store.write();
            store.reset();
        }

        let mut format: Option<(ErasedTraceFormat, ErasedReused)> = None;

        let mut current_read = 0;
        let mut initial_read = file
            .seek(SeekFrom::End(0))
            .ok()
            .map(|total| (total, Instant::now()));
        if file.seek(SeekFrom::Start(0)).is_err() {
            return false;
        }
        let mut file = match self.trace_file_from_file(file) {
            Ok(f) => f,
            Err(err) => {
                println!("Error opening trace file for reading: {err}");
                return false;
            }
        };

        let mut buffer = Vec::new();
        let mut index = 0;

        let mut chunk = vec![0; BATCH_SIZE];
        loop {
            match file.read(&mut chunk) {
                Ok(bytes_read) => {
                    if bytes_read == 0 {
                        self.store.write().optimize();
                        if let Some(value) = self.wait_for_more_data(
                            &mut file,
                            &mut initial_read,
                            format.as_ref().map(|(f, _)| f),
                        ) {
                            return value;
                        }
                    } else {
                        // If we have partially consumed some data, and we are at buffer capacity,
                        // remove the consumed data to make more space.
                        if index > 0 && buffer.len() + bytes_read > buffer.capacity() {
                            buffer.splice(..index, std::iter::empty());
                            index = 0;
                        }
                        buffer.extend_from_slice(&chunk[..bytes_read]);
                        if format.is_none() && buffer.len() >= 8 {
                            let erased_format = if buffer.starts_with(b"TRACEv0") {
                                index = 7;
                                ErasedTraceFormat(Box::new(TurbopackFormat::new(
                                    self.store.clone(),
                                )))
                            } else if buffer.starts_with(b"[{\"name\"") {
                                ErasedTraceFormat(Box::new(NextJsFormat::new(self.store.clone())))
                            } else if buffer.starts_with(b"v ") {
                                ErasedTraceFormat(Box::new(HeaptrackFormat::new(
                                    self.store.clone(),
                                )))
                            } else {
                                // Fallback to the format without magic bytes
                                // TODO Remove this after a while and show an error instead
                                ErasedTraceFormat(Box::new(TurbopackFormat::new(
                                    self.store.clone(),
                                )))
                            };
                            let reuse = erased_format.create_reused();
                            format = Some((erased_format, reuse));
                        }
                        if let Some((format, reuse)) = &mut format {
                            match format.read(&buffer[index..], reuse) {
                                Ok(bytes_read) => {
                                    index += bytes_read;
                                }
                                Err(err) => {
                                    println!("Trace file error: {err}");
                                    return true;
                                }
                            }
                            if self.store.want_to_read() {
                                thread::yield_now();
                            }
                            current_read += bytes_read as u64;
                            if let Some((total, start)) = &mut initial_read {
                                let pos = file.stream_position().unwrap_or(current_read);
                                if pos > *total {
                                    *total = file.size().unwrap_or(pos);
                                }
                                *total = (*total).max(pos);
                                let total_bytes = *total;
                                let percentage = pos * 100 / total_bytes;
                                let read = pos / (1024 * 1024);
                                let uncompressed = current_read / (1024 * 1024);
                                let total = total_bytes / (1024 * 1024);
                                let elapsed_ms = start.elapsed().as_millis() as u64;
                                let stats = format.stats();
                                let rate_mbs = read * 1000 / (elapsed_ms + 1);
                                let mut line = format!(
                                    "{percentage}% read ({read}/{total} MB, {rate_mbs} MB/s)"
                                );
                                // Estimate remaining time by linearly extrapolating the
                                // elapsed time over the bytes still to be read.
                                if pos > 0 && pos < total_bytes {
                                    let eta_s = elapsed_ms * (total_bytes - pos) / pos / 1000;
                                    line += &format!(", ETA {eta_s}s");
                                }
                                if uncompressed != read {
                                    line += &format!(" ({uncompressed} MB uncompressed)");
                                }
                                if !stats.is_empty() {
                                    line += &format!(" - {stats}");
                                }

                                // `\r` returns to the start of the line and `\x1b[2K` erases
                                // it, so a shorter update doesn't leave behind characters from
                                // a longer previous one.
                                print!("\r\x1b[2K{line}");
                                let _ = io::stdout().flush();
                            }
                            if current_read >= stop_at {
                                println!(
                                    "Stopped reading file as requested by STOP_AT env var. \
                                     Waiting for new file..."
                                );
                                self.wait_for_new_file(&mut file);
                                return true;
                            }
                        }
                    }
                }
                Err(err) => {
                    if err.kind() == io::ErrorKind::UnexpectedEof
                        || err.kind() == io::ErrorKind::InvalidInput
                    {
                        self.store.write().optimize();
                        if let Some(value) = self.wait_for_more_data(
                            &mut file,
                            &mut initial_read,
                            format.as_ref().map(|(f, _)| f),
                        ) {
                            return value;
                        }
                    } else {
                        // Error reading file, maybe it was removed
                        println!("Error reading trace file: {err:?}");
                        return true;
                    }
                }
            }
        }
    }

    fn wait_for_more_data(
        &mut self,
        file: &mut TraceFile,
        initial_read: &mut Option<(u64, Instant)>,
        format: Option<&ErasedTraceFormat>,
    ) -> Option<bool> {
        let Ok(pos) = file.stream_position() else {
            return Some(true);
        };
        if let Some((total, start)) = initial_read.take() {
            // Erase the in-place progress line (printed with a leading `\r` and
            // no newline); it's no longer useful once the read is complete.
            print!("\r\x1b[2K");
            let stats = format.map(|format| format.stats()).unwrap_or_default();
            if total > MIN_INITIAL_REPORT_SIZE {
                let elapsed = (start.elapsed().as_millis() / 100) as f32 / 10.0;
                print!(
                    "Initial read completed ({} MB, {elapsed}s)",
                    total / (1024 * 1024),
                );
                if !stats.is_empty() {
                    print!(" - {stats}");
                }
                println!();
            } else if !stats.is_empty() {
                println!("{stats}");
            }
        }
        loop {
            // No more data to read, sleep for a while to wait for more data
            thread::sleep(Duration::from_millis(100));
            let Ok(mut real_file) = File::open(&self.path) else {
                return Some(true);
            };
            let Ok(end) = real_file.seek(SeekFrom::End(0)) else {
                return Some(true);
            };
            if end < pos {
                // new file
                return Some(true);
            } else if end != pos {
                // file has more data
                return None;
            }
        }
    }

    fn wait_for_new_file(&self, file: &mut TraceFile) {
        let Ok(pos) = file.stream_position() else {
            return;
        };
        loop {
            thread::sleep(Duration::from_millis(1000));
            let Ok(end) = file.size() else {
                return;
            };
            if end < pos {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{borrow::Cow, io::Write, time::Duration};

    use turbopack_trace_utils::tracing::TraceRow;

    use super::*;

    const TIMEOUT: Duration = Duration::from_secs(30);

    /// Serialized rows for `count` child spans of a root span, plus the root span itself.
    fn span_rows(first_id: u64, count: u64) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut push = |row: TraceRow<'_>| bytes.extend(postcard::to_stdvec(&row).unwrap());
        for id in first_id..first_id + count {
            push(TraceRow::Start {
                ts: id,
                id,
                parent: (id != 1).then_some(1),
                name: Cow::Borrowed("span"),
                target: Cow::Borrowed("test"),
                values: Vec::new(),
            });
            push(TraceRow::Enter {
                ts: id,
                id,
                thread_id: 1,
                allocations: None,
            });
            push(TraceRow::Exit {
                ts: id + 1,
                id,
                thread_id: 1,
                allocations: None,
            });
            if id != 1 {
                push(TraceRow::End { ts: id + 1, id });
            }
        }
        bytes
    }

    fn trace(spans: u64) -> Vec<u8> {
        let mut bytes = b"TRACEv0".to_vec();
        bytes.extend(span_rows(1, spans));
        bytes
    }

    fn gzip(data: &[u8]) -> Vec<u8> {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    fn zstd(data: &[u8]) -> Vec<u8> {
        zstd::encode_all(data, 3).unwrap()
    }

    /// Reads one trace file with a [`TraceReader`] on a background thread, like the server
    /// does, but only for a single [`TraceReader::try_read`] pass. Dropping it deletes the file,
    /// which makes the reader stop waiting for more data, and joins the reader thread.
    struct ReaderFixture {
        dir: PathBuf,
        path: PathBuf,
        store: Arc<StoreContainer>,
        thread: Option<JoinHandle<bool>>,
    }

    impl ReaderFixture {
        fn new(name: &str, data: &[u8]) -> Self {
            let dir =
                env::temp_dir().join(format!("trace-server-test-{}-{name}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join(name);
            std::fs::write(&path, data).unwrap();
            let store = Arc::new(StoreContainer::new());
            let mut reader = TraceReader {
                store: store.clone(),
                path: path.clone(),
            };
            let thread = thread::spawn(move || reader.try_read());
            Self {
                dir,
                path,
                store,
                thread: Some(thread),
            }
        }

        fn append(&self, data: &[u8]) {
            std::fs::OpenOptions::new()
                .append(true)
                .open(&self.path)
                .unwrap()
                .write_all(data)
                .unwrap();
        }

        fn span_count(&self) -> usize {
            // Excluding the store's synthetic root span.
            self.store.read().spans.len() - 1
        }

        fn wait_for_span_count(&self, expected: usize) {
            let start = Instant::now();
            while self.span_count() != expected {
                assert!(
                    start.elapsed() < TIMEOUT,
                    "expected {expected} spans, got {}",
                    self.span_count()
                );
                thread::sleep(Duration::from_millis(20));
            }
        }
    }

    impl Drop for ReaderFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            if let Some(thread) = self.thread.take() {
                let result = thread.join();
                if !thread::panicking() {
                    result.expect("reader thread panicked");
                }
            }
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn loads_raw_zstd_gzip_identically() {
        // Multiple batches worth of data.
        let spans = 100_000;
        let raw = trace(spans);
        assert!(raw.len() > 2 * BATCH_SIZE);
        for (name, data) in [
            ("identical.trace", raw.clone()),
            ("identical.trace.zst", zstd(&raw)),
            ("identical.trace.gz", gzip(&raw)),
        ] {
            let reader = ReaderFixture::new(name, &data);
            reader.wait_for_span_count(spans as usize);
        }
    }

    #[test]
    fn raw_live_tail_picks_up_appended_data() {
        let reader = ReaderFixture::new("live.trace", &trace(1_000));
        reader.wait_for_span_count(1_000);
        reader.append(&span_rows(1_001, 500));
        reader.wait_for_span_count(1_500);
    }

    #[test]
    fn truncated_compressed_loads_prefix() {
        let raw = trace(100_000);
        for (name, mut data) in [
            ("truncated.trace.zst", zstd(&raw)),
            ("truncated.trace.gz", gzip(&raw)),
        ] {
            data.truncate(data.len() / 2);
            let reader = ReaderFixture::new(name, &data);
            let start = Instant::now();
            while reader.span_count() < 10_000 {
                assert!(start.elapsed() < TIMEOUT, "{name}: prefix was not loaded");
                thread::sleep(Duration::from_millis(20));
            }
            assert!(
                reader.span_count() < 100_000,
                "{name}: loaded more than the prefix"
            );
        }
    }
}
