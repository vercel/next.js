mod heaptrack;
mod nextjs;
mod turbopack;

use std::{
    any::Any,
    env,
    fs::File,
    io::{self, BufReader, Read, Seek, SeekFrom},
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

const MIN_INITIAL_REPORT_SIZE: u64 = 100 * 1024 * 1024;

trait TraceFormat {
    type Reused: Default;
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
        Box::new(T::Reused::default())
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
    Raw(File),
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
            Self::Raw(file) => file.metadata().map(|m| m.len()),
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
        Ok(if path.ends_with(".zst") {
            TraceFile::Zstd(zstd::Decoder::new(file)?)
        } else if path.ends_with(".gz") {
            TraceFile::Gz(GzDecoder::new(BufReader::new(file)))
        } else {
            TraceFile::Raw(file)
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
                println!("Error creating zstd decoder: {err}");
                return false;
            }
        };

        let mut buffer = Vec::new();
        let mut index = 0;

        let mut chunk = vec![0; 64 * 1024 * 1024];
        loop {
            match file.read(&mut chunk) {
                Ok(bytes_read) => {
                    if bytes_read == 0 {
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
                            let prev_read = current_read;
                            current_read += bytes_read as u64;
                            if let Some((total, start)) = &mut initial_read {
                                let old_mbs = prev_read / (97 * 1024 * 1024);
                                let new_mbs = current_read / (97 * 1024 * 1024);
                                if old_mbs != new_mbs {
                                    let pos = file.stream_position().unwrap_or(current_read);
                                    if pos > *total {
                                        *total = file.size().unwrap_or(pos);
                                    }
                                    *total = (*total).max(pos);
                                    let percentage = pos * 100 / *total;
                                    let read = pos / (1024 * 1024);
                                    let uncompressed = current_read / (1024 * 1024);
                                    let total = *total / (1024 * 1024);
                                    let stats = format.stats();
                                    print!(
                                        "{}% read ({}/{} MB, {} MB/s)",
                                        percentage,
                                        read,
                                        total,
                                        read * 1000 / (start.elapsed().as_millis() + 1) as u64
                                    );
                                    if uncompressed != read {
                                        print!(" ({} MB uncompressed)", uncompressed);
                                    }
                                    if stats.is_empty() {
                                        println!();
                                    } else {
                                        println!(" - {}", stats);
                                    }
                                }
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
                    if err.kind() == io::ErrorKind::UnexpectedEof {
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
            if let Some(format) = format {
                let stats = format.stats();
                println!("{}", stats);
            }
            if total > MIN_INITIAL_REPORT_SIZE {
                println!(
                    "Initial read completed ({} MB, {}s)",
                    total / (1024 * 1024),
                    (start.elapsed().as_millis() / 100) as f32 / 10.0
                );
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
