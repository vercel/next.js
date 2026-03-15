#![no_main]

use std::io::Write;

use libfuzzer_sys::fuzz_target;
use lzzzz::lz4;
use tempfile::tempdir;
use turbo_persistence::static_sorted_file::{StaticSortedFile, StaticSortedFileMetaData};

fn compress(data: &[u8]) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    lz4::compress_to_vec(data, &mut buf, lz4::ACC_LEVEL_DEFAULT).ok()?;
    Some(buf)
}

fn decompress(data: &[u8], uncompressed_len: usize) -> Option<Vec<u8>> {
    let mut buf = vec![0u8; uncompressed_len];
    lzzzz::lz4::decompress(data, &mut buf).ok()?;
    Some(buf)
}

fuzz_target!(|data: &[u8]| {
    if data.len() < 8 {
        return;
    }

    {
        let payload = &data[8..];
        if !payload.is_empty() {
            if let Some(compressed) = compress(payload) {
                match decompress(&compressed, payload.len()) {
                    Some(result) => assert_eq!(result, payload, "compression roundtrip mismatch"),
                    None => panic!("decompression failed on data we just compressed"),
                }
            }
        }
    }

    {
        let uncompressed_len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        if uncompressed_len > 0 && uncompressed_len <= 64 * 1024 * 1024 {
            let _ = decompress(&data[4..], uncompressed_len);
        }
    }

    {
        let sequence_number = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        let block_count = u16::from_le_bytes([data[4], data[5]]);
        if block_count == 0 {
            return;
        }
        let offset_table_size = (block_count as usize).saturating_mul(4);
        if data.len() <= offset_table_size {
            return;
        }

        let dir = match tempdir() {
            Ok(d) => d,
            Err(_) => return,
        };
        let sst_path = dir.path().join(format!("{:08}.sst", sequence_number));
        let mut f = match std::fs::File::create(&sst_path) {
            Ok(f) => f,
            Err(_) => return,
        };
        if f.write_all(data).is_err() {
            return;
        }
        drop(f);

        let meta = StaticSortedFileMetaData { sequence_number, block_count };
        let _ = StaticSortedFile::open(dir.path(), meta);
    }
});