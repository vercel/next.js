use std::{
    io::{self, BufWriter, Write},
    path::Path,
};

use anyhow::{Context, Result};
use byteorder::{BE, WriteBytesExt};
use fs_err::File;
use zerocopy::IntoBytes;

use crate::{
    Compression,
    meta_file::{EntryHeader, META_FILE_MAGIC},
    static_sorted_file_builder::StaticSortedFileBuilderMeta,
};

pub struct MetaFileBuilder<'a> {
    family: u32,
    compression: Compression,
    /// Entries in the meta file, tuples of (sequence_number, StaticSortedFileBuilderMetaResult)
    entries: Vec<(u32, StaticSortedFileBuilderMeta<'a>)>,
    /// Obsolete SST files, represented by their sequence numbers
    obsolete_sst_files: Vec<u32>,
}

impl<'a> MetaFileBuilder<'a> {
    pub fn new(family: u32, compression: Compression) -> Self {
        Self {
            family,
            compression,
            entries: Vec::new(),
            obsolete_sst_files: Vec::new(),
        }
    }

    pub fn add(&mut self, sequence_number: u32, sst: StaticSortedFileBuilderMeta<'a>) {
        self.entries.push((sequence_number, sst));
    }

    pub fn add_obsolete_sst_file(&mut self, sequence_number: u32) {
        self.obsolete_sst_files.push(sequence_number);
    }

    #[tracing::instrument(level = "trace", skip_all)]
    pub fn write(self, db_path: &Path, seq: u32) -> Result<(File, u64)> {
        let file = db_path.join(format!("{seq:08}.meta"));
        self.write_internal(&file)
            .with_context(|| format!("Unable to write meta file {seq:08}.meta"))
    }

    fn write_internal(mut self, file: &Path) -> io::Result<(File, u64)> {
        // Wrap the writer to count the bytes written, so callers can accumulate written-byte totals
        // without stat'ing the file afterwards.
        let mut file = CountingWriter::new(BufWriter::new(File::create(file)?));
        file.write_u32::<BE>(META_FILE_MAGIC)?; // Magic number
        file.write_u32::<BE>(self.family)?;
        file.write_u8(self.compression as u8)?;

        self.obsolete_sst_files.sort();
        file.write_u32::<BE>(self.obsolete_sst_files.len() as u32)?;
        for obsolete_sst in &self.obsolete_sst_files {
            file.write_u32::<BE>(*obsolete_sst)?;
        }

        file.write_u32::<BE>(self.entries.len() as u32)?;

        let mut amqf_offset = 0;
        for (sequence_number, sst) in &self.entries {
            amqf_offset += sst.amqf.len();
            let header = EntryHeader::new(
                *sequence_number,
                sst.block_count,
                sst.min_hash,
                sst.max_hash,
                sst.size,
                sst.flags,
                u32::try_from(sst.entries).unwrap_or(u32::MAX),
                u32::try_from(sst.tombstones).unwrap_or(u32::MAX),
                amqf_offset as u32,
            );
            file.write_all(header.as_bytes())?;
        }

        for (_, sst) in &self.entries {
            file.write_all(&sst.amqf)?;
        }
        let bytes_written = file.bytes_written();
        let file = file.into_inner().into_inner()?;
        Ok((file, bytes_written))
    }
}

/// A [`Write`] adapter that counts the total number of bytes written through it, so writers can
/// report their on-disk size without an extra `stat`/`stream_position` syscall.
struct CountingWriter<W> {
    inner: W,
    bytes_written: u64,
}

impl<W> CountingWriter<W> {
    fn new(inner: W) -> Self {
        Self {
            inner,
            bytes_written: 0,
        }
    }

    fn bytes_written(&self) -> u64 {
        self.bytes_written
    }

    fn into_inner(self) -> W {
        self.inner
    }
}

impl<W: Write> Write for CountingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.bytes_written += n as u64;
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
