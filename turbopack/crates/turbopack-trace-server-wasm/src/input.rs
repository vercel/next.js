use std::{
    io::{self, Write},
    sync::Arc,
};

use flate2::write::GzDecoder;
use turbopack_trace_server::{TraceParser, store_container::StoreContainer};

/// Bound the bytes handed to the parser, including when one compressed input
/// chunk expands far beyond its size. GzDecoder writes directly to this sink;
/// no vector stages the expansion before trace validation.
const PARSE_BATCH_SIZE: usize = 64 * 1024;
const PREFIX_SIZE: usize = 4;

struct ParserSink {
    parser: TraceParser,
    bytes_read: usize,
    #[cfg(test)]
    attempted_bytes: usize,
    #[cfg(test)]
    parser_pushes: usize,
}

impl ParserSink {
    fn push(&mut self, bytes: &[u8]) -> io::Result<()> {
        #[cfg(test)]
        {
            self.attempted_bytes += bytes.len();
            self.parser_pushes += 1;
        }
        self.parser.push(bytes).map_err(io::Error::other)?;
        self.bytes_read += bytes.len();
        Ok(())
    }
}

impl Write for ParserSink {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let len = bytes.len().min(PARSE_BATCH_SIZE);
        self.push(&bytes[..len])?;
        Ok(len)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

enum Compression {
    Undetermined(ParserSink),
    Raw(ParserSink),
    Gzip(Box<GzDecoder<ParserSink>>),
}

impl Compression {
    fn sink(&self) -> &ParserSink {
        match self {
            Self::Undetermined(sink) | Self::Raw(sink) => sink,
            Self::Gzip(decoder) => decoder.get_ref(),
        }
    }
}

/// Incremental raw/gzip input with a bounded compression-detection prefix and
/// direct, bounded decompression-to-parser writes.
pub(crate) struct TraceInput {
    compression: Option<Compression>,
    prefix: Vec<u8>,
}

impl TraceInput {
    pub(crate) fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            compression: Some(Compression::Undetermined(ParserSink {
                parser: TraceParser::new(store),
                bytes_read: 0,
                #[cfg(test)]
                attempted_bytes: 0,
                #[cfg(test)]
                parser_pushes: 0,
            })),
            prefix: Vec::with_capacity(PREFIX_SIZE),
        }
    }

    pub(crate) fn push(&mut self, mut bytes: &[u8]) -> io::Result<()> {
        if matches!(self.compression, Some(Compression::Undetermined(_))) {
            let len = (PREFIX_SIZE - self.prefix.len()).min(bytes.len());
            self.prefix.extend_from_slice(&bytes[..len]);
            bytes = &bytes[len..];
            if self.prefix.len() < PREFIX_SIZE {
                return Ok(());
            }

            const GZIP_MAGIC: &[u8] = &[0x1f, 0x8b];
            const ZSTD_MAGIC: &[u8] = &[0x28, 0xb5, 0x2f, 0xfd];
            if self.prefix.starts_with(ZSTD_MAGIC) {
                return Err(io::Error::other(
                    "zstd-compressed traces are not supported by the WASM trace engine",
                ));
            }

            let Some(Compression::Undetermined(sink)) = self.compression.take() else {
                unreachable!();
            };
            let mut compression = if self.prefix.starts_with(GZIP_MAGIC) {
                Compression::Gzip(Box::new(GzDecoder::new(sink)))
            } else {
                Compression::Raw(sink)
            };
            let result = Self::write(&mut compression, &self.prefix);
            self.compression = Some(compression);
            result?;
            self.prefix.clear();
        }
        Self::write(self.compression.as_mut().unwrap(), bytes)
    }

    fn write(compression: &mut Compression, bytes: &[u8]) -> io::Result<()> {
        match compression {
            // Raw bytes are already resident in the caller's chunk. Preserve
            // its batch size rather than add unnecessary invalidation passes.
            Compression::Raw(sink) => sink.push(bytes),
            Compression::Gzip(decoder) => {
                decoder.write_all(bytes)?;
                // Drain flate2's bounded internal output buffer at every read;
                // flush is not finish, so later compressed chunks are allowed.
                decoder.flush()
            }
            Compression::Undetermined(_) => unreachable!(),
        }
    }

    pub(crate) fn uncompressed_bytes_read(&self) -> usize {
        self.compression.as_ref().unwrap().sink().bytes_read
    }

    pub(crate) fn stats(&self) -> String {
        self.compression.as_ref().unwrap().sink().parser.stats()
    }
}

#[cfg(test)]
mod tests {
    use flate2::{Compression as GzipCompression, write::GzEncoder};

    use super::*;

    fn gzip(bytes: &[u8]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), GzipCompression::default());
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    }

    fn input() -> TraceInput {
        TraceInput::new(Arc::new(StoreContainer::new()))
    }

    #[test]
    fn compressed_invalid_trace_is_rejected_in_first_bounded_batch() {
        let compressed = gzip(&vec![b'x'; 8 * 1024 * 1024]);
        assert!(compressed.len() < PARSE_BATCH_SIZE);
        let mut input = input();
        let error = input.push(&compressed).unwrap_err();
        assert!(error.to_string().contains("Unknown trace file format"));
        let attempted = input.compression.as_ref().unwrap().sink().attempted_bytes;
        assert!(attempted > 0 && attempted <= PARSE_BATCH_SIZE);
        assert_eq!(input.uncompressed_bytes_read(), 0);
        assert!(input.prefix.len() <= PREFIX_SIZE);
    }

    #[test]
    fn parser_sink_does_not_accept_more_than_one_batch_per_write() {
        let mut sink = ParserSink {
            parser: TraceParser::new(Arc::new(StoreContainer::new())),
            bytes_read: 0,
            attempted_bytes: 0,
            parser_pushes: 0,
        };
        let mut bytes = b"TRACEv1".to_vec();
        // TimestampBase(0) rows avoid creating a large store in this test.
        bytes.extend([7, 0].repeat(PARSE_BATCH_SIZE));
        assert_eq!(sink.write(&bytes).unwrap(), PARSE_BATCH_SIZE);
        assert_eq!(sink.bytes_read, PARSE_BATCH_SIZE);
    }

    #[test]
    fn raw_chunks_keep_the_callers_batch_size() {
        let mut input = input();
        input.push(b"TRACEv1").unwrap();
        let before = input.compression.as_ref().unwrap().sink().parser_pushes;
        let chunk = [7, 0].repeat(PARSE_BATCH_SIZE * 2);
        input.push(&chunk).unwrap();
        assert_eq!(
            input.compression.as_ref().unwrap().sink().parser_pushes,
            before + 1
        );
        assert_eq!(input.uncompressed_bytes_read(), 7 + chunk.len());
    }

    #[test]
    fn raw_and_gzip_support_arbitrary_small_chunk_boundaries() {
        let mut raw = b"TRACEv1".to_vec();
        raw.extend([7, 0].repeat(20));
        for bytes in [&raw, &gzip(&raw)] {
            for chunk_size in 1..=bytes.len() {
                let mut input = input();
                for chunk in bytes.chunks(chunk_size) {
                    input.push(chunk).unwrap();
                }
                assert_eq!(input.uncompressed_bytes_read(), raw.len());
                assert!(input.prefix.len() <= PREFIX_SIZE);
                let _ = input.stats();
            }
        }
    }

    #[test]
    fn valid_gzip_can_expand_beyond_a_batch_without_a_total_size_limit() {
        let mut raw = b"TRACEv1".to_vec();
        raw.extend([7, 0].repeat(PARSE_BATCH_SIZE * 2));
        let mut input = input();
        input.push(&gzip(&raw)).unwrap();
        assert_eq!(input.uncompressed_bytes_read(), raw.len());
    }

    #[test]
    fn malformed_deflate_errors_are_not_swallowed() {
        // Minimal gzip header, followed by the reserved DEFLATE block type.
        let compressed = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0, 0x07, 0, 0];
        assert!(input().push(&compressed).is_err());
    }

    #[test]
    fn rejects_zstd_and_old_trace_versions() {
        assert!(
            input()
                .push(&[0x28, 0xb5, 0x2f, 0xfd])
                .unwrap_err()
                .to_string()
                .contains("zstd-compressed traces are not supported")
        );
        assert!(
            input()
                .push(&gzip(b"TRACEv0"))
                .unwrap_err()
                .to_string()
                .contains("Unsupported trace file version")
        );
    }
}
