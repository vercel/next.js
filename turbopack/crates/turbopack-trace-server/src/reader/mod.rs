use std::{
    env,
    fs::File,
    io::{self, BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::Arc,
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use flate2::bufread::GzDecoder;

use crate::{store_container::StoreContainer, trace::TraceParser};

const MIN_INITIAL_REPORT_SIZE: u64 = 100 * 1024 * 1024;

#[derive(Default)]
enum TraceFile {
    Raw(BufReader<File>),
    Zstd(zstd::Decoder<'static, BufReader<File>>),
    Gz(GzDecoder<BufReader<File>>),
    #[default]
    Unloaded,
}

impl TraceFile {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Raw(file) => file.read(buffer),
            Self::Zstd(decoder) => decoder.read(buffer),
            Self::Gz(decoder) => decoder.read(buffer),
            Self::Unloaded => unreachable!(),
        }
    }

    fn stream_position(&mut self) -> io::Result<u64> {
        match self {
            Self::Raw(file) => file.stream_position(),
            Self::Zstd(decoder) => decoder.get_mut().stream_position(),
            Self::Gz(decoder) => decoder.get_mut().stream_position(),
            Self::Unloaded => unreachable!(),
        }
    }

    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        match self {
            Self::Raw(file) => file.seek(pos),
            Self::Zstd(decoder) => decoder.get_mut().seek(pos),
            Self::Gz(decoder) => decoder.get_mut().seek(pos),
            Self::Unloaded => unreachable!(),
        }
    }

    fn size(&mut self) -> io::Result<u64> {
        match self {
            Self::Raw(file) => file.get_ref().metadata().map(|m| m.len()),
            Self::Zstd(decoder) => decoder.get_mut().get_ref().metadata().map(|m| m.len()),
            Self::Gz(decoder) => decoder.get_mut().get_ref().metadata().map(|m| m.len()),
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
        Ok(
            if path.ends_with(".zst") || magic_bytes == [0x28, 0xb5, 0x2f, 0xfd] {
                TraceFile::Zstd(zstd::Decoder::with_buffer(file)?)
            } else if path.ends_with(".gz") || matches!(magic_bytes, [0x1f, 0x8b, _, _]) {
                TraceFile::Gz(GzDecoder::new(file))
            } else {
                TraceFile::Raw(file)
            },
        )
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

        let mut parser = TraceParser::new(self.store.clone());

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
                println!("Error creating zstd decoder: {err}");
                return false;
            }
        };

        let mut chunk = vec![0; 64 * 1024 * 1024];
        loop {
            match file.read(&mut chunk) {
                Ok(bytes_read) => {
                    if bytes_read == 0 {
                        self.store.write().optimize();
                        if let Some(value) =
                            self.wait_for_more_data(&mut file, &mut initial_read, Some(&parser))
                        {
                            return value;
                        }
                    } else {
                        if let Err(err) = parser.push(&chunk[..bytes_read]) {
                            println!("Trace file error: {err}");
                            return true;
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
                            let stats = parser.stats();
                            let rate_mbs = read * 1000 / (elapsed_ms + 1);
                            let mut line =
                                format!("{percentage}% read ({read}/{total} MB, {rate_mbs} MB/s)");
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
                                "Stopped reading file as requested by STOP_AT env var. Waiting \
                                 for new file..."
                            );
                            self.wait_for_new_file(&mut file);
                            return true;
                        }
                    }
                }
                Err(err) => {
                    if err.kind() == io::ErrorKind::UnexpectedEof
                        || err.kind() == io::ErrorKind::InvalidInput
                    {
                        self.store.write().optimize();
                        if let Some(value) =
                            self.wait_for_more_data(&mut file, &mut initial_read, Some(&parser))
                        {
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
        parser: Option<&TraceParser>,
    ) -> Option<bool> {
        let Ok(pos) = file.stream_position() else {
            return Some(true);
        };
        if let Some((total, start)) = initial_read.take() {
            // Erase the in-place progress line (printed with a leading `\r` and
            // no newline); it's no longer useful once the read is complete.
            print!("\r\x1b[2K");
            let stats = parser.map(TraceParser::stats).unwrap_or_default();
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
            let Ok(end) = file.seek(SeekFrom::End(0)) else {
                return;
            };
            if end < pos {
                return;
            }
        }
    }
}
