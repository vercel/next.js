use std::{
    fs::File,
    io::{self, Write},
    num::NonZeroU64,
    path::{Path, PathBuf},
};

/// Parse a positive byte count with an optional decimal k, m, or g suffix.
pub(crate) fn parse_split_size(value: &str) -> Option<NonZeroU64> {
    let (digits, multiplier) = match value.as_bytes().last() {
        Some(b'k') => (&value[..value.len() - 1], 1_000),
        Some(b'm') => (&value[..value.len() - 1], 1_000_000),
        Some(b'g') => (&value[..value.len() - 1], 1_000_000_000),
        _ => (value, 1),
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    NonZeroU64::new(digits.parse::<u64>().ok()?.checked_mul(multiplier)?)
}

pub(crate) enum TraceFileWriter {
    Single(File),
    Split {
        file: File,
        path: PathBuf,
        size: NonZeroU64,
        written: u64,
        part: u64,
    },
}

impl TraceFileWriter {
    /// Split the bytes reaching this sink, not trace records. When compressing, wrap this sink in
    /// the encoder so the limit applies to bytes on disk, including the compression footer.
    pub(crate) fn new(path: &Path, split_size: Option<NonZeroU64>) -> io::Result<Self> {
        Ok(if let Some(size) = split_size {
            Self::Split {
                file: File::create(part_path(path, 0))?,
                path: path.to_owned(),
                size,
                written: 0,
                part: 0,
            }
        } else {
            Self::Single(File::create(path)?)
        })
    }
}

fn part_path(path: &Path, part: u64) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(format!(".{part:05}"));
    PathBuf::from(name)
}

impl Write for TraceFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Single(file) => file.write(buf),
            Self::Split {
                file,
                path,
                size,
                written,
                part,
            } => {
                // Rotate only on a non-empty write, avoiding an empty trailing part at an exact
                // boundary (including when the caller flushes or drops the writer).
                if buf.is_empty() {
                    return Ok(0);
                }
                if *written == size.get() {
                    let next_part = part
                        .checked_add(1)
                        .ok_or_else(|| io::Error::other("Trace output part number overflow"))?;
                    *file = File::create(part_path(path, next_part))?;
                    *part = next_part;
                    *written = 0;
                }
                let len = (buf.len() as u64).min(size.get() - *written) as usize;
                let len = file.write(&buf[..len])?;
                *written += len as u64;
                Ok(len)
            }
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Single(file) | Self::Split { file, .. } => file.flush(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        num::NonZeroU64,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
    };

    use flate2::{Compression, read::GzDecoder, write::GzEncoder};
    use turbopack_trace_utils::trace_writer::TraceWriter;

    use super::{TraceFileWriter, parse_split_size, part_path};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "next-trace-split-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&dir).unwrap();
            Self(dir)
        }

        fn path(&self) -> PathBuf {
            self.0.join("trace-turbopack.bin")
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn read_parts(path: &Path, size: u64) -> (Vec<u8>, usize) {
        let mut output = Vec::new();
        let mut part = 0;
        while part_path(path, part).exists() {
            let bytes = fs::read(part_path(path, part)).unwrap();
            assert!(!bytes.is_empty(), "empty part {part}");
            assert!(bytes.len() as u64 <= size, "oversized part {part}");
            if part_path(path, part + 1).exists() {
                assert_eq!(bytes.len() as u64, size);
            }
            output.extend(bytes);
            part += 1;
        }
        assert!(!path.exists(), "unexpected unsplit file");
        (output, part as usize)
    }

    #[test]
    fn split_size_decimal_units() {
        for (value, size) in [
            ("1", 1),
            ("0007", 7),
            ("1000", 1000),
            ("2k", 2000),
            ("100m", 100_000_000),
            ("3g", 3_000_000_000),
            ("18446744073709551615", u64::MAX),
        ] {
            assert_eq!(parse_split_size(value).unwrap().get(), size, "{value}");
        }
    }

    #[test]
    fn split_size_rejects_invalid_and_overflow() {
        for value in [
            "",
            "0",
            "00",
            "0k",
            "0m",
            "0g",
            "k",
            "m",
            "g",
            "-1",
            "+1",
            " 1",
            "1 ",
            "1.5m",
            "1K",
            "1M",
            "1G",
            "1b",
            "1B",
            "1t",
            "1kb",
            "1KiB",
            "1MB",
            "1e3",
            "18446744073709551616",
            "18446744073709552k",
            "18446744073710m",
            "18446744074g",
            "é",
            "🦀k",
        ] {
            assert!(parse_split_size(value).is_none(), "accepted {value:?}");
        }
    }

    #[test]
    fn split_writes_preserve_bytes_and_boundaries() {
        let bytes: Vec<u8> = (0..127).collect();
        for size in [1, 7, 16, 127, 128] {
            for chunk_size in [1, 5, 16, 127] {
                let dir = TestDir::new();
                let path = dir.path();
                let mut writer = TraceFileWriter::new(&path, NonZeroU64::new(size)).unwrap();
                for chunk in bytes.chunks(chunk_size) {
                    writer.write_all(chunk).unwrap();
                    writer.flush().unwrap();
                    assert_eq!(writer.write(&[]).unwrap(), 0);
                }
                drop(writer);
                let (output, count) = read_parts(&path, size);
                assert_eq!(output, bytes);
                assert_eq!(count as u64, (bytes.len() as u64).div_ceil(size));
                assert_eq!(fs::read_dir(&dir.0).unwrap().count(), count);
            }
        }
    }

    #[test]
    fn part_names_preserve_prefix() {
        for prefix in ["trace.bin", "relative/path/trace.bin", "/absolute/trace.gz"] {
            assert_eq!(
                part_path(Path::new(prefix), 0),
                PathBuf::from(format!("{prefix}.00000"))
            );
            assert_eq!(
                part_path(Path::new(prefix), 12),
                PathBuf::from(format!("{prefix}.00012"))
            );
            assert_eq!(
                part_path(Path::new(prefix), 100_000),
                PathBuf::from(format!("{prefix}.100000"))
            );
        }
    }

    #[test]
    fn unsplit_writer_preserves_original_path() {
        let dir = TestDir::new();
        let path = dir.path();
        let mut writer = TraceFileWriter::new(&path, None).unwrap();
        writer.write_all(b"TRACEv0data").unwrap();
        writer.flush().unwrap();
        drop(writer);
        assert_eq!(fs::read(path).unwrap(), b"TRACEv0data");
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
    }

    #[test]
    fn split_gzip_reconstructs_stream_including_footer() {
        let data: Vec<u8> = (0..4096).map(|i| (i * 37) as u8).collect();
        for compression in [Compression::fast(), Compression::best()] {
            for size in [1, 7, 100] {
                let dir = TestDir::new();
                let path = dir.path();
                let writer = TraceFileWriter::new(&path, NonZeroU64::new(size)).unwrap();
                let mut encoder = GzEncoder::new(writer, compression);
                for chunk in data.chunks(257) {
                    encoder.write_all(chunk).unwrap();
                }
                // Gzip is finalized on drop, as in the background TraceWriter.
                drop(encoder);
                let (output, _) = read_parts(&path, size);
                let mut decoded = Vec::new();
                GzDecoder::new(output.as_slice())
                    .read_to_end(&mut decoded)
                    .unwrap();
                assert_eq!(decoded, data);
            }
        }
    }

    #[test]
    fn background_writer_shutdown_preserves_header_and_data() {
        for size in [1, 7, 16] {
            let dir = TestDir::new();
            let path = dir.path();
            let sink = TraceFileWriter::new(&path, NonZeroU64::new(size)).unwrap();
            let (writer, guard) = TraceWriter::new(sink);
            {
                let mut buffer = writer.start_write();
                buffer.extend(b"buffered trace data");
            }
            drop(guard);
            let (output, _) = read_parts(&path, size);
            assert_eq!(output, b"TRACEv0buffered trace data");
        }
    }

    #[test]
    fn missing_output_directory_is_reported() {
        let dir = TestDir::new();
        let path = dir.0.join("missing/trace.bin");
        assert!(TraceFileWriter::new(&path, NonZeroU64::new(7)).is_err());
        assert!(TraceFileWriter::new(&path, None).is_err());
    }
}
