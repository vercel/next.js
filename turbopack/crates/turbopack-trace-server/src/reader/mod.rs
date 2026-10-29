mod heaptrack;
mod nextjs;
mod threaded;
pub(crate) mod turbopack;

use std::{
    any::Any,
    env,
    fs::{self, File, Metadata},
    io::{self, BufReader, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Arc,
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime},
};

use anyhow::Result;
use flate2::bufread::GzDecoder;
use turbopack_trace_utils::tracing::{TRACE_HEADER, TRACE_HEADER_PREFIX, check_trace_header};

use crate::{
    reader::{heaptrack::HeaptrackFormat, nextjs::NextJsFormat, turbopack::TurbopackFormat},
    store_container::StoreContainer,
};

/// How much data is handed to the trace format at once. The format does some work per batch
/// (e.g. invalidating cached span data), so batches shouldn't be tiny, but large batches parse
/// noticeably slower (1 MB batches loaded traces ~1.3-1.6x faster than 64 MB batches).
const BATCH_SIZE: usize = 1024 * 1024;

const MIN_INITIAL_REPORT_SIZE: u64 = 100 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
enum FormatKind {
    Turbopack,
    NextJs,
    Heaptrack,
}

const NEXT_JS_PREFIX: &[u8] = b"[{\"name\"";
const HEAPTRACK_PREFIX: &[u8] = b"v ";

/// Detects the format of a trace file from its (decompressed) start. Returns `None` when more
/// data is needed to decide.
fn detect_format(buffer: &[u8]) -> Result<Option<FormatKind>> {
    let could_be = |prefix: &[u8]| {
        let len = buffer.len().min(prefix.len());
        buffer[..len] == prefix[..len]
    };
    if could_be(TRACE_HEADER_PREFIX) {
        if buffer.len() < TRACE_HEADER.len() {
            return Ok(None);
        }
        check_trace_header(buffer)?;
        return Ok(Some(FormatKind::Turbopack));
    }
    if could_be(NEXT_JS_PREFIX) {
        return Ok((buffer.len() >= NEXT_JS_PREFIX.len()).then_some(FormatKind::NextJs));
    }
    if could_be(HEAPTRACK_PREFIX) {
        return Ok((buffer.len() >= HEAPTRACK_PREFIX.len()).then_some(FormatKind::Heaptrack));
    }
    anyhow::bail!(
        "Unknown trace file format (expected a {} header, a Next.js trace or a heaptrack file)",
        String::from_utf8_lossy(TRACE_HEADER)
    );
}

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

    /// Metadata of the opened file on disk.
    fn metadata(&self) -> io::Result<Metadata> {
        match self {
            Self::Raw(file) => file.get_ref().metadata(),
            Self::Compressed { file, .. } => file.metadata(),
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

/// Identifies one version of the trace file on disk, to notice when it is written to, truncated or
/// replaced. Only uses metadata, so a rewrite that keeps all of these the same isn't noticed.
#[derive(Debug, PartialEq, Eq)]
struct FileVersion {
    len: u64,
    modified: Option<SystemTime>,
    created: Option<SystemTime>,
    /// Device and inode, which identify the file itself on unix.
    #[cfg(unix)]
    file_id: (u64, u64),
}

impl FileVersion {
    fn from_metadata(metadata: &Metadata) -> Self {
        Self {
            len: metadata.len(),
            modified: metadata.modified().ok(),
            created: metadata.created().ok(),
            #[cfg(unix)]
            file_id: {
                use std::os::unix::fs::MetadataExt;
                (metadata.dev(), metadata.ino())
            },
        }
    }

    fn of_path(path: &Path) -> Option<Self> {
        fs::metadata(path)
            .ok()
            .map(|metadata| Self::from_metadata(&metadata))
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
                        if format.is_none() {
                            let kind = match detect_format(&buffer) {
                                Ok(Some(kind)) => kind,
                                // Not enough data yet
                                Ok(None) => continue,
                                Err(err) => {
                                    println!("Trace file error: {err}");
                                    self.wait_for_file_change(&file);
                                    return true;
                                }
                            };
                            let erased_format = match kind {
                                FormatKind::Turbopack => {
                                    index = TRACE_HEADER.len();
                                    ErasedTraceFormat(Box::new(TurbopackFormat::new(
                                        self.store.clone(),
                                    )))
                                }
                                FormatKind::NextJs => ErasedTraceFormat(Box::new(
                                    NextJsFormat::new(self.store.clone()),
                                )),
                                FormatKind::Heaptrack => ErasedTraceFormat(Box::new(
                                    HeaptrackFormat::new(self.store.clone()),
                                )),
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
                                    self.wait_for_file_change(&file);
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

    /// Waits until the file at the trace path differs from `file`, which was rejected with a
    /// format error, so the same error isn't reported again and again. Only checks metadata, at
    /// most once per second. Also returns when the file is removed.
    fn wait_for_file_change(&self, file: &TraceFile) {
        println!("Waiting for the trace file to change...");
        let version = file
            .metadata()
            .ok()
            .map(|metadata| FileVersion::from_metadata(&metadata));
        wait_for_file_version_change(&self.path, version.as_ref(), Duration::from_secs(1));
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

/// Polls the metadata of `path` every `interval` until it no longer matches `version`, or the file
/// is removed.
fn wait_for_file_version_change(path: &Path, version: Option<&FileVersion>, interval: Duration) {
    loop {
        thread::sleep(interval);
        match FileVersion::of_path(path) {
            Some(current) if Some(&current) == version => {}
            _ => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{borrow::Cow, io::Write, time::Duration};

    use turbopack_trace_utils::tracing::{TimestampEncoder, TraceRow};

    use super::*;

    const TIMEOUT: Duration = Duration::from_secs(30);

    /// Serialized rows for `count` child spans of a root span, plus the root span itself. Like a
    /// buffer of the trace writer, the timestamps are delta encoded after a
    /// [`TraceRow::TimestampBase`].
    fn span_rows(first_id: u64, count: u64) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut encoder = TimestampEncoder::default();
        let mut push = |row: TraceRow<'_, u64>| {
            let (base, row) = encoder.encode_row(row);
            if let Some(base) = base {
                bytes.extend(postcard::to_stdvec(&base).unwrap());
            }
            bytes.extend(postcard::to_stdvec(&row).unwrap());
        };
        for id in first_id..first_id + count {
            let ts = id;
            push(TraceRow::Start {
                ts,
                id,
                parent: (id != 1).then_some(1),
                name: Cow::Borrowed("span"),
                target: Cow::Borrowed("test"),
                values: Vec::new(),
            });
            push(TraceRow::Enter {
                ts,
                id,
                thread_id: 1,
                allocations: None,
            });
            push(TraceRow::Exit {
                ts: ts + 1,
                id,
                thread_id: 1,
                allocations: None,
            });
            if id != 1 {
                push(TraceRow::End { ts: ts + 1, id });
            }
        }
        bytes
    }

    fn trace(spans: u64) -> Vec<u8> {
        let mut bytes = TRACE_HEADER.to_vec();
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

        fn is_finished(&self) -> bool {
            self.thread
                .as_ref()
                .is_none_or(|thread| thread.is_finished())
        }

        /// Waits for the current [`TraceReader::try_read`] pass to return, then starts the next
        /// one on the same file, like [`TraceReader::run`] does.
        fn restart_after_return(&mut self) {
            let start = Instant::now();
            while !self.is_finished() {
                assert!(start.elapsed() < TIMEOUT, "reader did not return");
                thread::sleep(Duration::from_millis(20));
            }
            self.thread.take().unwrap().join().unwrap();
            let mut reader = TraceReader {
                store: self.store.clone(),
                path: self.path.clone(),
            };
            self.thread = Some(thread::spawn(move || reader.try_read()));
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

    /// A file that is rejected with a format error is not read again until it changes, so the
    /// error isn't repeated twice a second. Replacing it with a valid trace loads that trace.
    #[test]
    fn waits_for_change_after_format_error() {
        for (name, data) in [
            // Unsupported version (header detection error)
            ("old-version.trace", b"TRACEv0\x00\x01\x02".to_vec()),
            // Corrupt data after a valid header (decode error)
            ("corrupt.trace", [TRACE_HEADER, &[0xff; 12]].concat()),
        ] {
            let mut reader = ReaderFixture::new(name, &data);
            // Previously, `try_read` returned right away and `run` read the file again after
            // 500 ms. Several of those retry intervals pass here without the file changing.
            thread::sleep(Duration::from_millis(2_500));
            assert!(
                !reader.is_finished(),
                "{name}: reader returned without the file changing"
            );
            std::fs::write(&reader.path, trace(1_000)).unwrap();
            reader.restart_after_return();
            reader.wait_for_span_count(1_000);
        }
    }

    /// Each kind of change to a rejected file ends the wait: a different size, a rewrite with the
    /// same size (new modification time), a replacement by another file, and removal.
    #[test]
    fn file_version_detects_changes() {
        let dir = env::temp_dir().join(format!("trace-server-test-{}-version", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("version.trace");
        let version = |path: &Path| FileVersion::of_path(path).unwrap();
        let modified_at = |path: &Path, time: SystemTime| {
            File::options()
                .write(true)
                .open(path)
                .unwrap()
                .set_modified(time)
                .unwrap();
        };
        let time = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);

        fs::write(&path, b"aaaa").unwrap();
        modified_at(&path, time);
        let original = version(&path);
        assert_eq!(version(&path), original, "unchanged file");

        fs::write(&path, b"aaaaa").unwrap();
        modified_at(&path, time);
        assert_ne!(version(&path), original, "different size");

        fs::write(&path, b"bbbb").unwrap();
        modified_at(&path, time + Duration::from_secs(1));
        assert_ne!(version(&path), original, "same size, rewritten");

        fs::write(&path, b"aaaa").unwrap();
        modified_at(&path, time);
        let before_replace = version(&path);
        let replacement = dir.join("replacement.trace");
        fs::write(&replacement, b"aaaa").unwrap();
        modified_at(&replacement, time);
        fs::rename(&replacement, &path).unwrap();
        // Same size and modification time, but on unix another inode.
        #[cfg(unix)]
        assert_ne!(version(&path), before_replace, "replaced file");
        #[cfg(not(unix))]
        let _ = before_replace;

        // Waiting returns once the file is removed.
        let waiting_for = version(&path);
        let wait_path = path.clone();
        let waiter = thread::spawn(move || {
            wait_for_file_version_change(&wait_path, Some(&waiting_for), Duration::from_millis(20))
        });
        thread::sleep(Duration::from_millis(200));
        assert!(!waiter.is_finished(), "returned for an unchanged file");
        fs::remove_file(&path).unwrap();
        let start = Instant::now();
        while !waiter.is_finished() {
            assert!(start.elapsed() < TIMEOUT, "did not return after removal");
            thread::sleep(Duration::from_millis(20));
        }
        waiter.join().unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn detects_trace_formats() {
        assert_eq!(detect_format(b"").unwrap(), None);
        assert_eq!(detect_format(b"TRACE").unwrap(), None);
        assert_eq!(
            detect_format(b"TRACEv1").unwrap(),
            Some(FormatKind::Turbopack)
        );
        assert_eq!(
            detect_format(b"TRACEv1\x00\x01").unwrap(),
            Some(FormatKind::Turbopack)
        );
        assert_eq!(detect_format(b"[{\"na").unwrap(), None);
        assert_eq!(
            detect_format(b"[{\"name\":").unwrap(),
            Some(FormatKind::NextJs)
        );
        assert_eq!(detect_format(b"v").unwrap(), None);
        assert_eq!(
            detect_format(b"v 1.0").unwrap(),
            Some(FormatKind::Heaptrack)
        );
    }

    #[test]
    fn rejects_old_and_unknown_formats() {
        // Also a file that only consists of the old header
        for data in [&b"TRACEv0"[..], b"TRACEv0\x00\x01"] {
            assert_eq!(
                detect_format(data).unwrap_err().to_string(),
                "Unsupported trace file version: expected TRACEv1, found TRACEv0"
            );
        }
        // Old files without any header
        assert!(
            detect_format(b"\x00\x01\x02")
                .unwrap_err()
                .to_string()
                .starts_with("Unknown trace file format")
        );
    }
}
